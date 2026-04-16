import type { FeishuApiBlock, FeishuText, FeishuTextElement, FeishuTextElementStyle } from '../../types/types';
import { FEISHU_BLOCK_TYPE } from '../../types/types';

const CODE_LANGUAGE_MAP: Record<number, string> = {
	1: 'plaintext', 2: 'abap', 3: 'ada', 4: 'apache', 5: 'apex',
	6: 'asm', 7: 'bash', 8: 'csharp', 9: 'cpp', 10: 'c',
	11: 'cobol', 12: 'css', 13: 'coffeescript', 14: 'd', 15: 'dart',
	16: 'delphi', 17: 'django', 18: 'dockerfile', 19: 'erlang', 20: 'fortran',
	21: 'foxpro', 22: 'go', 23: 'groovy', 24: 'html', 25: 'htmlbars',
	26: 'http', 27: 'haskell', 28: 'json', 29: 'java', 30: 'javascript',
	31: 'julia', 32: 'kotlin', 33: 'latex', 34: 'lisp', 35: 'logo',
	36: 'lua', 37: 'matlab', 38: 'makefile', 39: 'markdown', 40: 'nginx',
	41: 'objective-c', 42: 'openedge-abl', 43: 'php', 44: 'perl', 45: 'postscript',
	46: 'powershell', 47: 'prolog', 48: 'protobuf', 49: 'python', 50: 'r',
	51: 'rpg', 52: 'ruby', 53: 'rust', 54: 'sas', 55: 'scss',
	56: 'sql', 57: 'scala', 58: 'scheme', 59: 'scratch', 60: 'shell',
	61: 'swift', 62: 'thrift', 63: 'typescript', 64: 'vbscript', 65: 'visual-basic',
	66: 'xml', 67: 'yaml', 68: 'cmake', 69: 'diff', 70: 'gherkin',
	71: 'graphql', 72: 'glsl', 73: 'properties', 74: 'solidity', 75: 'toml',
};

interface RenderContext {
	apiBase: string;
	blockMap: Map<string, FeishuApiBlock>;
	sheetData?: Record<string, unknown[][]>;
}

function mediaUrl(ctx: RenderContext, token: string): string {
	return `${ctx.apiBase}/open-apis/drive/v1/medias/${token}/download`;
}

function decodeFeishuUrl(encoded: string): string {
	try {
		return decodeURIComponent(encoded);
	} catch {
		return encoded;
	}
}

function renderTextElementStyle(text: string, style?: FeishuTextElementStyle): string {
	if (!style || !text) return text;

	if (style.inline_code) {
		return `\`${text}\``;
	}

	let result = text;
	if (style.bold) result = `**${result}**`;
	if (style.italic) result = `*${result}*`;
	if (style.strikethrough) result = `~~${result}~~`;

	if (style.link?.url) {
		result = `[${result}](${decodeFeishuUrl(style.link.url)})`;
	}

	return result;
}

function renderTextElements(elements: FeishuTextElement[]): string {
	return elements.map(el => {
		if (el.text_run) {
			return renderTextElementStyle(el.text_run.content, el.text_run.text_element_style);
		}
		if (el.mention_user) {
			return renderTextElementStyle(`@${el.mention_user.user_id}`, el.mention_user.text_element_style);
		}
		if (el.mention_doc) {
			const url = decodeFeishuUrl(el.mention_doc.url);
			return `[${el.mention_doc.token}](${url})`;
		}
		if (el.equation) {
			return `$${el.equation.content}$`;
		}
		if (el.reminder) {
			const date = new Date(el.reminder.expire_time).toISOString().split('T')[0];
			return `[Reminder: ${date}]`;
		}
		if (el.file) {
			return `[file:${el.file.file_token || ''}]`;
		}
		return '';
	}).join('');
}

function normalizeBlockSpacing(text: string): string {
	return text
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n');
}

function ensureTrailingBlankLine(text: string): string {
	if (!text) return '';
	if (text.endsWith('\n\n')) return text;
	if (text.endsWith('\n')) return `${text}\n`;
	return `${text}\n\n`;
}

function joinBlockSegments(...segments: Array<string | undefined>): string {
	return normalizeBlockSpacing(
		segments
			.filter((segment): segment is string => !!segment)
			.join('')
	);
}

