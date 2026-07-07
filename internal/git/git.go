package git

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const gitPathPairSeparator = "\t"

var (
	gitCommand      = "git"
	gitCommandArgs  []string
	gitLauncherPath string
	gitCommandMu    sync.RWMutex
)

func SetGitCommand(command string) {
	if command == "" {
		return
	}
	gitCommandMu.Lock()
	defer gitCommandMu.Unlock()

	cleanupGitLauncherLocked()

	gitCommand = command
	gitCommandArgs = nil

	if _, err := exec.LookPath(command); err == nil {
		return
	}

	if runtime.GOOS != "windows" {
		return
	}

	if ps1Path, err := exec.LookPath(command + ".ps1"); err == nil {
		gitCommand = "powershell.exe"
		gitCommandArgs = []string{"-NoProfile", "-File", ps1Path}
		return
	}
	if cmdPath, err := exec.LookPath(command + ".cmd"); err == nil {
		gitCommand = cmdPath
		return
	}
	if batPath, err := exec.LookPath(command + ".bat"); err == nil {
		gitCommand = batPath
		return
	}

	f, err := os.CreateTemp("", "git-client-*-launcher.ps1")
	if err != nil {
		return
	}
	launcher := fmt.Sprintf("& %s @args\n", command)
	if _, err := f.WriteString(launcher); err != nil {
		f.Close()
		return
	}
	f.Close()
	gitLauncherPath = f.Name()
	gitCommand = "powershell.exe"
	gitCommandArgs = []string{"-File", gitLauncherPath}
}

func cleanupGitLauncherLocked() {
	if gitLauncherPath != "" {
		os.Remove(gitLauncherPath)
		gitLauncherPath = ""
	}
}

func CleanupGitCommand() {
	gitCommandMu.Lock()
	defer gitCommandMu.Unlock()
	cleanupGitLauncherLocked()
}

type GitStatusResult struct {
	Files           []string `json:"files"`
	BranchName      string   `json:"branchName"`
	MergeInProgress bool     `json:"mergeInProgress"`
}

type Commit struct {
	Hash    string `json:"hash"`
	Author  string `json:"author"`
	Date    string `json:"date"`
	Message string `json:"message"`
}

type GitDiffFile struct {
	Path         string `json:"path"`
	Diff         string `json:"diff"`
	LinesAdded   int    `json:"linesAdded"`
	LinesRemoved int    `json:"linesRemoved"`
}

type GitDiffResult struct {
	Files []GitDiffFile `json:"files"`
}

type GitBranch struct {
	Remote        bool   `json:"remote"`
	Name          string `json:"name"`
	CommitId      string `json:"commitId"`
	CommitsBehind int    `json:"commitsBehind"`
	CommitsAhead  int    `json:"commitsAhead"`
}

var defaultBranchCache = make(map[string]string)

func GitStatus(repoPath string) (*GitStatusResult, error) {
	out, err := runGitForRepo(repoPath, "status", "--porcelain=v2", "--branch")
	if err != nil {
		return nil, err
	}

	lines := strings.Split(string(out), "\n")
	files := []string{}
	branchName := ""

	for _, line := range lines {
		line = strings.TrimSuffix(line, "\r")
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "# branch.head ") {
			branchName = strings.TrimPrefix(line, "# branch.head ")
			continue
		}

		fileLine, ok := parsePorcelainV2FileLine(line)
		if !ok {
			continue
		}
		files = append(files, fileLine)
	}

	return &GitStatusResult{
		Files:           files,
		BranchName:      branchName,
		MergeInProgress: isMergeInProgress(repoPath),
	}, nil
}

