import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    setRenderedGitEntries,
    handleGitSelectionClick,
    getGitSelectionTargets,
    handleGitSelectionKeydown,
    type GitSelectionEntry,
} from './gitSelectionState';

function entry(
    key: string,
    actionPath?: string,
    supportedActions: GitSelectionEntry['supportedActions'] = ['stage', 'discard'],
): GitSelectionEntry {
    return { key, actionPath: actionPath ?? key, label: key, supportedActions };
}

function setEventTarget<T extends Event>(event: T, target: EventTarget) {
  Object.defineProperty(event, 'target', { value: target, writable: false });
}

function makeClickEvent(opts: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}): MouseEvent {
  const event = new MouseEvent('click', {
    shiftKey: opts.shiftKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    bubbles: true,
  });
  setEventTarget(event, new HTMLElement());
  return event;
}

function keysForAction(action: string): string[] {
    return getGitSelectionTargets(action as 'stage' | 'unstage' | 'discard', undefined).map((e) => e.key);
}

beforeEach(() => {
    // Fully reset module state: clear selection first by feeding an empty list.
    setRenderedGitEntries([]);
    setRenderedGitEntries([entry('a'), entry('b'), entry('c')]);
});

// --------------------------------------------------------------------------
// Simple click
// --------------------------------------------------------------------------

describe('simple click', () => {
    it('selects a single unselected entry', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        expect(keysForAction('stage')).toEqual(['a']);
    });

    it('deselects the currently selected entry when clicked again', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        handleGitSelectionClick(makeClickEvent(), 'a');
        expect(keysForAction('stage')).toEqual([]);
    });

    it('switches selection when clicking a different entry', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        handleGitSelectionClick(makeClickEvent(), 'b');
        expect(keysForAction('stage')).toEqual(['b']);
    });

    it('ignores clicks if the rendered list does not contain the key', () => {
        handleGitSelectionClick(makeClickEvent(), 'z');
        expect(keysForAction('stage')).toEqual([]);
    });

    it('ignores clicks when the target is inside a button', () => {
        const event = makeClickEvent();
        vi.spyOn(event.target as HTMLElement, 'closest').mockImplementation((sel: string) =>
            sel === 'button' ? (event.target as HTMLElement) : null,
        );
        handleGitSelectionClick(event, 'a');
        expect(keysForAction('stage')).toEqual([]);
    });

    it('ignores clicks when the target is inside diff-content', () => {
        const event = makeClickEvent();
        vi.spyOn(event.target as HTMLElement, 'closest').mockImplementation((sel: string) =>
            sel === '.diff-content' ? (event.target as HTMLElement) : null,
        );
        handleGitSelectionClick(event, 'a');
        expect(keysForAction('stage')).toEqual([]);
    });
});

// --------------------------------------------------------------------------
// Shift+click range selection
// --------------------------------------------------------------------------

describe('shift+click range selection', () => {
    it('selects range from anchor to clicked entry', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        handleGitSelectionClick(makeClickEvent({ shiftKey: true }), 'c');
        expect(keysForAction('stage').sort()).toEqual(['a', 'b', 'c']);
    });

    it('selects range in reverse direction', () => {
        handleGitSelectionClick(makeClickEvent(), 'c');
        handleGitSelectionClick(makeClickEvent({ shiftKey: true }), 'a');
        expect(keysForAction('stage').sort()).toEqual(['a', 'b', 'c']);
    });

    it('replaces selection when shift+click without ctrl', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        // Ctrl+click "b" moves anchor to "b".
        handleGitSelectionClick(makeClickEvent({ ctrlKey: true }), 'b');
        expect(keysForAction('stage').sort()).toEqual(['a', 'b']);

        // Shift-click "c" without ctrl: anchor is now "b", so range is b..c.
        handleGitSelectionClick(makeClickEvent({ shiftKey: true }), 'c');
        expect(keysForAction('stage').sort()).toEqual(['b', 'c']);
    });

    it('adds range to existing selection when shift+ctrl+click', () => {
        setRenderedGitEntries([]);
        setRenderedGitEntries([entry('a'), entry('b'), entry('c'), entry('d')]);

        handleGitSelectionClick(makeClickEvent(), 'b');
        handleGitSelectionClick(makeClickEvent({ shiftKey: true, ctrlKey: true }), 'd');

        // anchor=b, ctrl+shift-click d: adds c,d to existing {b}.
        expect(keysForAction('stage').sort()).toEqual(['b', 'c', 'd']);
    });

    it('clears and selects single entry when anchor is invalid', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        setRenderedGitEntries([]);
        setRenderedGitEntries([entry('b'), entry('c')]);

        handleGitSelectionClick(makeClickEvent({ shiftKey: true }), 'c');
        expect(keysForAction('stage')).toEqual(['c']);
    });
});

