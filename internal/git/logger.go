package git

import (
	"fmt"
	"strings"
	"sync"
)

type LogLevel string

const (
	LogLevelDebug LogLevel = "debug"
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)

type LogHandler func(level LogLevel, message string)

var (
	logHandlerMu sync.RWMutex
	logHandler   LogHandler
)

// SetLogger registers a handler to receive structured log messages.
func SetLogger(handler LogHandler) {
	logHandlerMu.Lock()
	defer logHandlerMu.Unlock()
	logHandler = handler
}

// Debugf logs a debug-level formatted message if a logger is configured.
func Debugf(format string, args ...any) {
	logf(LogLevelDebug, format, args...)
}

// Infof logs an info-level formatted message if a logger is configured.
func Infof(format string, args ...any) {
	logf(LogLevelInfo, format, args...)
}

// Warnf logs a warning-level formatted message if a logger is configured.
func Warnf(format string, args ...any) {
	logf(LogLevelWarn, format, args...)
}

// Errorf logs an error-level formatted message if a logger is configured.
func Errorf(format string, args ...any) {
	logf(LogLevelError, format, args...)
}

// logf formats the message and dispatches it to the configured logger.
func logf(level LogLevel, format string, args ...any) {
	logHandlerMu.RLock()
	handler := logHandler
	logHandlerMu.RUnlock()

	if handler == nil {
		return
	}

	message := strings.TrimSpace(fmt.Sprintf(format, args...))
	if message == "" {
		return
	}

	handler(level, message)
}
