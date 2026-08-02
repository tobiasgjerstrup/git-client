import { EventsOn } from "../../../wailsjs/runtime/runtime";

type FrontendLogLevel = "info" | "debug" | "warn" | "error";
type ConsoleMethodName = "log" | "info" | "debug" | "warn" | "error";

type FrontendLogEntry = {
	id: number;
	level: FrontendLogLevel;
	timestamp: string;
	message: string;
};

const MAX_LOG_ENTRIES = 500;
const LOG_PANEL_STORAGE_KEY = "git-client-log-console-collapsed";
const LOG_MIN_LEVEL_STORAGE_KEY = "git-client-log-console-min-level";
const BACKEND_LOG_EVENT_NAME = "backend:log";

const levelPriority: Record<FrontendLogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

const levelByMethod: Record<ConsoleMethodName, FrontendLogLevel> = {
	log: "info",
	info: "info",
	debug: "debug",
	warn: "warn",
	error: "error",
};

let nextLogId = 1;
let initialized = false;
let collapsed = false;
let backendLogListenerBound = false;
let minimumVisibleLevel: FrontendLogLevel = "debug";

const entries: FrontendLogEntry[] = [];
const originalConsoleMethods: Partial<Record<ConsoleMethodName, (...args: unknown[]) => void>> = {};

/**
 * Initializes the frontend console log panel and event listeners.
 */
export function initializeFrontendConsole() {
	if (initialized) {
		renderFrontendLogConsole();
		return;
	}

	initialized = true;
	collapsed = window.localStorage.getItem(LOG_PANEL_STORAGE_KEY) === "1";
	minimumVisibleLevel = readMinimumLogLevel();

	patchConsole();
	window.addEventListener("error", handleWindowError);
	window.addEventListener("unhandledrejection", handleUnhandledRejection);
	bindBackendLogListener();

	appendEntry("info", ["Frontend log console initialized"]);
	renderFrontendLogConsole();
}

/**
 * Returns the configured minimum visible frontend log level.
 */
export function getFrontendLogMinimumLevel(): FrontendLogLevel {
	return minimumVisibleLevel;
}

/**
 * Sets the minimum visible frontend log level and re-renders the console.
 */
export function setFrontendLogMinimumLevel(level: FrontendLogLevel) {
	minimumVisibleLevel = level;
	window.localStorage.setItem(LOG_MIN_LEVEL_STORAGE_KEY, level);
	renderFrontendLogConsole();
}

/**
 * Toggles the frontend log console collapsed state.
 */
export function toggleFrontendLogConsole() {
	collapsed = !collapsed;
	window.localStorage.setItem(LOG_PANEL_STORAGE_KEY, collapsed ? "1" : "0");
	renderFrontendLogConsole();
}

/**
 * Clears all entries from the frontend log console.
 */
export function clearFrontendLogConsole() {
	entries.length = 0;
	renderFrontendLogConsole();
}

/**
 * Re-renders the frontend log console panel with the current entries.
 */
export function renderFrontendLogConsole() {
	const body = document.getElementById("LogConsoleBody");
	const count = document.getElementById("LogConsoleCount");
	const toggleButton = document.getElementById("LogConsoleToggle");
	const panel = document.getElementById("LogConsolePanel");

	if (!body || !count || !toggleButton || !panel) {
		return;
	}

	const visibleEntries = entries.filter((entry) => shouldShowEntry(entry.level));
	count.textContent = String(visibleEntries.length);
	toggleButton.textContent = collapsed ? "Expand" : "Minimize";
	panel.setAttribute("aria-expanded", collapsed ? "false" : "true");
	panel.classList.toggle("log-console-panel-collapsed", collapsed);

	if (collapsed) {
		body.setAttribute("hidden", "");
		return;
	}

	body.removeAttribute("hidden");

	if (visibleEntries.length === 0) {
		body.innerHTML = `<div class="log-console-empty">No logs match the active minimum level filter.</div>`;
		return;
	}

	const renderedEntries = visibleEntries
		.slice(-200)
		.map((entry) => `<article class="log-console-entry log-console-entry-${entry.level}">
			<div class="log-console-entry-top">
				<span class="log-console-level">${entry.level.toUpperCase()}</span>
				<time class="log-console-time">${escapeHtml(entry.timestamp)}</time>
			</div>
			<pre class="log-console-message">${escapeHtml(entry.message)}</pre>
		</article>`)
		.reverse()
		.join("");

	body.innerHTML = renderedEntries;
}

/**
 * Determines whether a log entry should be visible based on the current minimum level.
 *
 * @param level - The entry severity level.
 * @returns True when the level is visible in the current filter.
 */
function shouldShowEntry(level: FrontendLogLevel): boolean {
    return levelPriority[level] >= levelPriority[minimumVisibleLevel];
}

/**
 * Reads the minimum frontend log level from local storage.
 *
 * @returns The configured minimum log level.
 */
function readMinimumLogLevel(): FrontendLogLevel {
    const stored = window.localStorage.getItem(LOG_MIN_LEVEL_STORAGE_KEY);
    if (stored === "debug" || stored === "info" || stored === "warn" || stored === "error") {
        return stored;
    }

    return "debug";
}

/**
 * Patches the browser console methods to forward logs into the frontend console.
 */
