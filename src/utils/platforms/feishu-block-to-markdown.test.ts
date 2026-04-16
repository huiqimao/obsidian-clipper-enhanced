import { describe, expect, test } from 'vitest';
import { convertFeishuBlocksToMarkdown } from './feishu-block-to-markdown';
import type { FeishuApiBlock } from '../../types/types';
import { FEISHU_BLOCK_TYPE } from '../../types/types';

const API_BASE = 'https://open.feishu.cn';

function makeBlock(overrides: Partial<FeishuApiBlock> & { block_id: string; block_type: number }): FeishuApiBlock {
	return { parent_id: '', ...overrides } as FeishuApiBlock;
}

describe('convertFeishuBlocksToMarkdown', () => {
	test('renders plain text block', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['b1'], page: { elements: [{ text_run: { content: 'Title' } }] } }),
			makeBlock({ block_id: 'b1', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'root', text: { elements: [{ text_run: { content: 'Hello world' } }] } }),
		];
		expect(convertFeishuBlocksToMarkdown(blocks, API_BASE)).toBe('Hello world\n');
	});

	test('renders headings h1 through h6 (clamped)', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['h1', 'h3', 'h9'] }),
			makeBlock({ block_id: 'h1', block_type: FEISHU_BLOCK_TYPE.HEADING1, parent_id: 'root', heading1: { elements: [{ text_run: { content: 'H1' } }] } }),
			makeBlock({ block_id: 'h3', block_type: FEISHU_BLOCK_TYPE.HEADING3, parent_id: 'root', heading3: { elements: [{ text_run: { content: 'H3' } }] } }),
			makeBlock({ block_id: 'h9', block_type: FEISHU_BLOCK_TYPE.HEADING9, parent_id: 'root', heading9: { elements: [{ text_run: { content: 'H9 clamped' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('# H1');
		expect(md).toContain('### H3');
		expect(md).toContain('###### H9 clamped');
	});

	test('renders bold, italic, strikethrough, and inline code', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['b1'] }),
			makeBlock({
				block_id: 'b1', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'root',
				text: {
					elements: [
						{ text_run: { content: 'bold', text_element_style: { bold: true } } },
						{ text_run: { content: ' ' } },
						{ text_run: { content: 'italic', text_element_style: { italic: true } } },
						{ text_run: { content: ' ' } },
						{ text_run: { content: 'strike', text_element_style: { strikethrough: true } } },
						{ text_run: { content: ' ' } },
						{ text_run: { content: 'code', text_element_style: { inline_code: true } } },
					],
				},
			}),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('**bold**');
		expect(md).toContain('*italic*');
		expect(md).toContain('~~strike~~');
		expect(md).toContain('`code`');
	});

	test('renders links', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['b1'] }),
			makeBlock({
				block_id: 'b1', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'root',
				text: {
					elements: [
						{ text_run: { content: 'click here', text_element_style: { link: { url: 'https%3A%2F%2Fexample.com' } } } },
					],
				},
			}),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('[click here](https://example.com)');
	});

	test('renders bullet list', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['b1', 'b2'] }),
			makeBlock({ block_id: 'b1', block_type: FEISHU_BLOCK_TYPE.BULLET, parent_id: 'root', bullet: { elements: [{ text_run: { content: 'Item 1' } }] } }),
			makeBlock({ block_id: 'b2', block_type: FEISHU_BLOCK_TYPE.BULLET, parent_id: 'root', bullet: { elements: [{ text_run: { content: 'Item 2' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('- Item 1');
		expect(md).toContain('- Item 2');
	});

	test('renders nested bullet list with indentation', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['b1'] }),
			makeBlock({ block_id: 'b1', block_type: FEISHU_BLOCK_TYPE.BULLET, parent_id: 'root', children: ['b2'], bullet: { elements: [{ text_run: { content: 'Parent' } }] } }),
			makeBlock({ block_id: 'b2', block_type: FEISHU_BLOCK_TYPE.BULLET, parent_id: 'b1', bullet: { elements: [{ text_run: { content: 'Child' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('- Parent');
		expect(md).toContain('  - Child');
	});

	test('indents non-list children under list items for readability', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['b1'] }),
			makeBlock({
				block_id: 'b1',
				block_type: FEISHU_BLOCK_TYPE.BULLET,
				parent_id: 'root',
				children: ['t1', 'b2'],
				bullet: { elements: [{ text_run: { content: 'Parent item' } }] },
			}),
			makeBlock({
				block_id: 't1',
				block_type: FEISHU_BLOCK_TYPE.TEXT,
				parent_id: 'b1',
				text: { elements: [{ text_run: { content: 'Extra details' } }] },
			}),
			makeBlock({
				block_id: 'b2',
				block_type: FEISHU_BLOCK_TYPE.BULLET,
				parent_id: 'b1',
				bullet: { elements: [{ text_run: { content: 'Nested item' } }] },
			}),
		];

		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('- Parent item\n  Extra details');
		expect(md).toContain('  - Nested item');
	});

	test('renders ordered list', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['b1', 'b2'] }),
			makeBlock({ block_id: 'b1', block_type: FEISHU_BLOCK_TYPE.ORDERED, parent_id: 'root', ordered: { elements: [{ text_run: { content: 'First' } }] } }),
			makeBlock({ block_id: 'b2', block_type: FEISHU_BLOCK_TYPE.ORDERED, parent_id: 'root', ordered: { elements: [{ text_run: { content: 'Second' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('1. First');
		expect(md).toContain('1. Second');
	});

	test('renders todo items', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['t1', 't2'] }),
			makeBlock({ block_id: 't1', block_type: FEISHU_BLOCK_TYPE.TODO, parent_id: 'root', todo: { style: { done: true }, elements: [{ text_run: { content: 'Done task' } }] } }),
			makeBlock({ block_id: 't2', block_type: FEISHU_BLOCK_TYPE.TODO, parent_id: 'root', todo: { style: { done: false }, elements: [{ text_run: { content: 'Pending task' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('- [x] Done task');
		expect(md).toContain('- [ ] Pending task');
	});

	test('renders code block with language', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['c1'] }),
			makeBlock({
				block_id: 'c1', block_type: FEISHU_BLOCK_TYPE.CODE, parent_id: 'root',
				code: { style: { language: 49 }, elements: [{ text_run: { content: 'print("hello")' } }] },
			}),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('```python\nprint("hello")\n```');
	});

	test('renders quote', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['q1'] }),
			makeBlock({ block_id: 'q1', block_type: FEISHU_BLOCK_TYPE.QUOTE, parent_id: 'root', quote: { elements: [{ text_run: { content: 'A wise quote' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('> A wise quote');
	});

	test('renders callout with children', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['cal'] }),
			makeBlock({ block_id: 'cal', block_type: FEISHU_BLOCK_TYPE.CALLOUT, parent_id: 'root', children: ['cal-t1'], callout: { emoji_id: 'warning' } }),
			makeBlock({ block_id: 'cal-t1', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'cal', text: { elements: [{ text_run: { content: 'Important note' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('> [!WARNING]');
		expect(md).toContain('> Important note');
	});

	test('maps warning-style callouts to readable admonitions', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['cal'] }),
			makeBlock({ block_id: 'cal', block_type: FEISHU_BLOCK_TYPE.CALLOUT, parent_id: 'root', children: ['cal-t1'], callout: { emoji_id: 'warning' } }),
			makeBlock({ block_id: 'cal-t1', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'cal', text: { elements: [{ text_run: { content: 'Handle with care' } }] } }),
		];

		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('> [!WARNING]');
		expect(md).toContain('> Handle with care');
	});

	test('renders divider', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['d1'] }),
			makeBlock({ block_id: 'd1', block_type: FEISHU_BLOCK_TYPE.DIVIDER, parent_id: 'root', divider: {} }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('---');
	});

	test('renders image with caption', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['img1'] }),
			makeBlock({ block_id: 'img1', block_type: FEISHU_BLOCK_TYPE.IMAGE, parent_id: 'root', image: { token: 'abc123', width: 800, height: 600, caption: { content: 'My image' } } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('![My image](https://open.feishu.cn/open-apis/drive/v1/medias/abc123/download)');
	});

	test('renders table', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['tbl'] }),
			makeBlock({
				block_id: 'tbl', block_type: FEISHU_BLOCK_TYPE.TABLE, parent_id: 'root',
				children: ['c1', 'c2', 'c3', 'c4'],
				table: { cells: ['c1', 'c2', 'c3', 'c4'], property: { row_size: 2, column_size: 2 } },
			}),
			makeBlock({ block_id: 'c1', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['c1t'] }),
			makeBlock({ block_id: 'c1t', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'c1', text: { elements: [{ text_run: { content: 'Header 1' } }] } }),
			makeBlock({ block_id: 'c2', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['c2t'] }),
			makeBlock({ block_id: 'c2t', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'c2', text: { elements: [{ text_run: { content: 'Header 2' } }] } }),
			makeBlock({ block_id: 'c3', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['c3t'] }),
			makeBlock({ block_id: 'c3t', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'c3', text: { elements: [{ text_run: { content: 'Data 1' } }] } }),
			makeBlock({ block_id: 'c4', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['c4t'] }),
			makeBlock({ block_id: 'c4t', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'c4', text: { elements: [{ text_run: { content: 'Data 2' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('| Header 1 | Header 2 |');
		expect(md).toContain('| --- | --- |');
		expect(md).toContain('| Data 1 | Data 2 |');
	});

	test('renders nested block content inside table cells as readable text', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['tbl'] }),
			makeBlock({
				block_id: 'tbl', block_type: FEISHU_BLOCK_TYPE.TABLE, parent_id: 'root',
				children: ['c1', 'c2'],
				table: { cells: ['c1', 'c2'], property: { row_size: 1, column_size: 2 } },
			}),
			makeBlock({ block_id: 'c1', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['file1'] }),
			makeBlock({ block_id: 'file1', block_type: FEISHU_BLOCK_TYPE.FILE, parent_id: 'c1', file: { name: 'Quarterly Plan.pdf' } }),
			makeBlock({ block_id: 'c2', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['img1'] }),
			makeBlock({ block_id: 'img1', block_type: FEISHU_BLOCK_TYPE.IMAGE, parent_id: 'c2', image: { token: 'img-token', caption: { content: 'Architecture' } } }),
		];

		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('| Quarterly Plan.pdf | Architecture |');
	});

	test('renders equation', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['b1'] }),
			makeBlock({
				block_id: 'b1', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'root',
				text: { elements: [{ equation: { content: 'E=mc^2' } }] },
			}),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('$E=mc^2$');
	});

	test('renders mention_doc with decoded URL', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['b1'] }),
			makeBlock({
				block_id: 'b1', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'root',
				text: {
					elements: [{
						mention_doc: { token: 'abc', obj_type: 22, url: 'https%3A%2F%2Fexample.feishu.cn%2Fdocx%2Fabc' },
					}],
				},
			}),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('[abc](https://example.feishu.cn/docx/abc)');
	});

	test('renders table with merged cells (row_span)', () => {
		// 3x2 table where first column cell spans 2 rows:
		// | Category | Value |     merge_info: [{rs:2,cs:1}, {rs:1,cs:1},
		// | Category | Other |                  {rs:0,cs:0}, {rs:1,cs:1},
		// | New      | Last  |                  {rs:1,cs:1}, {rs:1,cs:1}]
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['tbl'] }),
			makeBlock({
				block_id: 'tbl', block_type: FEISHU_BLOCK_TYPE.TABLE, parent_id: 'root',
				children: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'],
				table: {
					cells: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'],
					property: {
						row_size: 3, column_size: 2,
						merge_info: [
							{ row_span: 2, col_span: 1 }, { row_span: 1, col_span: 1 },
							{ row_span: 0, col_span: 0 }, { row_span: 1, col_span: 1 },
							{ row_span: 1, col_span: 1 }, { row_span: 1, col_span: 1 },
						],
					},
				},
			}),
			makeBlock({ block_id: 'c0', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['c0t'] }),
			makeBlock({ block_id: 'c0t', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'c0', text: { elements: [{ text_run: { content: 'Category' } }] } }),
			makeBlock({ block_id: 'c1', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['c1t'] }),
			makeBlock({ block_id: 'c1t', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'c1', text: { elements: [{ text_run: { content: 'Value' } }] } }),
			makeBlock({ block_id: 'c2', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: [] }),
			makeBlock({ block_id: 'c3', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['c3t'] }),
			makeBlock({ block_id: 'c3t', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'c3', text: { elements: [{ text_run: { content: 'Other' } }] } }),
			makeBlock({ block_id: 'c4', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['c4t'] }),
			makeBlock({ block_id: 'c4t', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'c4', text: { elements: [{ text_run: { content: 'New' } }] } }),
			makeBlock({ block_id: 'c5', block_type: FEISHU_BLOCK_TYPE.TABLE_CELL, parent_id: 'tbl', children: ['c5t'] }),
			makeBlock({ block_id: 'c5t', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'c5', text: { elements: [{ text_run: { content: 'Last' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		// Continuation cell (row 1, col 0) should get "Category" from origin
		expect(md).toContain('| Category | Value |');
		expect(md).toContain('| Category | Other |');
		expect(md).toContain('| New | Last |');
	});

	test('renders board as whiteboard image', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['b1'] }),
			makeBlock({ block_id: 'b1', block_type: FEISHU_BLOCK_TYPE.BOARD, parent_id: 'root', board: { token: 'ZOAMwWeZXhKi0fb44hAc6CEwnLf' } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('![Board](https://open.feishu.cn/open-apis/board/v1/whiteboards/ZOAMwWeZXhKi0fb44hAc6CEwnLf/download_as_image)');
	});

	test('renders image and board with proper API URLs', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['img', 'board'] }),
			makeBlock({ block_id: 'img', block_type: FEISHU_BLOCK_TYPE.IMAGE, parent_id: 'root', image: { token: 'img123' } }),
			makeBlock({ block_id: 'board', block_type: FEISHU_BLOCK_TYPE.BOARD, parent_id: 'root', board: { token: 'board456' } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('![](https://open.feishu.cn/open-apis/drive/v1/medias/img123/download)');
		expect(md).toContain('![Board](https://open.feishu.cn/open-apis/board/v1/whiteboards/board456/download_as_image)');
	});

	test('returns empty for empty document', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: [], page: { elements: [{ text_run: { content: 'Empty' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md.trim()).toBe('');
	});

	test('renders mixed content document', () => {
		const blocks: FeishuApiBlock[] = [
			makeBlock({ block_id: 'root', block_type: FEISHU_BLOCK_TYPE.PAGE, children: ['h1', 't1', 'b1', 'b2', 'div', 't2'] }),
			makeBlock({ block_id: 'h1', block_type: FEISHU_BLOCK_TYPE.HEADING1, parent_id: 'root', heading1: { elements: [{ text_run: { content: 'Introduction' } }] } }),
			makeBlock({ block_id: 't1', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'root', text: { elements: [{ text_run: { content: 'Some text here.' } }] } }),
			makeBlock({ block_id: 'b1', block_type: FEISHU_BLOCK_TYPE.BULLET, parent_id: 'root', bullet: { elements: [{ text_run: { content: 'Point A' } }] } }),
			makeBlock({ block_id: 'b2', block_type: FEISHU_BLOCK_TYPE.BULLET, parent_id: 'root', bullet: { elements: [{ text_run: { content: 'Point B' } }] } }),
			makeBlock({ block_id: 'div', block_type: FEISHU_BLOCK_TYPE.DIVIDER, parent_id: 'root', divider: {} }),
			makeBlock({ block_id: 't2', block_type: FEISHU_BLOCK_TYPE.TEXT, parent_id: 'root', text: { elements: [{ text_run: { content: 'End.' } }] } }),
		];
		const md = convertFeishuBlocksToMarkdown(blocks, API_BASE);
		expect(md).toContain('# Introduction');
		expect(md).toContain('Some text here.');
		expect(md).toContain('- Point A');
		expect(md).toContain('- Point B');
		expect(md).toContain('---');
		expect(md).toContain('End.');
	});
});