// --------------------------------------------------------------------------
// Ctrl+click toggle
// --------------------------------------------------------------------------

describe('ctrl+click toggle', () => {
    it('adds entry to selection', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        handleGitSelectionClick(makeClickEvent({ ctrlKey: true }), 'b');
        expect(keysForAction('stage').sort()).toEqual(['a', 'b']);
    });

    it('removes entry from selection', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        handleGitSelectionClick(makeClickEvent({ ctrlKey: true }), 'b');
        handleGitSelectionClick(makeClickEvent({ ctrlKey: true }), 'a');
        expect(keysForAction('stage')).toEqual(['b']);
    });

    it('moves anchor to the ctrl-clicked entry', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        // Ctrl+click "b" adds it and moves anchor to "b".
        handleGitSelectionClick(makeClickEvent({ ctrlKey: true }), 'b');
        // Shift-click "c" from anchor="b" selects b..c.
        handleGitSelectionClick(makeClickEvent({ shiftKey: true }), 'c');
        expect(keysForAction('stage').sort()).toEqual(['b', 'c']);
    });

    it('does not clear anchor when removing a different entry via ctrl+click', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        handleGitSelectionClick(makeClickEvent({ ctrlKey: true }), 'b');
        // Remove a via ctrl+click; anchor stays at b.
        handleGitSelectionClick(makeClickEvent({ ctrlKey: true }), 'a');
        // Shift-click c extends from b to c.
        handleGitSelectionClick(makeClickEvent({ shiftKey: true }), 'c');
        expect(keysForAction('stage').sort()).toEqual(['b', 'c']);
    });

    it('clears anchor when the last entry is removed via ctrl+click', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        handleGitSelectionClick(makeClickEvent({ ctrlKey: true }), 'a');
        // No selection → anchor null → shift-click behaves like simple click.
        handleGitSelectionClick(makeClickEvent({ shiftKey: true }), 'b');
        expect(keysForAction('stage')).toEqual(['b']);
    });
});

// --------------------------------------------------------------------------
// Ctrl+A select all (keyboard)
// --------------------------------------------------------------------------

describe('Ctrl+A select all', () => {
    it('selects all rendered entries', () => {
        const event = new KeyboardEvent('keydown', {
            key: 'a',
            ctrlKey: true,
            bubbles: true,
        });
        handleGitSelectionKeydown(event);
        expect(keysForAction('stage').sort()).toEqual(['a', 'b', 'c']);
    });

    it('ignores Ctrl+A when the target is inside an input', () => {
        const event = new KeyboardEvent('keydown', {
            key: 'a',
            ctrlKey: true,
            bubbles: true,
        });
        const input = new HTMLElement();
        vi.spyOn(input, 'closest').mockReturnValue(input);
        setEventTarget(event, input);
        handleGitSelectionKeydown(event);
        expect(keysForAction('stage')).toEqual([]);
    });

    it('ignores Ctrl+A with shift held', () => {
        const event = new KeyboardEvent('keydown', {
            key: 'a',
            ctrlKey: true,
            shiftKey: true,
        });
        handleGitSelectionKeydown(event);
        expect(keysForAction('stage')).toEqual([]);
    });

    it('ignores Ctrl+A with alt held', () => {
        const event = new KeyboardEvent('keydown', {
            key: 'a',
            ctrlKey: true,
            altKey: true,
        });
        handleGitSelectionKeydown(event);
        expect(keysForAction('stage')).toEqual([]);
    });

    it('works with Meta key (Mac Cmd+A)', () => {
        const event = new KeyboardEvent('keydown', {
            key: 'a',
            metaKey: true,
            bubbles: true,
        });
        handleGitSelectionKeydown(event);
        expect(keysForAction('stage').sort()).toEqual(['a', 'b', 'c']);
    });
});

