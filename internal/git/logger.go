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

func SetLogger(handler LogHandler) {
	logHandlerMu.Lock()
	defer logHandlerMu.Unlock()
	logHandler = handler
}

func Debugf(format string, args ...any) {
	logf(LogLevelDebug, format, args...)
}

func Infof(format string, args ...any) {
	logf(LogLevelInfo, format, args...)
}

func Warnf(format string, args ...any) {
	logf(LogLevelWarn, format, args...)
}

func Errorf(format string, args ...any) {
	logf(LogLevelError, format, args...)
}

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
