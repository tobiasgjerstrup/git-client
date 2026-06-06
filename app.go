package main

import (
	"context"
	"fmt"
	"os/exec"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
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
	return folder
}

func (a *App) RunGitStatus(path string) (string, error) {
	fmt.Println("Running git status in:", path)
	cmd := exec.Command("git", "-C", path, "status");
	out, err := cmd.CombinedOutput()
	if (err != nil) {
		fmt.Println("Error running git status:", err)
		return string(out), err
	}

	fmt.Println("Git status output:", string(out))
	return string(out), err
}