func GitDiff(repoPath string) (*GitDiffResult, error) {
	out, err := runGitForRepo(repoPath, "--no-pager", "diff")
	if err != nil {
		return nil, err
	}

	result, err := parseDiffOutput(out)
	if err != nil {
		return nil, err
	}

	// Git diffs do not include completely new files. So we add them here.
	untrackedOut, err := runGitForRepo(repoPath, "ls-files", "--others", "--exclude-standard")
	if err != nil {
		return nil, err
	}

	for _, line := range strings.Split(string(untrackedOut), "\n") {
		line = strings.TrimSuffix(line, "\r")
		if line == "" {
			continue
		}

		abs := filepath.Join(repoPath, line)
		data, err := os.ReadFile(abs)
		if err != nil {
			continue
		}

		diff := fmt.Sprintf(
			"diff --git a/%s b/%s\nnew file mode 100644\n--- /dev/null\n+++ b/%s\n",
			line, line, line,
		)

		added := 0
		scanner := bufio.NewScanner(bytes.NewReader(data))
		for scanner.Scan() {
			diff += "+" + scanner.Text() + "\n"
			added++
		}

		result.Files = append(result.Files, GitDiffFile{
			Path:         line,
			Diff:         diff,
			LinesAdded:   added,
			LinesRemoved: 0,
		})
	}

	return result, nil
}

func GitDiffStaged(repoPath string) (*GitDiffResult, error) {
	out, err := runGitForRepo(repoPath, "--no-pager", "diff", "--cached")
	if err != nil {
		return nil, err
	}

	return parseDiffOutput(out)
}

func parseDiffOutput(out string) (*GitDiffResult, error) {

	lines := strings.Split(string(out), "\n")
	files := []GitDiffFile{}
	file := GitDiffFile{}
	for _, line := range lines {
		line = strings.TrimSuffix(line, "\r")
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "diff --git ") {
			// push the previous file if exists
			if file.Path != "" {
				files = append(files, file)
				file = GitDiffFile{}
			}

			// extract file path from line like: diff --git a/file.txt b/file.txt
			rest := strings.TrimPrefix(line, "diff --git ")
			idx := strings.LastIndex(rest, " b/")
			file.Path = rest[idx+3:]
			file.Path = strings.Trim(file.Path, "\"")
			continue
		}
		if file.Path != "" {
			file.Diff += line + "\n"
			if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
				file.LinesAdded++
				continue
			} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
				file.LinesRemoved++
				continue
			}
		}
	}
	// push the last file if exists
	if file.Path != "" {
		files = append(files, file)
	}

	return &GitDiffResult{
		Files: files,
	}, nil
}

func GetCommitHistory(repoPath string) (*[]Commit, error) {
	out, err := runGitForRepo(repoPath, "log", "--max-count=100", "--pretty=format:%H|%an|%ad|%s", "--date=iso")
	if err != nil {
		Errorf("Error getting git log: %v", err)
		return nil, err
	}

	commitLines := strings.Split(string(out), "\n")
	commits := []Commit{}
	for _, commit := range commitLines {
		parts := strings.SplitN(commit, "|", 4)
		if len(parts) < 4 {
			continue
		}
		commits = append(commits, Commit{
			Hash:    parts[0],
			Author:  parts[1],
			Date:    parts[2],
			Message: parts[3],
		})
	}

	return &commits, nil
}

func DiscardGitFile(repoPath string, filePath string) (string, error) {
	paths := splitGitActionPaths(filePath)
	if isRenameDiscardPayload(repoPath, paths) {
		originalPath := paths[0]
		currentPath := paths[1]

		if err := os.Remove(filepath.Join(repoPath, currentPath)); err != nil && !os.IsNotExist(err) {
			return "", err
		}

		return runGitForRepo(repoPath, "restore", "--worktree", "--source=HEAD", "--", originalPath)
	}

	for _, targetPath := range paths {
		// If a file is new (?? in git status), we need to remove it instead of restoring it
		fileStatus, err := runGitForRepo(repoPath, "status", "--porcelain", "--", targetPath)
		if err != nil {
			return "", err
		}

		if strings.HasPrefix(fileStatus, "??") {
			if err := os.Remove(filepath.Join(repoPath, targetPath)); err != nil && !os.IsNotExist(err) {
				return "", err
			}
			continue
		}

		if _, err := runGitForRepo(repoPath, "restore", "--", targetPath); err != nil {
			return "", err
		}
	}

	return "", nil
}

func StageGitFile(repoPath string, filePath string) (string, error) {
	paths := splitGitActionPaths(filePath)
	args := append([]string{"add", "--all", "--"}, paths...)
	return runGitForRepo(repoPath, args...)
}

