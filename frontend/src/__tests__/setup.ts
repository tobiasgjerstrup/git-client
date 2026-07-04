import { vi } from "vitest";

// Minimal DOM stubs so state-machine modules don't crash when they
// synchronise to the DOM.  Tests only assert on pure logic, never on DOM.
const qsaResult: HTMLElement[] = [];
const nodelist = {
  [Symbol.iterator]() { return qsaResult[Symbol.iterator](); },
  forEach: (fn: (el: HTMLElement) => void) => qsaResult.forEach(fn),
  get length() { return qsaResult.length; },
  item: (i: number) => qsaResult[i] ?? null,
} as unknown as NodeListOf<HTMLElement>;

vi.stubGlobal("document", {
  querySelectorAll: vi.fn(() => nodelist),
  getElementById: vi.fn(() => null),
  addEventListener: vi.fn(),
  createElement: vi.fn((_tag: string) => {
    const El = (globalThis as any).HTMLElement;
    return new El() as HTMLElement;
  }),
  body: {
    innerHTML: "",
    appendChild: vi.fn(),
  },
  dispatchEvent: vi.fn(),
});

vi.stubGlobal(
  "HTMLElement",
  class {
    hidden = false;
    dataset: DOMStringMap = {} as DOMStringMap;
    classList = {
      toggle: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      contains: vi.fn(() => false),
    };
    style: any = {};
    closest(_selector: string): HTMLElement | null {
      return null;
    }
    focus(_opts?: FocusOptions) {}
    querySelector(_selector: string): HTMLElement | null {
      return null;
    }
    getAttribute(_name: string): string | null {
      return null;
    }
    hasAttribute(_name: string): boolean {
      return false;
    }
    setAttribute(_name: string, _value: string) {}
    removeAttribute(_name: string) {}
  },
);

vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
});

// localStorage (used by recentRepositories)
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

// window.globalThis shim so window.localStorage resolves
(globalThis as any).window = globalThis;

// Event constructors so code can do new MouseEvent / new KeyboardEvent
(globalThis as any).MouseEvent = class MouseEvent {
  type: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented = false;
  cancelBubble = false;
  target: any = null;
  constructor(type: string, init?: MouseEventInit) {
    this.type = type;
    this.shiftKey = init?.shiftKey ?? false;
    this.ctrlKey = init?.ctrlKey ?? false;
    this.metaKey = init?.metaKey ?? false;
    this.bubbles = init?.bubbles ?? false;
    this.cancelable = init?.cancelable ?? false;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.cancelBubble = true; }
  stopImmediatePropagation() { this.cancelBubble = true; }
};

(globalThis as any).KeyboardEvent = class KeyboardEvent {
  type: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  bubbles: boolean;
  defaultPrevented = false;
  cancelBubble = false;
  target: any = null;
  constructor(type: string, init?: KeyboardEventInit) {
    this.type = type;
    this.key = init?.key ?? "";
    this.ctrlKey = init?.ctrlKey ?? false;
    this.metaKey = init?.metaKey ?? false;
    this.shiftKey = init?.shiftKey ?? false;
    this.altKey = init?.altKey ?? false;
    this.bubbles = init?.bubbles ?? false;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.cancelBubble = true; }
  stopImmediatePropagation() { this.cancelBubble = true; }
};