function patchConsole() {
    const methods: ConsoleMethodName[] = ["log", "info", "debug", "warn", "error"];

    for (const method of methods) {
        const original = console[method].bind(console);
        originalConsoleMethods[method] = original;

        console[method] = (...args: unknown[]) => {
            appendEntry(levelByMethod[method], args);
            original(...args);
        };
    }
}

/**
 * Handles uncaught window errors and logs them to the frontend console.
 *
 * @param event - The browser error event.
 */
function handleWindowError(event: ErrorEvent) {
    const location = [event.filename, event.lineno, event.colno]
        .filter((value) => value !== undefined && value !== null && value !== "")
        .join(":");

	if (event.error instanceof Error) {
		const stack = event.error.stack ? `\n${event.error.stack}` : "";
		appendEntry("error", [`${event.error.name}: ${event.error.message}${stack}`]);
		return;
	}

	const prefix = location ? `${location} - ` : "";
	appendEntry("error", [`${prefix}${event.message}`]);
}

/**
 * Handles unhandled promise rejections and logs them to the frontend console.
 *
 * @param event - The promise rejection event.
 */
function handleUnhandledRejection(event: PromiseRejectionEvent) {
    appendEntry("error", [`Unhandled promise rejection: ${formatValue(event.reason)}`]);
}

/**
 * Binds to backend log events emitted from the Wails runtime.
 */
function bindBackendLogListener() {
    if (backendLogListenerBound) {
        return;
    }

    EventsOn(BACKEND_LOG_EVENT_NAME, (payload: unknown) => {
        handleBackendLogPayload(payload);
    });

    backendLogListenerBound = true;
}

/**
 * Processes backend log payloads and converts them into frontend entries.
 *
 * @param payload - The raw event payload from the backend.
 */
function handleBackendLogPayload(payload: unknown) {
    const entry = normalizeBackendLogPayload(payload);
    appendEntry(entry.level, [entry.message], entry.timestamp);
}

/**
 * Normalizes backend log payload structures into frontend log entry values.
 *
 * @param payload - The raw payload that may contain level, message, timestamp, and source.
 * @returns The normalized log entry data.
 */
function normalizeBackendLogPayload(payload: unknown): { level: FrontendLogLevel; message: string; timestamp?: string } {
    if (!payload || typeof payload !== "object") {
        return {
            level: "info",
            message: `[backend] ${formatValue(payload)}`,
        };
    }

	const data = payload as {
		level?: unknown;
		message?: unknown;
		timestamp?: unknown;
		source?: unknown;
	};

	const level = normalizeLevel(data.level);
	const source = data.source === "backend" ? "backend" : "backend";
	const message = typeof data.message === "string" ? data.message : formatValue(data.message);
	const timestamp = typeof data.timestamp === "string" ? data.timestamp : undefined;

	return {
		level,
		message: `[${source}] ${message}`,
		timestamp,
	};
}

/**
 * Normalizes a backend severity value into a frontend log level.
 *
 * @param level - The raw severity value from the backend.
 * @returns The normalized frontend log level.
 */
function normalizeLevel(level: unknown): FrontendLogLevel {
    if (typeof level !== "string") {
        return "info";
    }

    const normalized = level.toLowerCase();
    if (normalized === "debug") {
        return "debug";
    }
    if (normalized === "warn" || normalized === "warning") {
        return "warn";
    }
    if (normalized === "error" || normalized === "fatal") {
        return "error";
    }

    return "info";
}

/**
 * Appends a new log entry to the frontend log buffer.
 *
 * @param level - The log level of the new entry.
 * @param args - The logged values.
 * @param timestampIso - Optional ISO timestamp string.
 */
function appendEntry(level: FrontendLogLevel, args: unknown[], timestampIso?: string) {
    const message = args.map((arg) => formatValue(arg)).join(" ").trim();
    const entry: FrontendLogEntry = {
        id: nextLogId++,
        level,
        timestamp: resolveTimestampLabel(timestampIso),
        message: message || "(empty message)",
    };

    entries.push(entry);
    if (entries.length > MAX_LOG_ENTRIES) {
        entries.splice(0, entries.length - MAX_LOG_ENTRIES);
    }

    renderFrontendLogConsole();
}

/**
 * Resolves a timestamp label for display from an optional ISO timestamp.
 *
 * @param timestampIso - Optional ISO timestamp string.
 * @returns The formatted local time label.
 */
function resolveTimestampLabel(timestampIso?: string): string {
    if (!timestampIso) {
        return new Date().toLocaleTimeString();
    }

    const parsed = new Date(timestampIso);
    if (Number.isNaN(parsed.getTime())) {
        return new Date().toLocaleTimeString();
    }

    return parsed.toLocaleTimeString();
}

/**
 * Converts a value into a readable string for logging.
 *
 * @param value - The value to format.
 * @returns The formatted string representation.
 */
function formatValue(value: unknown): string {
    if (value instanceof Error) {
        return value.stack || `${value.name}: ${value.message}`;
    }

    if (typeof value === "string") {
        return value;
    }

	if (typeof value === "undefined") {
		return "undefined";
	}

	if (typeof value === "function") {
		return `[Function ${value.name || "anonymous"}]`;
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

/**
 * Escapes HTML special characters in a string.
 *
 * @param value - The string to escape.
 * @returns The escaped string.
 */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}