function getTextContent(block: FeishuApiBlock): FeishuText | undefined {
	const key = blockTypeToKey(block.block_type);
	if (!key) return undefined;
	const value = block[key];
	if (value && typeof value === 'object' && 'elements' in value) {
		return value as FeishuText;
	}
	return undefined;
}

function blockTypeToKey(blockType: number): string | undefined {
	const map: Record<number, string> = {
		[FEISHU_BLOCK_TYPE.PAGE]: 'page',
		[FEISHU_BLOCK_TYPE.TEXT]: 'text',
		[FEISHU_BLOCK_TYPE.HEADING1]: 'heading1',
		[FEISHU_BLOCK_TYPE.HEADING2]: 'heading2',
		[FEISHU_BLOCK_TYPE.HEADING3]: 'heading3',
		[FEISHU_BLOCK_TYPE.HEADING4]: 'heading4',
		[FEISHU_BLOCK_TYPE.HEADING5]: 'heading5',
		[FEISHU_BLOCK_TYPE.HEADING6]: 'heading6',
		[FEISHU_BLOCK_TYPE.HEADING7]: 'heading7',
		[FEISHU_BLOCK_TYPE.HEADING8]: 'heading8',
		[FEISHU_BLOCK_TYPE.HEADING9]: 'heading9',
		[FEISHU_BLOCK_TYPE.BULLET]: 'bullet',
		[FEISHU_BLOCK_TYPE.ORDERED]: 'ordered',
		[FEISHU_BLOCK_TYPE.CODE]: 'code',
		[FEISHU_BLOCK_TYPE.QUOTE]: 'quote',
		[FEISHU_BLOCK_TYPE.TODO]: 'todo',
	};
	return map[blockType];
}

function countListDepth(block: FeishuApiBlock, ctx: RenderContext): number {
	let depth = 0;
	let current = block;
	while (current.parent_id) {
		const parent = ctx.blockMap.get(current.parent_id);
		if (!parent) break;
		const pt = parent.block_type;
		if (pt === FEISHU_BLOCK_TYPE.BULLET || pt === FEISHU_BLOCK_TYPE.ORDERED || pt === FEISHU_BLOCK_TYPE.TODO) {
			depth++;
		}
		current = parent;
	}
	return depth;
}

function isListType(bt: number): boolean {
	return bt === FEISHU_BLOCK_TYPE.BULLET
		|| bt === FEISHU_BLOCK_TYPE.ORDERED
		|| bt === FEISHU_BLOCK_TYPE.TODO;
}

function renderChildren(block: FeishuApiBlock, ctx: RenderContext): string {
	if (!block.children?.length) return '';

	const parts: string[] = [];
	let prevWasList = false;

	for (const id of block.children) {
		const child = ctx.blockMap.get(id);
		if (!child) continue;

		const rendered = renderBlock(child, ctx);
		if (!rendered) continue;

		const isList = isListType(child.block_type);

		// When transitioning from list items to a non-list block (table, text, etc.),
		// ensure a blank line separates them so markdown renderers (Obsidian)
		// properly close the list context before the next block.
		if (prevWasList && !isList && !rendered.startsWith('\n')) {
			parts.push('\n');
		}

		parts.push(rendered);
		prevWasList = isList;
	}

	return parts.join('');
}

function indentBlock(text: string, indent: string): string {
	if (!text) return '';
	return text
		.split('\n')
		.map(line => line ? `${indent}${line}` : line)
		.join('\n');
}

