package git

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var (
	ErrBatchClosed    = errors.New("batch process is closed")
	ErrObjectNotFound = errors.New("object not found")
	ErrBatchUnhealthy = errors.New("batch process is unhealthy")
	ErrObjectTooLarge = errors.New("object exceeds maximum size")
)

const (
	defaultMaxObjectSize = 100 * 1024 * 1024
)

type pendingReq struct {
	ch        chan batchResponse
	cancelled atomic.Bool
}

type batchResponse struct {
	obj *Object
	err error
}

type BatchProcess struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Reader
	stderr io.ReadCloser

	stdinMu   sync.Mutex
	pendingMu sync.Mutex
	pending   []*pendingReq

	ctx       context.Context
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	closed    atomic.Bool
	unhealthy atomic.Bool

	maxObjectSize int64
	repoPath      string
}

// NewBatchProcess constructs a batch process controller for reading git objects.
func NewBatchProcess(maxObjectSize int64) *BatchProcess {
	if maxObjectSize <= 0 {
		maxObjectSize = defaultMaxObjectSize
	}
	return &BatchProcess{
		maxObjectSize: maxObjectSize,
	}
}

// Start launches the git cat-file --batch process for the repository.
func (bp *BatchProcess) Start(ctx context.Context, repoPath string) error {
	bp.repoPath = repoPath

	bp.ctx, bp.cancel = context.WithCancel(ctx)

	gitCommandMu.RLock()
	cmd := gitCommand
	cmdArgs := gitCommandArgs
	gitCommandMu.RUnlock()

	allArgs := append(cmdArgs, "-C", repoPath, "cat-file", "--batch")
	bp.cmd = exec.CommandContext(bp.ctx, cmd, allArgs...)
	bp.cmd.SysProcAttr = newSysProcAttr()

	var err error
	bp.stdin, err = bp.cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("create stdin pipe: %w", err)
	}

	stdoutPipe, err := bp.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("create stdout pipe: %w", err)
	}
	bp.stdout = bufio.NewReader(stdoutPipe)

	bp.stderr, err = bp.cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("create stderr pipe: %w", err)
	}

	if err := bp.cmd.Start(); err != nil {
		return fmt.Errorf("start cat-file: %w", err)
	}

	bp.wg.Add(2)
	go bp.readStdout()
	go bp.readStderr()

	return nil
}

// Request sends an object spec to the batch process and waits for the resulting object.
func (bp *BatchProcess) Request(ctx context.Context, spec string) (*Object, error) {
	if bp.closed.Load() {
		return nil, ErrBatchClosed
	}
	if bp.unhealthy.Load() {
		return nil, ErrBatchUnhealthy
	}

	req := &pendingReq{
		ch: make(chan batchResponse, 1),
	}

	bp.pendingMu.Lock()
	bp.pending = append(bp.pending, req)
	bp.pendingMu.Unlock()

	bp.stdinMu.Lock()
	_, err := fmt.Fprintf(bp.stdin, "%s\n", spec)
	bp.stdinMu.Unlock()
	if err != nil {
		req.cancelled.Store(true)
		return nil, fmt.Errorf("write to batch stdin: %w", err)
	}

	select {
	case resp := <-req.ch:
		if resp.err != nil {
			return nil, resp.err
		}
		return resp.obj, nil
	case <-ctx.Done():
		req.cancelled.Store(true)
		return nil, ctx.Err()
	case <-bp.ctx.Done():
		req.cancelled.Store(true)
		return nil, ErrBatchClosed
	}
}

// IsHealthy reports whether the batch process is ready to service requests.
func (bp *BatchProcess) IsHealthy() bool {
	return !bp.closed.Load() && !bp.unhealthy.Load()
}

// RepoPath returns the repository path currently attached to this batch process.
func (bp *BatchProcess) RepoPath() string {
	return bp.repoPath
}

// Close gracefully shuts down the batch process and cancels pending requests.
func (bp *BatchProcess) Close() error {
	if bp.closed.Swap(true) {
		return nil
	}

	bp.cancel()

	bp.pendingMu.Lock()
	for _, req := range bp.pending {
		req.cancelled.Store(true)
		select {
		case req.ch <- batchResponse{err: ErrBatchClosed}:
		default:
		}
	}
	bp.pendingMu.Unlock()

	if bp.stdin != nil {
		bp.stdin.Close()
	}

	done := make(chan struct{})
	go func() {
		bp.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		if bp.cmd != nil && bp.cmd.Process != nil {
			bp.cmd.Process.Kill()
		}
	}

	if bp.cmd != nil {
		bp.cmd.Wait()
	}

	return nil
}

// readStdout processes stdout lines from the git cat-file batch process and routes object responses.
func (bp *BatchProcess) readStdout() {
	defer bp.wg.Done()

	for {
		header, err := bp.stdout.ReadString('\n')
		if err != nil {
			if !bp.closed.Load() {
				bp.unhealthy.Store(true)
			}
			return
		}

		header = strings.TrimSpace(header)
		if header == "" {
			continue
		}

		parts := strings.SplitN(header, " ", 3)
		if len(parts) < 2 {
			if len(parts) == 1 {
				bp.deliverResponse(nil, fmt.Errorf("%w: %s", ErrObjectNotFound, parts[0]))
			} else {
				bp.deliverResponse(nil, fmt.Errorf("unexpected cat-file output: %q", header))
			}
			continue
		}

		objHash := parts[0]
		objType := ObjectType(parts[1])
		objSize := int64(0)
		if len(parts) >= 3 {
			objSize, err = strconv.ParseInt(parts[2], 10, 64)
			if err != nil {
				bp.deliverResponse(nil, fmt.Errorf("parse object size: %w", err))
				bp.unhealthy.Store(true)
				return
			}
		}

		if objSize > bp.maxObjectSize {
			bp.deliverResponse(nil, ErrObjectTooLarge)
			bp.stdout.Discard(int(objSize) + 1)
			continue
		}

		content := make([]byte, objSize)
		if _, err := io.ReadFull(bp.stdout, content); err != nil {
			if !bp.closed.Load() {
				bp.unhealthy.Store(true)
			}
			return
		}

		terminator, err := bp.stdout.ReadByte()
		if err != nil {
			if !bp.closed.Load() {
				bp.unhealthy.Store(true)
			}
			return
		}
		if terminator != '\n' {
			continue
		}

		bp.deliverResponse(&Object{
			Hash: objHash,
			Type: objType,
			Size: objSize,
			Raw:  content,
		}, nil)
	}
}

// readStderr consumes stderr from the batch process to avoid blocking and detect failures.
func (bp *BatchProcess) readStderr() {
	defer bp.wg.Done()

	scanner := bufio.NewScanner(bp.stderr)
	for scanner.Scan() {
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintf(io.Discard, "[git stderr] scanner error: %v\n", err)
	}
}

// deliverResponse dispatches a batch response to the next pending request.
func (bp *BatchProcess) deliverResponse(obj *Object, err error) {
	bp.pendingMu.Lock()
	if len(bp.pending) == 0 {
		bp.pendingMu.Unlock()
		return
	}
	req := bp.pending[0]
	bp.pending = bp.pending[1:]
	bp.pendingMu.Unlock()

	if req.cancelled.Load() {
		return
	}

	select {
	case req.ch <- batchResponse{obj: obj, err: err}:
	default:
	}
}

// Ping verifies that the batch process can accept requests within a given timeout.
func (bp *BatchProcess) Ping(timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(bp.ctx, timeout)
	defer cancel()

	_, err := bp.Request(ctx, "HEAD")
	return err
}
