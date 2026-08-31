import { describe, it, expect } from 'vitest';
import { parseGitStatusLine, isStagedFromXYStatus, hasUnstagedFromXYStatus, escapeHtml, renderSvg } from './git';
import { buildGitChangeTree, setRenderedGitTree, getFolderActionTargets, type GitTreeLeaf, type GitTreeNode } from './gitTree';

// --------------------------------------------------------------------------
// parseGitStatusLine
// --------------------------------------------------------------------------

describe('parseGitStatusLine', () => {
    describe('porcelain v2 ordinary changed (1 ...)', () => {
        it('parses a modified staged+unstaged entry', () => {
            const result = parseGitStatusLine(
                '1 MM N... 0000 0000 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 src/app.ts',
            );
            expect(result).toBeTruthy();
            expect(result!.key).toBe('1');
            expect(result!.xy).toBe('MM');
            expect(result!.path).toBe('src/app.ts');
        });

        it('parses an added entry', () => {
            const result = parseGitStatusLine(
                '1 A. N... 0000 0000 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 newfile.txt',
            );
            expect(result!.xy).toBe('A.');
            expect(result!.path).toBe('newfile.txt');
        });

        it('parses a deleted entry', () => {
            const result = parseGitStatusLine(
                '1 .D N... 0000 0000 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 removed.ts',
            );
            expect(result!.xy).toBe('.D');
            expect(result!.path).toBe('removed.ts');
        });
    });

    describe('porcelain v2 renamed/copied (2 ...)', () => {
        it('parses a renamed file with origPath', () => {
            const result = parseGitStatusLine(
                '2 RM N... 0000 0000 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 R100 new.ts\told.ts',
            );
            expect(result!.key).toBe('2');
            expect(result!.xy).toBe('RM');
            expect(result!.path).toBe('new.ts');
            expect(result!.origPath).toBe('old.ts');
            expect(result!.text).toBe('RM old.ts -> new.ts');
        });

        it('parses a renamed file without tab separator in text', () => {
            const result = parseGitStatusLine(
                '2 RM N... 0000 0000 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 R050 renamed.ts',
            );
            expect(result!.key).toBe('2');
            expect(result!.path).toBe('renamed.ts');
            expect(result!.origPath).toBeUndefined();
        });
    });

    describe('porcelain v2 unmerged (u ...)', () => {
        it('parses a merge conflict UU via v1 fallback', () => {
            const result = parseGitStatusLine('UU conflict.ts');
            expect(result!.key).toBe('u');
            expect(result!.xy).toBe('UU');
            expect(result!.path).toBe('conflict.ts');
        });

        it('parses a merge conflict AA', () => {
            const result = parseGitStatusLine('AA file.ts');
            expect(result!.key).toBe('u');
            expect(result!.xy).toBe('AA');
        });
    });

    describe('porcelain v2 untracked (? ...)', () => {
        it('parses an untracked file', () => {
            const result = parseGitStatusLine('? newfile.txt');
            expect(result).toEqual({
                key: '?',
                xy: '??',
                path: 'newfile.txt',
                text: '?? newfile.txt',
            });
        });
    });

    describe('porcelain v2 ignored (! ...)', () => {
        it('parses an ignored file', () => {
            const result = parseGitStatusLine('! node_modules/something');
            expect(result!.key).toBe('!');
            expect(result!.xy).toBe('!!');
            expect(result!.path).toBe('node_modules/something');
        });
    });

    describe('branch header', () => {
        it('returns null for a branch header line', () => {
            expect(parseGitStatusLine('# branch.head main')).toBeNull();
        });
    });

    describe('porcelain v1 fallback', () => {
        it("parses v1 ordinary changed: 'M  file.txt'", () => {
            const result = parseGitStatusLine('M  file.txt');
            expect(result!.key).toBe('1');
            expect(result!.xy).toBe('M ');
            expect(result!.path).toBe('file.txt');
        });

        it("parses v1 untracked: '?? file.txt'", () => {
            const result = parseGitStatusLine('?? file.txt');
            expect(result!.key).toBe('?');
            expect(result!.xy).toBe('??');
        });

        it("parses v1 ignored: '!! file.txt'", () => {
            const result = parseGitStatusLine('!! file.txt');
            expect(result!.key).toBe('!');
            expect(result!.xy).toBe('!!');
        });

        it('parses v1 unmerged code', () => {
            const result = parseGitStatusLine('AA conflict.txt');
            expect(result!.key).toBe('u');
            expect(result!.xy).toBe('AA');
            expect(result!.path).toBe('conflict.txt');
        });
    });

    describe('edge cases', () => {
        it('returns null for an empty string', () => {
            expect(parseGitStatusLine('')).toBeNull();
        });

        it('returns null for a string shorter than 3 characters', () => {
            expect(parseGitStatusLine('ab')).toBeNull();
        });

        it('returns null for a whitespace-only line shorter than 3 chars', () => {
            expect(parseGitStatusLine('  ')).toBeNull();
        });
    });
});