function renderListChildren(block: FeishuApiBlock, ctx: RenderContext, indent: string): string {
	if (!block.children?.length) return '';

	return block.children
		.map(id => {
			const child = ctx.blockMap.get(id);
			if (!child) return '';

			const rendered = renderBlock(child, ctx);
			if (!rendered) return '';

			const isNestedList = child.block_type === FEISHU_BLOCK_TYPE.BULLET
				|| child.block_type === FEISHU_BLOCK_TYPE.ORDERED
				|| child.block_type === FEISHU_BLOCK_TYPE.TODO;

			// Block-level elements: don't indent (breaks markdown syntax)
			// AND prepend blank lines so they break out of the list context
			const isBlockLevel = child.block_type === FEISHU_BLOCK_TYPE.TABLE
				|| child.block_type === FEISHU_BLOCK_TYPE.SHEET
				|| child.block_type === FEISHU_BLOCK_TYPE.BITABLE
				|| child.block_type === FEISHU_BLOCK_TYPE.CODE
				|| child.block_type === FEISHU_BLOCK_TYPE.DIVIDER
				|| child.block_type === FEISHU_BLOCK_TYPE.IMAGE
				|| child.block_type === FEISHU_BLOCK_TYPE.BOARD
				|| child.block_type === FEISHU_BLOCK_TYPE.CALLOUT
				|| child.block_type === FEISHU_BLOCK_TYPE.QUOTE_CONTAINER;

			if (isBlockLevel) {
				// Two blank lines to fully break out of the list context in Obsidian
				return `\n\n${rendered}`;
			}

			return isNestedList ? rendered : indentBlock(rendered, `${indent}  `);
		})
		.join('');
}

