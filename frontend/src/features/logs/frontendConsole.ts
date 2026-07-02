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

export function getFrontendLogMinimumLevel(): FrontendLogLevel {
	return minimumVisibleLevel;
}

export function setFrontendLogMinimumLevel(level: FrontendLogLevel) {
	minimumVisibleLevel = level;
	window.localStorage.setItem(LOG_MIN_LEVEL_STORAGE_KEY, level);
	renderFrontendLogConsole();
}

export function toggleFrontendLogConsole() {
	collapsed = !collapsed;
	window.localStorage.setItem(LOG_PANEL_STORAGE_KEY, collapsed ? "1" : "0");
	renderFrontendLogConsole();
}

export function clearFrontendLogConsole() {
	entries.length = 0;
	renderFrontendLogConsole();
}

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

function shouldShowEntry(level: FrontendLogLevel): boolean {
	return levelPriority[level] >= levelPriority[minimumVisibleLevel];
}

function readMinimumLogLevel(): FrontendLogLevel {
	const stored = window.localStorage.getItem(LOG_MIN_LEVEL_STORAGE_KEY);
	if (stored === "debug" || stored === "info" || stored === "warn" || stored === "error") {
		return stored;
	}

	return "debug";
}

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

function handleUnhandledRejection(event: PromiseRejectionEvent) {
	appendEntry("error", [`Unhandled promise rejection: ${formatValue(event.reason)}`]);
}

function bindBackendLogListener() {
	if (backendLogListenerBound) {
		return;
	}

	EventsOn(BACKEND_LOG_EVENT_NAME, (payload: unknown) => {
		handleBackendLogPayload(payload);
	});

	backendLogListenerBound = true;
}

function handleBackendLogPayload(payload: unknown) {
	const entry = normalizeBackendLogPayload(payload);
	appendEntry(entry.level, [entry.message], entry.timestamp);
}

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

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}