// --------------------------------------------------------------------------
// isStagedFromXYStatus
// --------------------------------------------------------------------------

describe('isStagedFromXYStatus', () => {
    it("returns true when the first char is a letter (not '.' or ' ')", () => {
        expect(isStagedFromXYStatus('M.')).toBe(true);
        expect(isStagedFromXYStatus('MM')).toBe(true);
        expect(isStagedFromXYStatus('A.')).toBe(true);
        expect(isStagedFromXYStatus('D.')).toBe(true);
        expect(isStagedFromXYStatus('R.')).toBe(true);
    });

    it("returns false when the first char is '.'", () => {
        expect(isStagedFromXYStatus('.M')).toBe(false);
        expect(isStagedFromXYStatus('.D')).toBe(false);
        expect(isStagedFromXYStatus('..')).toBe(false);
    });

    it("returns false for untracked '??' or space", () => {
        expect(isStagedFromXYStatus('??')).toBe(false);
        expect(isStagedFromXYStatus('  ')).toBe(false);
    });
});

// --------------------------------------------------------------------------
// hasUnstagedFromXYStatus
// --------------------------------------------------------------------------

describe('hasUnstagedFromXYStatus', () => {
    it("returns true when the second char is a letter (not '.' or ' ')", () => {
        expect(hasUnstagedFromXYStatus('.M')).toBe(true);
        expect(hasUnstagedFromXYStatus('MM')).toBe(true);
        expect(hasUnstagedFromXYStatus('?A')).toBe(true);
    });

    it("returns false when the second char is '.' or ' '", () => {
        expect(hasUnstagedFromXYStatus('M.')).toBe(false);
        expect(hasUnstagedFromXYStatus('..')).toBe(false);
        expect(hasUnstagedFromXYStatus('  ')).toBe(false);
    });
});

// --------------------------------------------------------------------------
// escapeHtml
// --------------------------------------------------------------------------