function renderBlockInline(block: FeishuApiBlock, ctx: RenderContext): string {
	const text = getTextContent(block);
	if (text) return renderTextElements(text.elements);
	if (block.block_type === FEISHU_BLOCK_TYPE.IMAGE && block.image) return block.image.caption?.content || '[Image]';
	if (block.block_type === FEISHU_BLOCK_TYPE.FILE && block.file) return block.file.name || '[File]';

	const rendered = renderBlock(block, ctx);
	return rendered
		.replace(/```[\s\S]*?```/g, '[Code Block]')
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[*_`>#-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function renderChildrenInline(block: FeishuApiBlock, ctx: RenderContext): string {
	if (!block.children?.length) return '';
	return block.children
		.map(id => {
			const child = ctx.blockMap.get(id);
			if (!child) return '';
			return renderBlockInline(child, ctx);
		})
		.filter(Boolean)
		.join(' ');
}

function prefixLines(text: string, prefix: string): string {
	return text.split('\n').map(line => `${prefix}${line}`).join('\n');
}

function detectCalloutType(block: FeishuApiBlock): string {
	const emojiId = block.callout?.emoji_id?.toLowerCase() || '';
	if (/(warn|warning|alert|error|caution|danger)/.test(emojiId)) return 'WARNING';
	if (/(tip|idea|light|bulb|success|check)/.test(emojiId)) return 'TIP';
	if (/(important|star|pin|notice)/.test(emojiId)) return 'IMPORTANT';
	return 'NOTE';
}

function renderBlock(block: FeishuApiBlock, ctx: RenderContext): string {
	const bt = block.block_type;
	const text = getTextContent(block);

	if (bt === FEISHU_BLOCK_TYPE.PAGE) {
		return renderChildren(block, ctx);
	}

	if (bt === FEISHU_BLOCK_TYPE.TEXT) {
		const content = text ? renderTextElements(text.elements) : '';
		const children = renderChildren(block, ctx);
		if (!content && !children) return '';
		return joinBlockSegments(
			content ? ensureTrailingBlankLine(content) : '',
			children,
		);
	}

	if (bt >= FEISHU_BLOCK_TYPE.HEADING1 && bt <= FEISHU_BLOCK_TYPE.HEADING9) {
		const level = Math.min(bt - FEISHU_BLOCK_TYPE.HEADING1 + 1, 6);
		const content = text ? renderTextElements(text.elements) : '';
		const children = renderChildren(block, ctx);
		return joinBlockSegments(
			ensureTrailingBlankLine(`${'#'.repeat(level)} ${content}`.trimEnd()),
			children,
		);
	}

	if (bt === FEISHU_BLOCK_TYPE.BULLET) {
		const depth = countListDepth(block, ctx);
		const indent = '  '.repeat(depth);
		const content = text ? renderTextElements(text.elements) : '';
		const childContent = renderListChildren(block, ctx, indent);
		return `${indent}- ${content}\n${childContent}`;
	}

	if (bt === FEISHU_BLOCK_TYPE.ORDERED) {
		const depth = countListDepth(block, ctx);
		const indent = '  '.repeat(depth);
		const content = text ? renderTextElements(text.elements) : '';
		const sequence = text?.style?.sequence?.trim() || '1.';
		const marker = /[.)]$/.test(sequence) ? sequence : `${sequence}.`;
		const childContent = renderListChildren(block, ctx, indent);
		return `${indent}${marker} ${content}\n${childContent}`;
	}

	if (bt === FEISHU_BLOCK_TYPE.TODO) {
		const depth = countListDepth(block, ctx);
		const indent = '  '.repeat(depth);
		const done = text?.style?.done ? 'x' : ' ';
		const content = text ? renderTextElements(text.elements) : '';
		const childContent = renderListChildren(block, ctx, indent);
		return `${indent}- [${done}] ${content}\n${childContent}`;
	}

	if (bt === FEISHU_BLOCK_TYPE.CODE) {
		const lang = CODE_LANGUAGE_MAP[text?.style?.language || 0] || '';
		const content = text ? renderTextElements(text.elements) : '';
		return `\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.QUOTE) {
		const content = text ? renderTextElements(text.elements) : '';
		const children = renderChildren(block, ctx).trimEnd();
		const body = [content, children].filter(Boolean).join('\n\n');
		return body ? `${prefixLines(body, '> ')}\n\n` : '';
	}

	if (bt === FEISHU_BLOCK_TYPE.QUOTE_CONTAINER) {
		const childContent = renderChildren(block, ctx);
		return prefixLines(childContent.trimEnd(), '> ') + '\n\n';
	}

	if (bt === FEISHU_BLOCK_TYPE.CALLOUT) {
		const childContent = renderChildren(block, ctx);
		const calloutType = detectCalloutType(block);
		const renderedChildren = childContent.trimEnd();
		return renderedChildren
			? `> [!${calloutType}]\n${prefixLines(renderedChildren, '> ')}\n\n`
			: `> [!${calloutType}]\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.DIVIDER) {
		return '---\n\n';
	}

	// Image — use authenticated media URL
	if (bt === FEISHU_BLOCK_TYPE.IMAGE && block.image) {
		const caption = block.image.caption?.content || '';
		return `![${caption}](${mediaUrl(ctx, block.image.token)})\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.FILE && block.file) {
		const name = block.file.name || 'file';
		return `[File: ${name}]\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.TABLE && block.table) {
		return renderTable(block, ctx);
	}

	if (bt === FEISHU_BLOCK_TYPE.TABLE_CELL) {
		return '';
	}

	if (bt === FEISHU_BLOCK_TYPE.GRID || bt === FEISHU_BLOCK_TYPE.GRID_COLUMN || bt === FEISHU_BLOCK_TYPE.VIEW) {
		return renderChildren(block, ctx);
	}

	if (bt === FEISHU_BLOCK_TYPE.IFRAME && block.iframe) {
		const url = decodeFeishuUrl(block.iframe.component.url);
		return `[Embedded Content](${url})\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.BITABLE && block.bitable) {
		return `[Database: ${block.bitable.token}]\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.SHEET && block.sheet) {
		const token = block.sheet.token || '';
		const rows = ctx.sheetData?.[token];
		if (rows && rows.length > 0) {
			return renderSheetValues(rows);
		}
		return `[Spreadsheet: ${token}]\n\n`;
	}

	// Board — use whiteboard download_as_image API (auth handled by media resolver)
	if (bt === FEISHU_BLOCK_TYPE.BOARD && block.board) {
		return `![Board](${ctx.apiBase}/open-apis/board/v1/whiteboards/${block.board.token}/download_as_image)\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.CHAT_CARD) {
		return '[Chat Card]\n\n';
	}

	if (bt === FEISHU_BLOCK_TYPE.DIAGRAM) {
		return '[Diagram]\n\n';
	}

	if (bt === FEISHU_BLOCK_TYPE.ISV || bt === FEISHU_BLOCK_TYPE.ADD_ONS) {
		const content = renderChildren(block, ctx).trim();
		return content ? ensureTrailingBlankLine(content) : '[Embedded App]\n\n';
	}

	if (bt === FEISHU_BLOCK_TYPE.JIRA_ISSUE && block.jira_issue) {
		return `[Jira: ${block.jira_issue.key || block.jira_issue.id}]\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.TASK && block.task) {
		return `[Task: ${block.task.task_id}]\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.OKR || bt === FEISHU_BLOCK_TYPE.OKR_OBJECTIVE || bt === FEISHU_BLOCK_TYPE.OKR_KEY_RESULT || bt === FEISHU_BLOCK_TYPE.OKR_PROGRESS) {
		const okrText = (block.okr_objective?.content || block.okr_key_result?.content);
		if (okrText) return `${renderTextElements(okrText.elements)}\n\n`;
		return renderChildren(block, ctx);
	}

	if (bt === FEISHU_BLOCK_TYPE.AGENDA || bt === FEISHU_BLOCK_TYPE.AGENDA_ITEM || bt === FEISHU_BLOCK_TYPE.AGENDA_ITEM_CONTENT) {
		return renderChildren(block, ctx);
	}

	if (bt === FEISHU_BLOCK_TYPE.AGENDA_ITEM_TITLE) {
		const content = text ? renderTextElements(text.elements) : '';
		return content ? `**${content}**\n\n` : '';
	}

	if (bt === FEISHU_BLOCK_TYPE.SOURCE_SYNCED) {
		return renderChildren(block, ctx);
	}

	if (bt === FEISHU_BLOCK_TYPE.REFERENCE_SYNCED && block.reference_synced) {
		return `[Synced from: ${block.reference_synced.source_document_id}]\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.LINK_PREVIEW && block.link_preview?.url) {
		return `[Link Preview](${decodeFeishuUrl(block.link_preview.url)})\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.MINDNOTE && block.mindnote) {
		return `[Mindnote: ${block.mindnote.token}]\n\n`;
	}

	if (bt === FEISHU_BLOCK_TYPE.WIKI_CATALOG || bt === FEISHU_BLOCK_TYPE.SUB_PAGE_LIST || bt === FEISHU_BLOCK_TYPE.AI_TEMPLATE) {
		return renderChildren(block, ctx);
	}

	if (block.children?.length) {
		return renderChildren(block, ctx);
	}

	return '';
}