func ResolveGitConflict(repoPath string, filePath string, strategy string) error {
	paths := splitGitActionPaths(filePath)
	if len(paths) == 0 {
		return fmt.Errorf("no conflict file path provided")
	}

	option := ""
	switch strings.ToLower(strings.TrimSpace(strategy)) {
	case "ours":
		option = "--ours"
	case "theirs":
		option = "--theirs"
	default:
		return fmt.Errorf("unsupported conflict resolution strategy: %s", strategy)
	}

	for _, targetPath := range paths {
		if _, err := runGitForRepo(repoPath, "checkout", option, "--", targetPath); err != nil {
			return err
		}
		if _, err := runGitForRepo(repoPath, "add", "--", targetPath); err != nil {
			return err
		}
	}

	return nil
}

func AbortGitMerge(repoPath string) error {
	if !isMergeInProgress(repoPath) {
		return fmt.Errorf("no merge in progress")
	}

	if _, err := runGitForRepo(repoPath, "merge", "--abort"); err == nil {
		return nil
	}

	_, err := runGitForRepo(repoPath, "reset", "--merge")
	return err
}

func ContinueGitMerge(repoPath string) error {
	if !isMergeInProgress(repoPath) {
		return fmt.Errorf("no merge in progress")
	}

	_, err := runGitForRepo(repoPath, "commit", "--no-edit")
	return err
}

func isMergeInProgress(repoPath string) bool {
	_, err := runGitForRepo(repoPath, "rev-parse", "--verify", "MERGE_HEAD")
	return err == nil
}

func CommitGitChanges(repoPath string, message string) error {
	_, err := runGitForRepo(repoPath, "commit", "-m", message)
	if err != nil {
		return err
	}
	return nil
}

func SwitchGitBranch(repoPath string, branchName string) error {
	// Attempt to switch to branch
	_, err := runGitForRepo(repoPath, "switch", branchName)
	if err == nil {
		return nil
	}

	// Only attempt branch creation if the switch failed because the branch is missing.
	// For all other failures (already on branch, local changes would be overwritten, etc.),
	// return the original switch error.
	if !isMissingBranchSwitchError(err) {
		Errorf("Error switching branch: %v", err)
		return err
	}

	// If a matching remote branch exists, create a local tracking branch.
	if _, remoteBranchErr := runGitForRepo(repoPath, "show-ref", "--verify", "--quiet", "refs/remotes/origin/"+branchName); remoteBranchErr == nil {
		_, err = runGitForRepo(repoPath, "switch", "-c", branchName, "--track", "origin/"+branchName)
	} else {
		_, err = runGitForRepo(repoPath, "switch", "-c", branchName)
	}

	if err != nil {
		Errorf("Error switching/creating branch: %v", err)
		return err
	}
	return nil
}

func isMissingBranchSwitchError(err error) bool {
	if err == nil {
		return false
	}

	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "invalid reference") ||
		strings.Contains(msg, "not found") ||
		strings.Contains(msg, "unknown revision") ||
		strings.Contains(msg, "could not resolve") ||
		strings.Contains(msg, "cannot find")
}

func DeleteGitBranch(repoPath string, branchName string, force bool) error {
	currentBranch, err := runGitForRepo(repoPath, "branch", "--show-current")
	if err != nil {
		return err
	}

	if strings.TrimSpace(currentBranch) == branchName {
		return fmt.Errorf("cannot delete the current branch")
	}

	deleteFlag := "-d"
	if force {
		deleteFlag = "-D"
	}

	_, err = runGitForRepo(repoPath, "branch", deleteFlag, branchName)
	return err
}

func PushGitChanges(repoPath string) error {
	_, err := runGitForRepo(repoPath, "push")
	if err == nil {
		return nil
	}

	if strings.Contains(err.Error(), "has no upstream branch.") {
		_, err = runGitForRepo(repoPath, "push", "--set-upstream", "origin", "HEAD")
		if err != nil {
			Errorf("Error pushing with upstream: %v", err)
			return err
		}
		return nil
	}
	Errorf("Error pushing changes: %v", err)
	return err
}

func PullGitChanges(repoPath string) error {
	_, err := runGitForRepo(repoPath, "pull")
	if err != nil {
		return err
	}
	return nil
}

