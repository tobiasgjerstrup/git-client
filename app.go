package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx      context.Context
	repoPath string
}

type Commit struct {
	Hash    string `json:"hash"`
	Author  string `json:"author"`
	Date    string `json:"date"`
	Message string `json:"message"`
}

type GitStatusResult struct {
	Files      []string `json:"files"`
	BranchName string   `json:"branchName"`
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

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

func (a *App) PickFolder() string {
	folder, _ := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select a folder",
	})
	if folder != "" {
		a.repoPath = folder
	}
	return folder
}

func (a *App) RunGitStatus(path string) (*GitStatusResult, error) {
	if path != "" {
		a.repoPath = path
	}

	effectivePath := path
	if effectivePath == "" {
		effectivePath = a.repoPath
	}
	out, err := runCommand("git", "-C", effectivePath, "status", "--porcelain=v2", "--branch")
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
		Files:      files,
		BranchName: branchName,
	}, nil
}

func (a *App) GitDiff() (*GitDiffResult, error) {
	out, err := runCommand("git", "-C", a.repoPath, "--no-pager", "diff")
	if err != nil {
		return nil, err
	}

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

	// Git diffs do not include completely new files. So we add them here.
	out, err = runCommand("git", "-C", a.repoPath, "ls-files", "--others", "--exclude-standard")
	if err != nil {
		return nil, err
	}

	lines = strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSuffix(line, "\r")
		if line == "" {
			continue
		}

		abs := filepath.Join(a.repoPath, line)
		data, err := os.ReadFile(abs)
		if err != nil {
			continue
		}

		// Build a synthetic diff for new files
		diff := fmt.Sprintf(
			"diff --git a/%s b/%s\nnew file mode 100644\n--- /dev/null\n+++ b/%s\n",
			line, line, line,
		)

		// Count lines + build diff body
		added := 0
		scanner := bufio.NewScanner(bytes.NewReader(data))
		for scanner.Scan() {
			diff += "+" + scanner.Text() + "\n"
			added++
		}

		files = append(files, GitDiffFile{
			Path:         line,
			Diff:         diff,
			LinesAdded:   added,
			LinesRemoved: 0,
		})
	}

	return &GitDiffResult{
		Files: files,
	}, nil
}

func (a *App) GetCommitHistory() (*[]Commit, error) {
	out, err := runCommand("git", "-C", a.repoPath, "log", "--pretty=format:%H|%an|%ad|%s", "--date=iso")
	if err != nil {
		fmt.Printf("Error getting git log: %v\n", err)
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

func (a *App) StageGitFile(filePath string) error {
	return a.runGitForRepo("add", "--", filePath)
}

func (a *App) CommitGitChanges(message string) error {
	commandArgs := []string{"commit", "-m", message}
	_, err := runCommand("git", append([]string{"-C", a.repoPath}, commandArgs...)...)
	if err != nil {
		return err
	}
	return nil
}

func (a *App) SwitchGitBranch(branchName string) error {
	commandArgs := []string{"-C", a.repoPath, "switch", branchName}

	// Attempt to switch to branch
	_, err := runCommand("git", commandArgs...)
	if err == nil {
		return nil
	}

	commandArgs = []string{"-C", a.repoPath, "switch", "-c", branchName}
	_, err = runCommand("git", append([]string{"-C", a.repoPath}, commandArgs...)...)
	if err != nil {
		fmt.Printf("Error switching/creating branch: %v\n", err)
		return err
	}
	return nil
}

func (a *App) PushGitChanges() error {
	commandArgs := []string{"push"}
	_, err := runCommand("git", append([]string{"-C", a.repoPath}, commandArgs...)...)
	if err == nil {
		return nil
	}

	if strings.Contains(err.Error(), "has no upstream branch.") {
		commandArgs = []string{"push", "--set-upstream", "origin", "HEAD"}
		_, err = runCommand("git", append([]string{"-C", a.repoPath}, commandArgs...)...)
		if err != nil {
			fmt.Printf("Error pushing with upstream: %v\n", err)
			return err
		}
		return nil
	}
	fmt.Printf("Error pushing changes: %v\n", err)
	return err
}

func (a *App) PullGitChanges() error {
	commandArgs := []string{"pull"}
	_, err := runCommand("git", append([]string{"-C", a.repoPath}, commandArgs...)...)
	if err != nil {
		return err
	}
	return nil
}

func (a *App) UnstageGitFile(filePath string) error {
	return a.runGitForRepo("restore", "--staged", "--", filePath)
}

func (a *App) runGitForRepo(args ...string) error {
	if a.repoPath == "" {
		return fmt.Errorf("no repository selected")
	}

	commandArgs := append([]string{"-C", a.repoPath}, args...)
	_, err := runCommand("git", commandArgs...)
	if err != nil {
		return err
	}

	return nil
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
	fmt.Printf("Running command: %s %s\n", name, strings.Join(args, " "))
	cmd := exec.Command(name, args...)
	configureCommand(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}