function renderCellContent(cellBlock: FeishuApiBlock, ctx: RenderContext): string {
	return renderChildrenInline(cellBlock, ctx)
		.replace(/\|/g, '\\|')
		.replace(/\n/g, ' ')
		.trim();
}

function renderTable(block: FeishuApiBlock, ctx: RenderContext): string {
	const table = block.table;
	if (!table) return '';

	const { row_size, column_size, merge_info } = table.property;
	const cells = table.cells || [];
	const totalCells = row_size * column_size;

	// First pass: render all cell content from the block tree
	const cellContents: string[] = [];
	for (let i = 0; i < totalCells; i++) {
		const cellId = cells[i];
		const cellBlock = cellId ? ctx.blockMap.get(cellId) : undefined;
		cellContents.push(cellBlock ? renderCellContent(cellBlock, ctx) : '');
	}

	// Second pass: handle merged cells
	// merge_info[i].row_span >= 1, col_span >= 1 → normal or origin cell
	// merge_info[i].row_span == 0 or col_span == 0 → continuation cell (absorbed into merge)
	if (merge_info && merge_info.length > 0) {
		// Build origin map: for each cell index, store origin cell index
		const originMap = new Array<number>(totalCells).fill(-1);

		for (let r = 0; r < row_size; r++) {
			for (let c = 0; c < column_size; c++) {
				const idx = r * column_size + c;
				if (idx >= merge_info.length) continue;
				const mi = merge_info[idx];
				if (!mi) continue;
				const rs = mi.row_span ?? 1;
				const cs = mi.col_span ?? 1;
				if (rs < 1 || cs < 1) continue; // skip continuation cells

				// Mark all cells in this span as belonging to this origin
				for (let dr = 0; dr < rs; dr++) {
					for (let dc = 0; dc < cs; dc++) {
						const targetIdx = (r + dr) * column_size + (c + dc);
						if (targetIdx < totalCells) {
							originMap[targetIdx] = idx;
						}
					}
				}
			}
		}

		// Fill continuation cells with their origin's content
		for (let i = 0; i < totalCells; i++) {
			if (i >= merge_info.length) continue;
			const mi = merge_info[i];
			if (!mi) continue;
			const rs = mi.row_span ?? 1;
			const cs = mi.col_span ?? 1;
			if (rs === 0 || cs === 0) {
				// This is a continuation cell — copy origin content
				const originIdx = originMap[i];
				if (originIdx >= 0 && originIdx < totalCells && originIdx !== i) {
					cellContents[i] = cellContents[originIdx];
				}
			}
		}
	}

	const rows: string[][] = [];
	for (let r = 0; r < row_size; r++) {
		const row: string[] = [];
		for (let c = 0; c < column_size; c++) {
			row.push(cellContents[r * column_size + c] || '');
		}
		rows.push(row);
	}

	if (rows.length === 0) return '';

	const lines: string[] = [];
	lines.push(`| ${rows[0].join(' | ')} |`);
	lines.push(`| ${rows[0].map(() => '---').join(' | ')} |`);
	for (let r = 1; r < rows.length; r++) {
		lines.push(`| ${rows[r].join(' | ')} |`);
	}

	return lines.join('\n') + '\n\n';
}