describe('escapeHtml', () => {
    it('escapes & as &amp;', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes < as &lt;', () => {
        expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('escapes > as &gt;', () => {
        expect(escapeHtml('</div>')).toBe('&lt;/div&gt;');
    });

    it('escapes " as &quot;', () => {
        expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it("escapes ' as &#39;", () => {
        expect(escapeHtml("it's ok")).toBe('it&#39;s ok');
    });

    it('returns the same string when nothing needs escaping', () => {
        expect(escapeHtml('plain text 123')).toBe('plain text 123');
    });

    it('handles an empty string', () => {
        expect(escapeHtml('')).toBe('');
    });
});

// --------------------------------------------------------------------------
// renderSvg
// --------------------------------------------------------------------------

describe('renderSvg', () => {
	it('returns go icon', () => {
		const svg = renderSvg('path/to/file/code.go');
		expect(svg).toContain('<img'); // It should be an actual renderable html element
		expect(svg).toContain('src="/src/assets/images/icons/file_type_go.svg"');
	});
	it('returns typescript test icon', () => {
		const svg = renderSvg('path/to/file/code.test.ts');
		expect(svg).toContain('<img');
		expect(svg).toContain('src="/src/assets/images/icons/file_type_testts.svg"');
	});
	it('returns prettier icon for .prettierrc', () => {
		const svg = renderSvg('path/to/file/.prettierrc');
		expect(svg).toContain('<img');
		expect(svg).toContain('src="/src/assets/images/icons/file_type_prettier.svg"');
	});
	it('returns folder icon for directories', () => {
		const svg = renderSvg('path/to/directory/');
		expect(svg).toContain('<img');
		expect(svg).toContain('src="/src/assets/images/icons/default_folder.svg"');
	});
	it('returns default icon for unknown file type', () => {
		const svg = renderSvg('path/to/file/unknownfile.xyzijk');
		expect(svg).toContain('<img');
		expect(svg).toContain('src="/src/assets/images/icons/default_file.svg"');
	});
});

// --------------------------------------------------------------------------
// buildGitChangeTree
// --------------------------------------------------------------------------

function makeLeaf(path: string, actionPath = path, supportedActions: GitTreeLeaf["supportedActions"] = ["stage"]): GitTreeLeaf {
	return { path, actionPath, label: path, supportedActions, renderFile: () => `<row>${path}</row>` };
}

describe('buildGitChangeTree', () => {
	it('nests files under folders and sorts folders before files', () => {
		const tree = buildGitChangeTree([
			makeLeaf('README.md'),
			makeLeaf('src/util.ts'),
			makeLeaf('src/app.ts'),
		]);

		expect(tree).toHaveLength(2);
		expect(tree[0].type).toBe('folder');
		expect((tree[0] as { name: string }).name).toBe('src');
		expect(tree[1].type).toBe('file');

		const folder = tree[0] as { type: "folder"; children: GitTreeNode[] };
		expect(folder.children.map((c) => c.name)).toEqual(['app.ts', 'util.ts']);
	});

	it('groups nested directories recursively', () => {
		const tree = buildGitChangeTree([makeLeaf('a/b/c.txt')]);

		expect(tree).toHaveLength(1);
		const a = tree[0] as { type: "folder"; name: string; children: GitTreeNode[] };
		expect(a.type).toBe('folder');
		expect(a.name).toBe('a');
		expect(a.children).toHaveLength(1);
		const b = a.children[0] as { type: "folder"; name: string; children: GitTreeNode[] };
		expect(b.name).toBe('b');
		expect(b.children[0].name).toBe('c.txt');
	});

	it('keeps staged and unstaged entries as sibling leaves under the same folder', () => {
		const tree = buildGitChangeTree([
			makeLeaf('src/app.ts', 'src/app.ts', ['unstage']),
			makeLeaf('src/app.ts', 'src/app.ts', ['stage', 'discard']),
		]);

		const folder = tree[0] as { type: "folder"; children: GitTreeNode[] };
		expect(folder.children).toHaveLength(2);
		expect(folder.children.every((c) => c.type === 'file' && c.name === 'app.ts')).toBe(true);
	});

	it('returns a flat list of files when both thresholds are zero', () => {
		const tree = buildGitChangeTree([
			makeLeaf('src/app.ts'),
			makeLeaf('src/util.ts'),
		], 0, 0);

		expect(tree).toHaveLength(2);
		expect(tree.every((c) => c.type === 'file')).toBe(true);
		expect(tree.map((c) => c.path)).toEqual(['src/app.ts', 'src/util.ts']);
	});

	it('keeps a folder when either threshold is met', () => {
		// src has 2 direct files and 2 subtree files.
		const leaves = [
			makeLeaf('src/app.ts'),
			makeLeaf('src/util.ts'),
		];

		// Neither threshold is met (2 < 3), so it is flattened.
		const flattened = buildGitChangeTree(leaves, 3, 3);
		expect(flattened).toHaveLength(2);
		expect(flattened.every((c) => c.type === 'file')).toBe(true);

		// Direct threshold met (2 >= 2), so it is kept even though subtree is not.
		const keptByDirect = buildGitChangeTree(leaves, 2, 5);
		expect(keptByDirect).toHaveLength(1);
		expect(keptByDirect[0].type).toBe('folder');

		// Subtree threshold met (2 >= 2), so it is kept even though direct is not.
		const keptBySubtree = buildGitChangeTree(leaves, 5, 2);
		expect(keptBySubtree).toHaveLength(1);
		expect(keptBySubtree[0].type).toBe('folder');
	});

	it('treats zero as a disabled condition', () => {
		// src has 2 direct files; direct=0 disables that condition, subtree=2 keeps it.
		const kept = buildGitChangeTree([
			makeLeaf('src/app.ts'),
			makeLeaf('src/util.ts'),
		], 0, 2);

		expect(kept).toHaveLength(1);
		expect(kept[0].type).toBe('folder');
	});

	it('counts subtree files across nested directories', () => {
		// src has 2 direct files and 1 nested file (3 total).
		const leaves = [
			makeLeaf('src/a.ts'),
			makeLeaf('src/b.ts'),
			makeLeaf('src/x/y.ts'),
		];

		// Direct disabled (5 not met by 2), subtree 4 not met by 3 -> flattened.
		const flattened = buildGitChangeTree(leaves, 5, 4);
		expect(flattened.every((c) => c.type === 'file')).toBe(true);

		// Direct disabled (5 not met by 2), subtree met (3 >= 3) -> kept.
		const kept = buildGitChangeTree(leaves, 5, 3);
		expect(kept).toHaveLength(1);
		expect(kept[0].type).toBe('folder');
		expect((kept[0] as { name: string }).name).toBe('src');
	});
});

// --------------------------------------------------------------------------
// getFolderActionTargets
// --------------------------------------------------------------------------

describe('getFolderActionTargets', () => {
	it('collects and deduplicates descendant targets for an action', () => {
		setRenderedGitTree(buildGitChangeTree([
			makeLeaf('a/b.ts', 'a/b.ts', ['stage', 'discard']),
			makeLeaf('a/c.ts', 'a/c.ts', ['unstage']),
			makeLeaf('a/b.ts', 'a/b.ts', ['stage', 'discard']),
			makeLeaf('a/d.ts', 'a/d.ts', ['stage', 'discard']),
		]));

		const targets = getFolderActionTargets('a', 'stage');
		expect(targets.map((t) => t.actionPath).sort()).toEqual(['a/b.ts', 'a/d.ts']);
	});

	it('returns an empty list for an unknown folder or unsupported action', () => {
		setRenderedGitTree(buildGitChangeTree([makeLeaf('a/b.ts', 'a/b.ts', ['stage'])]));

		expect(getFolderActionTargets('a', 'discard')).toEqual([]);
		expect(getFolderActionTargets('missing', 'stage')).toEqual([]);
	});
});
