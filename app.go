package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"tobiasgitclient/internal/git"
)

// App struct
type App struct {
	ctx      context.Context
	repoPath string
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

func (a *App) PickFolder() string {
	folder, _ := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select a folder",
	})
	if folder != "" {
		a.repoPath = folder
	}
	return folder
}

func (a *App) RunGitStatus() (*git.GitStatusResult, error) {
	return git.GitStatus(a.repoPath)	
}

func (a *App) GitFetch() (string, error) {
	return a.runGitForRepo("fetch")
}

func (a *App) GitDiff() (*git.GitDiffResult, error) {
	return git.GitDiff(a.repoPath)	
}

func (a *App) GetCommitHistory() (*[]git.Commit, error) {
	out, err := runCommand("git", "-C", a.repoPath, "log", "--max-count=100", "--pretty=format:%H|%an|%ad|%s", "--date=iso")
	if err != nil {
		fmt.Printf("Error getting git log: %v\n", err)
		return nil, err
	}

	commitLines := strings.Split(string(out), "\n")
	commits := []git.Commit{}
	for _, commit := range commitLines {
		parts := strings.SplitN(commit, "|", 4)
		if len(parts) < 4 {
			continue
		}
		commits = append(commits, git.Commit{
			Hash:    parts[0],
			Author:  parts[1],
			Date:    parts[2],
			Message: parts[3],
		})
	}

	return &commits, nil
}

func (a *App) DiscardGitFile(filePath string) (string, error) {
	// If a file is new (?? in git status), we need to remove it instead of restoring it
	fileStatus, err := runCommand("git", "-C", a.repoPath, "status", "--porcelain", "--", filePath)
	if err != nil {
		return "", err
	}

	if strings.HasPrefix(fileStatus, "??") {
		return "", os.Remove(filePath)
	}
	return a.runGitForRepo("restore", "--", filePath)
}

func (a *App) StageGitFile(filePath string) (string, error) {
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

func (a *App) UnstageGitFile(filePath string) (string, error) {
	return a.runGitForRepo("restore", "--staged", "--", filePath)
}

func (a *App) GetGitBranches() (*[]git.GitBranch, error) {
	// all branches:
	//out, err := runCommand("git", "-C", a.repoPath, "for-each-ref", "--format=%(refname)|%(objectname)", "refs/heads", "refs/remotes")

	// only local branches:
	out, err := runCommand("git", "-C", a.repoPath, "for-each-ref", "--format=%(refname)|%(objectname)", "refs/heads")
	if err != nil {
		return nil, err
	}

	cloudBranches, err := runCommand("git", "-C", a.repoPath, "for-each-ref", "--sort=-committerdate", "--count=20", "--format=%(refname)|%(objectname)", "refs/remotes/origin")
	if err != nil {
		return nil, err
	}
	out += "\n" + cloudBranches

	defaultBranch, err := getDefaultBranch(a.repoPath)
	if err != nil {
		fmt.Printf("Error getting default branch: %v\n", err)
		return nil, err
	}
	defaultBranch = "origin/" + defaultBranch
	lines := strings.Split(string(out), "\n")
	branches := []git.GitBranch{}
	for _, line := range lines {
		line = strings.TrimSuffix(line, "\r")
		if line == "" {
			continue
		}

		remote := false
		nameAndHash := []string{}
		commitsBehind := 0
		commitsAhead := 0
		// Compare branches to the current HEAD.
		//out, err = runCommand("git", "-C", a.repoPath, "rev-list", "--left-right", "--count", fmt.Sprintf("%s...HEAD", strings.Split(strings.TrimPrefix(line, "refs/remotes/origin/"), "|")[0]))
		if err != nil {
			fmt.Printf("Error getting default branch: %v\n", err)
			return nil, err
		}
		out, err = runCommand("git", "-C", a.repoPath, "rev-list", "--left-right", "--count", fmt.Sprintf("%s...%s", strings.Split(line, "|")[0], defaultBranch))
		parts := strings.Split(strings.TrimSpace(out), "\t")
		fmt.Printf("Rev-list output: %q\n", out)
		fmt.Printf("Rev-list parts: %#v\n", parts)

		if len(parts) >= 2 {
			ahead, err1 := strconv.Atoi(strings.TrimSpace(parts[0]))
			behind, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))

			if err1 == nil && err2 == nil {
				commitsAhead = ahead
				commitsBehind = behind
			} else {
				fmt.Println("Parse error:", err1, err2)
			}
		}
		if strings.HasPrefix(line, "refs/remotes/") && strings.Contains(line, "/HEAD|") {
			continue
		}
		if strings.HasPrefix(line, "refs/remotes/origin/") {
			remote = true
			nameAndHash = strings.SplitN(strings.TrimPrefix(line, "refs/remotes/"), "|", 2)
		} else {
			nameAndHash = strings.SplitN(strings.TrimPrefix(line, "refs/heads/"), "|", 2)
		}
		fmt.Printf("Branch: %s, Remote: %v, Commits Behind: %d, Commits Ahead: %d\n", nameAndHash[0], remote, commitsBehind, commitsAhead)
		branches = append(branches, git.GitBranch{
			Remote:        remote,
			Name:          nameAndHash[0],
			CommitId:      nameAndHash[1],
			CommitsBehind: commitsBehind,
			CommitsAhead:  commitsAhead,
		})
	}

	return &branches, nil

}

func (a *App) runGitForRepo(args ...string) (string, error) {
	if a.repoPath == "" {
		return "", fmt.Errorf("no repository selected")
	}

	commandArgs := append([]string{"-C", a.repoPath}, args...)
	out, err := runCommand("git", commandArgs...)
	if err != nil {
		return "", err
	}

	return out, nil
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

func getDefaultBranch(repoPath string) (string, error) {
	out, err := runCommand("git", "-C", repoPath, "remote", "show", "origin")
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