func UnstageGitFile(repoPath string, filePath string) (string, error) {
	paths := splitGitActionPaths(filePath)
	args := append([]string{"restore", "--staged", "--"}, paths...)
	return runGitForRepo(repoPath, args...)
}

func splitGitActionPaths(filePath string) []string {
	parts := strings.Split(filePath, gitPathPairSeparator)
	paths := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		paths = append(paths, part)
	}
	if len(paths) == 0 {
		return []string{filePath}
	}
	return paths
}

func isRenameDiscardPayload(repoPath string, paths []string) bool {
	if len(paths) != 2 {
		return false
	}

	out, err := runGitForRepo(repoPath, "status", "--porcelain=v2", "--", paths[0], paths[1])
	if err != nil {
		return false
	}

	lines := 0
	for _, line := range strings.Split(out, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		lines++
		if lines > 1 {
			return false
		}
	}

	return lines == 1 && strings.HasPrefix(strings.TrimSpace(out), "2 ")
}

func GetGitBranches(repoPath string) (*[]GitBranch, error) {
	var wg sync.WaitGroup
	wg.Add(3)

	var localOut string
	var remoteOut string
	var localErr error
	var remoteErr error
	var defaultBranch string
	var defaultBranchErr error

	go func() {
		defer wg.Done()
		localOut, localErr = runGitForRepo(
			repoPath,
			"for-each-ref",
			"--format=%(refname)|%(objectname)",
			"refs/heads",
		)
	}()

	go func() {
		defer wg.Done()
		remoteOut, remoteErr = runGitForRepo(
			repoPath,
			"for-each-ref",
			"--sort=-committerdate",
			"--count=20",
			"--format=%(refname)|%(objectname)",
			"refs/remotes/origin",
		)
	}()

	go func() {
		defer wg.Done()
		defaultBranch, defaultBranchErr = getDefaultBranch(repoPath)
	}()

	wg.Wait()

	if localErr != nil {
		return nil, localErr
	}
	if remoteErr != nil {
		return nil, remoteErr
	}
	if defaultBranchErr != nil {
		Warnf("Error getting default branch: %v", defaultBranchErr)
		return nil, defaultBranchErr
	}

	out := localOut + "\n" + remoteOut

	defaultBranch = "origin/" + defaultBranch
	lines := strings.Split(string(out), "\n")
	branches := make([]GitBranch, len(lines))
	validBranches := make([]bool, len(lines))

	for i, line := range lines {
		line = strings.TrimSuffix(line, "\r")
		if line == "" {
			continue
		}

		wg.Add(1)
		go func(i int, line string) {
			defer wg.Done()
			remote := false
			nameAndHash := []string{}
			commitsBehind := 0
			commitsAhead := 0
			out, err := runGitForRepo(repoPath, "rev-list", "--left-right", "--count", fmt.Sprintf("%s...%s", strings.Split(line, "|")[0], defaultBranch))
			if err != nil {
				Warnf("Error getting rev-list: %v", err)
				return
			}
			parts := strings.Split(strings.TrimSpace(out), "\t")
			// fmt.Printf("Rev-list output: %q\n", out)
			// fmt.Printf("Rev-list parts: %#v\n", parts)

			if len(parts) >= 2 {
				ahead, err1 := strconv.Atoi(strings.TrimSpace(parts[0]))
				behind, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))

				if err1 == nil && err2 == nil {
					commitsAhead = ahead
					commitsBehind = behind
				} else {
					Warnf("Parse error: %v %v", err1, err2)
				}
			}
			if strings.HasPrefix(line, "refs/remotes/") && strings.Contains(line, "/HEAD|") {
				return
			}
			if strings.HasPrefix(line, "refs/remotes/origin/") {
				remote = true
				nameAndHash = strings.SplitN(strings.TrimPrefix(line, "refs/remotes/"), "|", 2)
			} else {
				nameAndHash = strings.SplitN(strings.TrimPrefix(line, "refs/heads/"), "|", 2)
			}
			if len(nameAndHash) < 2 || strings.TrimSpace(nameAndHash[0]) == "" {
				return
			}

			branch := GitBranch{
				Remote:        remote,
				Name:          nameAndHash[0],
				CommitId:      nameAndHash[1],
				CommitsBehind: commitsBehind,
				CommitsAhead:  commitsAhead,
			}

			branches[i] = branch
			validBranches[i] = true
		}(i, line)
	}

	wg.Wait()

	orderedBranches := make([]GitBranch, 0, len(branches))
	for i, branch := range branches {
		if !validBranches[i] {
			continue
		}
		orderedBranches = append(orderedBranches, branch)
	}

	return &orderedBranches, nil
}