function cellToString(cell: unknown): string {
	if (cell == null) return '';
	if (typeof cell === 'string') return cell;
	if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
	if (Array.isArray(cell)) {
		return cell.map(v => typeof v === 'object' && v !== null ? (v as Record<string, unknown>).text || '' : String(v ?? '')).join('');
	}
	if (typeof cell === 'object') {
		const obj = cell as Record<string, unknown>;
		return String(obj.text || obj.value || obj.content || JSON.stringify(cell));
	}
	return String(cell);
}

function renderSheetValues(rows: unknown[][]): string {
	if (rows.length === 0) return '';

	const colCount = Math.max(...rows.map(r => r.length));
	const normalized = rows.map(r => {
		const row = r.map(cell => cellToString(cell).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim());
		while (row.length < colCount) row.push('');
		return row;
	});

	const lines: string[] = [];
	lines.push(`| ${normalized[0].join(' | ')} |`);
	lines.push(`| ${normalized[0].map(() => '---').join(' | ')} |`);
	for (let r = 1; r < normalized.length; r++) {
		lines.push(`| ${normalized[r].join(' | ')} |`);
	}
	return lines.join('\n') + '\n\n';
}

export function convertFeishuBlocksToMarkdown(blocks: FeishuApiBlock[], apiBase: string, _accessToken?: string, sheetData?: Record<string, unknown[][]>, comments?: unknown[]): string {
	const blockMap = new Map<string, FeishuApiBlock>();
	for (const block of blocks) {
		blockMap.set(block.block_id, block);
	}

	// Build comment map: comment_id → comment text
	const commentMap = new Map<string, string>();
	if (comments) {
		for (const c of comments) {
			const comment = c as Record<string, unknown>;
			const commentId = comment.comment_id as string;
			const quote = comment.quote as string || '';
			const replies = ((comment.reply_list as Record<string, unknown>)?.replies as unknown[]) || [];
			const replyTexts = replies.map((r: unknown) => {
				const reply = r as Record<string, unknown>;
				const elements = ((reply.content as Record<string, unknown>)?.elements as unknown[]) || [];
				return elements.map((el: unknown) => {
					const elem = el as Record<string, unknown>;
					if (elem.type === 'text_run') {
						return ((elem.text_run as Record<string, unknown>)?.text as string) || '';
					}
					return '';
				}).join('');
			}).filter(Boolean);
			if (commentId && replyTexts.length > 0) {
				const text = replyTexts.join(' | ');
				commentMap.set(commentId, quote ? `"${quote}" — ${text}` : text);
			}
		}
	}

	const ctx: RenderContext = { apiBase, blockMap, sheetData };
	const root = blocks[0];
	if (!root) return '';

	let content: string;
	if (root.block_type === FEISHU_BLOCK_TYPE.PAGE) {
		content = renderChildren(root, ctx).trim();
	} else {
		content = blocks
			.filter(b => !b.parent_id || b.parent_id === '')
			.map(b => renderBlock(b, ctx))
			.join('')
			.trim();
	}

	// Append comments as a section at the end
	if (commentMap.size > 0) {
		content += '\n\n---\n\n## Comments\n\n';
		let i = 1;
		for (const [, text] of commentMap) {
			content += `${i}. ${text}\n`;
			i++;
		}
	}

	return content + '\n';
}