// --------------------------------------------------------------------------
// Escape clears selection
// --------------------------------------------------------------------------

describe('Escape clears selection', () => {
    it('clears the selection', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        handleGitSelectionKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(keysForAction('stage')).toEqual([]);
    });

    it('is a no-op when the target is inside an input', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');

        const event = new KeyboardEvent('keydown', { key: 'Escape' });
        const input = new HTMLElement();
        vi.spyOn(input, 'closest').mockReturnValue(input);
        setEventTarget(event, input);

        handleGitSelectionKeydown(event);
        expect(keysForAction('stage')).toEqual(['a']);
    });

    it('is a no-op when nothing is selected', () => {
        handleGitSelectionKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(keysForAction('stage')).toEqual([]);
    });
});

// --------------------------------------------------------------------------
// getGitSelectionTargets
// --------------------------------------------------------------------------

describe('getGitSelectionTargets', () => {
    beforeEach(() => {
        setRenderedGitEntries([]);
        setRenderedGitEntries([
            { key: 'a:s', actionPath: 'shared', label: 'A', supportedActions: ['stage'] },
            { key: 'a:d', actionPath: 'shared', label: 'A', supportedActions: ['discard'] },
            { key: 'b', actionPath: 'b', label: 'B', supportedActions: ['stage', 'discard'] },
        ]);
    });

    it('returns selected entries that support the action', () => {
        handleGitSelectionClick(makeClickEvent(), 'a:s');
        handleGitSelectionClick(makeClickEvent({ ctrlKey: true }), 'b');

        const stageTargets = getGitSelectionTargets('stage', undefined);
        expect(stageTargets.map((e) => e.key)).toEqual(['a:s', 'b']);
    });

    it('deduplicates entries by actionPath', () => {
        handleGitSelectionClick(makeClickEvent(), 'a:s');
        handleGitSelectionClick(makeClickEvent({ ctrlKey: true }), 'a:d');

        const discardTargets = getGitSelectionTargets('discard', undefined);
        expect(discardTargets).toHaveLength(1);
        expect(discardTargets[0].actionPath).toBe('shared');
    });

    it('falls back to the clicked entry when it is not in the current selection', () => {
        handleGitSelectionClick(makeClickEvent(), 'b');

        const targets = getGitSelectionTargets('stage', 'a:s');
        expect(targets.map((e) => e.key)).toEqual(['a:s']);
    });

    it('returns an empty array when the clicked entry does not support the action', () => {
        const targets = getGitSelectionTargets('unstage', 'a:s');
        expect(targets).toEqual([]);
    });

    it('returns an empty array for an unknown clicked key', () => {
        const targets = getGitSelectionTargets('stage', 'nonexistent');
        expect(targets).toEqual([]);
    });
});

// --------------------------------------------------------------------------
// setRenderedGitEntries
// --------------------------------------------------------------------------

describe('setRenderedGitEntries', () => {
    beforeEach(() => {
        // Reset to baseline within this describe block.
        setRenderedGitEntries([]);
        setRenderedGitEntries([entry('a'), entry('b'), entry('c')]);
    });

    it('replaces the rendered entry list', () => {
        setRenderedGitEntries([entry('x'), entry('y')]);
        handleGitSelectionClick(makeClickEvent(), 'x');
        expect(keysForAction('stage')).toEqual(['x']);
    });

    it('removes stale selected keys no longer in the new list', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        setRenderedGitEntries([]);
        setRenderedGitEntries([entry('x'), entry('y')]);
        expect(keysForAction('stage')).toEqual([]);
    });

    it('clears anchor when it is no longer visible', () => {
        handleGitSelectionClick(makeClickEvent(), 'a');
        setRenderedGitEntries([]);
        setRenderedGitEntries([entry('x'), entry('y')]);
        // Shift-click without anchor acts like simple click.
        handleGitSelectionClick(makeClickEvent({ shiftKey: true }), 'x');
        expect(keysForAction('stage')).toEqual(['x']);
    });
});