func GitFetch(repoPath string) (string, error) {
	return runGitForRepo(repoPath, "fetch")
}

func GitPrune(repoPath string) (string, error) {
	return runGitForRepo(repoPath, "fetch", "--prune")
}

func parsePorcelainV2FileLine(line string) (string, bool) {
	switch {
	case strings.HasPrefix(line, "1 "):
		// 1 <xy> <sub> <mH> <mI> <mW> <hH> <hI> <path>
		parts := strings.SplitN(strings.TrimPrefix(line, "1 "), " ", 8)
		if len(parts) < 8 {
			return "", false
		}
		return fmt.Sprintf("%s %s", parts[0], parts[7]), true
	case strings.HasPrefix(line, "2 "):
		// 2 <xy> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\t<origPath>
		parts := strings.SplitN(strings.TrimPrefix(line, "2 "), " ", 9)
		if len(parts) < 9 {
			return "", false
		}
		path := parts[8]
		if tabIdx := strings.Index(path, "\t"); tabIdx >= 0 {
			path = path[:tabIdx]
		}
		return fmt.Sprintf("%s %s", parts[0], path), true
	case strings.HasPrefix(line, "u "):
		// u <xy> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
		parts := strings.SplitN(strings.TrimPrefix(line, "u "), " ", 10)
		if len(parts) < 10 {
			return "", false
		}
		return fmt.Sprintf("%s %s", parts[0], parts[9]), true
	case strings.HasPrefix(line, "? "):
		return "?? " + strings.TrimPrefix(line, "? "), true
	case strings.HasPrefix(line, "! "):
		return "!! " + strings.TrimPrefix(line, "! "), true
	default:
		return "", false
	}
}

func runCommand(name string, args ...string) (string, error) {
	start := time.Now()
	defer func() {
		Debugf("Command finished in %v", time.Since(start))
	}()

	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = newSysProcAttr()

	out, err := cmd.CombinedOutput()
	Debugf("Ran command: %s %s", name, strings.Join(args, " "))
	if err != nil {
		return "", fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func runGitForRepo(repoPath string, args ...string) (string, error) {
	if repoPath == "" {
		return "", fmt.Errorf("no repository selected")
	}

	gitCommandMu.RLock()
	cmd := gitCommand
	cmdArgs := gitCommandArgs
	gitCommandMu.RUnlock()

	commandArgs := append(cmdArgs, "-C", repoPath)
	commandArgs = append(commandArgs, args...)
	out, err := runCommand(cmd, commandArgs...)
	if err != nil {
		return "", err
	}

	return out, nil
}

func getDefaultBranch(repoPath string) (string, error) {
	if branch, ok := defaultBranchCache[repoPath]; ok {
		return branch, nil
	}

	out, err := runGitForRepo(repoPath,
		"ls-remote", "--symref", "origin", "HEAD",
	)
	if err != nil {
		return "", err
	}

	for _, line := range strings.Split(out, "\n") {
		if strings.HasPrefix(line, "ref: ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				defaultBranchCache[repoPath] = strings.TrimPrefix(parts[1], "refs/heads/")
				return strings.TrimPrefix(parts[1], "refs/heads/"), nil
			}
		}
	}

	return "", fmt.Errorf("default branch not found")
}

/*
func getDefaultBranch(repoPath string) (string, error) {
	out, err := runGitForRepo(repoPath, "remote", "show", "origin")
	if err != nil {
		return "", err
	}

	lines := strings.Split(out, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "HEAD branch:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "HEAD branch:")), nil
		}
	}

	return "", fmt.Errorf("default branch not found")
}
*/
