import type { AssetAuthContext, RichMediaAsset, RichMediaExtractionResult, RichMediaAssetType } from '../../types/types';

interface FeishuBlockNode {
	id: string;
	type: string;
	element: Element;
	children: FeishuBlockNode[];
	parentId?: string;
	depth: number;
	folded: boolean;
}

function absoluteUrl(url: string | null | undefined, baseUrl: string): string | undefined {
	if (!url) {
		return undefined;
	}

	try {
		return new URL(url, baseUrl).href;
	} catch {
		return url;
	}
}

function parseBackgroundImage(style: string | null): string | undefined {
	if (!style) {
		return undefined;
	}
	const match = style.match(/background-image:\s*url\((["']?)(.*?)\1\)/i);
	return match?.[2];
}

function extractCaption(element: Element): string | undefined {
	const caption = element.querySelector('figcaption, [data-caption], .caption, .docs-image-caption, .text-caption, .docx-image-caption');
	const text = caption?.textContent?.trim();
	if (text) {
		return text;
	}

	const captionAttr = element.getAttribute('data-caption') || element.getAttribute('aria-label');
	return captionAttr?.trim() || undefined;
}

function createFigure(document: Document, asset: RichMediaAsset): HTMLElement {
	const figure = document.createElement('figure');
	figure.setAttribute('data-rich-media-id', asset.id);
	figure.setAttribute('data-rich-media-type', asset.type);
	figure.setAttribute('data-rich-media-platform', asset.platform);

	const img = document.createElement('img');
	img.src = asset.markdownUrl || asset.resolvedUrl || asset.fetchUrl;
	img.alt = asset.altText || asset.caption || '';
	figure.appendChild(img);

	if (asset.caption) {
		const figcaption = document.createElement('figcaption');
		figcaption.textContent = asset.caption;
		figure.appendChild(figcaption);
	}

	return figure;
}

function pushAsset(
	assets: RichMediaAsset[],
	baseUrl: string,
	authContext: AssetAuthContext,
	counter: number,
	type: RichMediaAssetType,
	url: string,
	metadata: Partial<RichMediaAsset> = {},
): RichMediaAsset {
	const resolvedUrl = absoluteUrl(url, baseUrl) || url;
	const asset: RichMediaAsset = {
		id: `feishu-${type}-${counter}`,
		platform: 'feishu',
		type,
		originalUrl: metadata.originalUrl || resolvedUrl,
		fetchUrl: resolvedUrl,
		resolvedUrl,
		markdownUrl: metadata.markdownUrl || resolvedUrl,
		altText: metadata.altText,
		caption: metadata.caption,
		authRequired: !resolvedUrl.startsWith('data:'),
		authContext,
		blockMetadata: metadata.blockMetadata,
		rawBinaryMetadata: metadata.rawBinaryMetadata,
	};
	assets.push(asset);
	return asset;
}

function isLikelyFeishuMediaUrl(url: string | undefined): boolean {
	return !!url && /(feishu|larksuite|larkoffice|image|img|preview|asset|static|stream|download|attachment|cdn)/i.test(url);
}

function isFoldedElement(element: Element): boolean {
	const markers = [
		element.getAttribute('data-folded'),
		element.getAttribute('data-collapsed'),
		element.getAttribute('data-expand'),
		element.getAttribute('data-expanded'),
		element.getAttribute('data-state'),
		element.getAttribute('aria-expanded'),
		element.getAttribute('data-block-folded'),
		element.getAttribute('data-is-folded'),
	];

	if (markers.some(value => value === 'true' || value === 'folded' || value === 'collapsed' || value === 'false')) {
		return true;
	}

	const className = element.getAttribute('class') || '';
	return /(folded|collapsed|is-folded|is-collapsed)/i.test(className);
}

function isHiddenElement(element: Element): boolean {
	const htmlElement = element as HTMLElement;
	const style = htmlElement.getAttribute('style') || '';
	const ariaHidden = htmlElement.getAttribute('aria-hidden') === 'true';
	const hiddenAttr = htmlElement.hasAttribute('hidden');
	const computedHidden = typeof htmlElement.offsetParent !== 'undefined' && htmlElement.offsetParent === null
		&& !/(fixed|sticky)/i.test(style)
		&& !isFoldedElement(element);
	return hiddenAttr || ariaHidden || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style) || computedHidden;
}

function getBlockType(element: Element): string | null {
	const attrType = element.getAttribute('data-block-type') || element.getAttribute('data-type');
	if (attrType) {
		return attrType.toLowerCase();
	}

	const className = element.getAttribute('class') || '';
	const match = className.match(/docx-([a-z0-9_\-]+)-block/i);
	return match?.[1]?.toLowerCase() || null;
}

function getBlockId(element: Element, index: number): string {
	return element.getAttribute('data-block-id')
		|| element.getAttribute('data-id')
		|| element.id
		|| `block-${index}`;
}

function createRootBlock(document: Document): FeishuBlockNode {
	return {
		id: 'root',
		type: 'root',
		element: document.body,
		children: [],
		depth: -1,
		folded: false,
	};
}

function buildFeishuBlockTree(document: Document): FeishuBlockNode[] {
	const elements = Array.from(document.querySelectorAll('[data-block-type], [data-block-id], .docx-page-block, .docx-text-block, .docx-heading1-block, .docx-heading2-block, .docx-heading3-block, .docx-bullet-block, .docx-ordered-block, .docx-code-block, .docx-quote-block, .docx-table-block, .docx-callout-block, .docx-file-block, .docx-grid-block, .docx-grid_column-block, .docx-iframe-block, .docx-sheet-block, .docx-bitable-block, .docx-view-block, .docx-diagram-block, .docx-whiteboard-block, .docx-equation-block, .docx-gallery-block, .docx-task-block, .docx-okr-block, .docx-add_ons-block, .docx-jira_issue-block, .docx-ai-summary-block'));

	const root = createRootBlock(document);
	const nodeMap = new Map<string, FeishuBlockNode>([[root.id, root]]);
	const elementMap = new Map<Element, FeishuBlockNode>();

	elements.forEach((element, index) => {
		const type = getBlockType(element);
		if (!type || isHiddenElement(element)) {
			return;
		}

		const node: FeishuBlockNode = {
			id: getBlockId(element, index),
			type,
			element,
			children: [],
			depth: 0,
			folded: isFoldedElement(element),
		};
		nodeMap.set(node.id, node);
		elementMap.set(element, node);
	});

	for (const node of elementMap.values()) {
		let parentElement = node.element.parentElement;
		let parentNode: FeishuBlockNode | undefined;
		while (parentElement) {
			const candidate = elementMap.get(parentElement);
			if (candidate) {
				parentNode = candidate;
				break;
			}
			parentElement = parentElement.parentElement;
		}

		const effectiveParent = parentNode || root;
		node.parentId = effectiveParent.id;
		node.depth = effectiveParent.depth + 1;
		effectiveParent.children.push(node);
	}

	return root.children;
}

function findDirectBlockChild(element: Element): Element | null {
	return Array.from(element.children).find(child => !!getBlockType(child)) || null;
}

function collectBlockContentHtml(element: Element): string {
	const clone = element.cloneNode(true) as HTMLElement;
	const nestedBlocks = Array.from(clone.querySelectorAll('[data-block-type], [data-block-id], [class*="docx-"]'));
	for (const nested of nestedBlocks) {
		const nestedType = getBlockType(nested);
		if (!nestedType) {
			continue;
		}
		const directChild = findDirectBlockChild(clone);
		if (nested !== directChild && clone.contains(nested)) {
			nested.remove();
		}
	}
	return clone.innerHTML;
}

function unwrapElement(element: Element) {
	element.replaceWith(...Array.from(element.childNodes));
}

function createBlockElement(document: Document, tagName: string, html: string): HTMLElement {
	const element = document.createElement(tagName);
	element.innerHTML = html;
	return element;
}

function createLinkParagraph(document: Document, href: string, text: string): HTMLElement {
	const p = document.createElement('p');
	const link = document.createElement('a');
	link.href = href;
	link.textContent = text;
	p.appendChild(link);
	return p;
}

function convertFeishuInlineElements(document: Document) {
	for (const el of Array.from(document.querySelectorAll('.at-user-embed-container'))) {
		const name = el.querySelector('.gpf-at-user-name')?.textContent?.trim();
		el.replaceWith(document.createTextNode(name ? `@${name}` : ''));
	}

	for (const el of Array.from(document.querySelectorAll('.abbreviation-inline-wrapper'))) {
		const text = el.querySelector('.abbreviation-text')?.textContent?.trim();
		el.replaceWith(document.createTextNode(text || ''));
	}

	for (const el of Array.from(document.querySelectorAll('.mention-doc-embed-container'))) {
		const anchor = el.querySelector('a[href]');
		const title = el.querySelector('.embed-text-container')?.textContent?.trim();
		if (anchor) {
			const link = document.createElement('a');
			link.href = anchor.getAttribute('href') || '';
			link.textContent = title || link.href;
			el.replaceWith(link);
		} else {
			el.replaceWith(document.createTextNode(title || ''));
		}
	}

	for (const el of Array.from(document.querySelectorAll('.inline-equation, .equation-inline, [data-type="equation"]:not([data-block-type])'))) {
		const formula = el.getAttribute('data-equation') || el.textContent?.trim();
		if (formula) {
			el.replaceWith(document.createTextNode(`$${formula}$`));
		}
	}

	for (const el of Array.from(document.querySelectorAll('.reminder-inline, [data-type="reminder"]'))) {
		const text = el.textContent?.trim();
		if (text) {
			el.replaceWith(document.createTextNode(text));
		}
	}

	for (const el of Array.from(document.querySelectorAll('.inline-file, [data-type="file"]:not([data-block-type])'))) {
		const anchor = el.querySelector('a[href]');
		const fileName = el.querySelector('.file-name, .filename')?.textContent?.trim() || el.textContent?.trim();
		if (anchor) {
			const link = document.createElement('a');
			link.href = anchor.getAttribute('href') || '';
			link.textContent = fileName || 'file';
			el.replaceWith(link);
		} else if (fileName) {
			el.replaceWith(document.createTextNode(`[${fileName}]`));
		}
	}
}

function mergeConsecutiveListBlocks(document: Document, root: ParentNode, selector: string, listTagName: 'ul' | 'ol') {
	const blocks = Array.from(root.querySelectorAll(selector));
	let currentList: HTMLElement | null = null;
	let currentParent: ParentNode | null = null;

	for (const block of blocks) {
		if (block.tagName.toLowerCase() !== 'li') {
			continue;
		}

		const parent = block.parentNode;
		if (!parent) {
			continue;
		}

		const previous = block.previousElementSibling;
		const shouldAppend = !!currentList
			&& currentParent === parent
			&& (!previous || previous.tagName.toLowerCase() === 'li' || previous === currentList);

		if (!shouldAppend) {
			currentList = document.createElement(listTagName);
			currentParent = parent;
			parent.insertBefore(currentList, block);
		}

		if (currentList) {
			currentList.appendChild(block);
		}
	}
}

function renderBlockNode(document: Document, node: FeishuBlockNode): void {
	const { element, type } = node;
	const contentHtml = collectBlockContentHtml(element);

	switch (type) {
		case 'text':
		case 'paragraph': {
			element.replaceWith(createBlockElement(document, 'p', contentHtml));
			break;
		}
		case 'heading1':
		case 'heading2':
		case 'heading3':
		case 'heading4':
		case 'heading5':
		case 'heading6':
		case 'heading7':
		case 'heading8':
		case 'heading9': {
			const level = Number(type.replace('heading', ''));
			element.replaceWith(createBlockElement(document, `h${Math.min(level, 6)}`, contentHtml));
			break;
		}
		case 'bullet': {
			const li = createBlockElement(document, 'li', contentHtml);
			element.replaceWith(li);
			break;
		}
		case 'ordered': {
			const li = createBlockElement(document, 'li', contentHtml);
			li.setAttribute('data-feishu-list', 'ordered');
			element.replaceWith(li);
			break;
		}
		case 'code': {
			const pre = document.createElement('pre');
			const code = document.createElement('code');
			code.innerHTML = contentHtml;
			pre.appendChild(code);
			element.replaceWith(pre);
			break;
		}
		case 'quote':
		case 'quote_container':
		case 'ai-summary':
		case 'ai_summary': {
			element.replaceWith(createBlockElement(document, 'blockquote', contentHtml));
			break;
		}
		case 'todo':
		case 'task_list': {
			const li = document.createElement('li');
			const checkbox = element.querySelector('input[type="checkbox"], [data-checked]');
			const isChecked = checkbox?.hasAttribute('checked') || checkbox?.getAttribute('data-checked') === 'true';
			li.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''} disabled /> ${contentHtml}`;
			element.replaceWith(li);
			break;
		}
		case 'table': {
			if (element.tagName.toLowerCase() === 'table') {
				break;
			}
			const existingTable = element.querySelector('table.table, table');
			if (existingTable) {
				element.replaceWith(existingTable);
				break;
			}
			const newTable = document.createElement('table');
			const rows = Array.from(element.children).filter((child) => {
				const tagName = child.tagName.toLowerCase();
				return tagName === 'tr'
					|| child.matches('.docx-table-tr, .block-table-row, .docx-table-row, .table-row');
			});
			for (const row of rows) {
				const tr = document.createElement('tr');
				const cells = Array.from(row.children).filter((child) => {
					const tagName = child.tagName.toLowerCase();
					return tagName === 'td'
						|| tagName === 'th'
						|| child.matches('[data-block-type="table_cell"], .docx-table_cell-block, .block-table-cell, .docx-table-cell, .table-cell');
				});
				for (const cell of cells) {
					const tagName = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td';
					const td = document.createElement(tagName);
					const rowspan = cell.getAttribute('rowspan');
					const colspan = cell.getAttribute('colspan');
					if (rowspan) td.setAttribute('rowspan', rowspan);
					if (colspan) td.setAttribute('colspan', colspan);
					td.innerHTML = collectBlockContentHtml(cell);
					tr.appendChild(td);
				}
				if (tr.childElementCount > 0) {
					newTable.appendChild(tr);
				}
			}
			if (newTable.childElementCount > 0) {
				element.replaceWith(newTable);
			}
			break;
		}
		case 'callout': {
			const bq = createBlockElement(document, 'blockquote', `[!NOTE]<br/>${contentHtml}`);
			element.replaceWith(bq);
			break;
		}
		case 'divider':
		case 'horizontalline':
		case 'horizontal_line': {
			element.replaceWith(document.createElement('hr'));
			break;
		}
		case 'file': {
			const anchor = element.querySelector('a[href]');
			const fileName = element.querySelector('.file-name, .filename, .file-block-name')?.textContent?.trim()
				|| element.getAttribute('data-file-name')
				|| element.textContent?.trim();
			if (anchor) {
				element.replaceWith(createLinkParagraph(document, anchor.getAttribute('href') || '', fileName || 'file'));
			} else {
				const p = document.createElement('p');
				p.textContent = fileName ? `[${fileName}]` : '[File]';
				element.replaceWith(p);
			}
			break;
		}
		case 'grid':
		case 'grid_column':
		case 'page': {
			unwrapElement(element);
			break;
		}
		case 'iframe':
		case 'embeddedpage':
		case 'embedded_page': {
			const iframe = element.querySelector('iframe');
			const embedUrl = iframe?.getAttribute('src') || element.getAttribute('data-src') || element.getAttribute('data-url');
			if (embedUrl) {
				element.replaceWith(createLinkParagraph(document, embedUrl, embedUrl));
			} else {
				const p = document.createElement('p');
				p.textContent = element.textContent?.trim() || '[Embedded Content]';
				element.replaceWith(p);
			}
			break;
		}
		case 'isv': {
			const pre = document.createElement('pre');
			const code = document.createElement('code');
			code.className = 'language-mermaid';
			code.textContent = element.textContent?.trim() || '';
			pre.appendChild(code);
			element.replaceWith(pre);
			break;
		}
		case 'mindnote':
		case 'view':
		case 'diagram':
		case 'whiteboard':
		case 'gallery': {
			const container = document.createElement('div');
			container.innerHTML = contentHtml;
			element.replaceWith(container);
			break;
		}
		case 'sheet': {
			const token = element.getAttribute('data-token') || element.getAttribute('data-sheet-token');
			const title = element.querySelector('.sheet-title, .block-title')?.textContent?.trim() || element.textContent?.trim();
			const href = token ? `https://bytedance.larkoffice.com/sheets/${token}` : '';
			element.replaceWith(href ? createLinkParagraph(document, href, title || `[Spreadsheet: ${token}]`) : createBlockElement(document, 'p', title ? `[Spreadsheet: ${title}]` : '[Embedded Spreadsheet]'));
			break;
		}
		case 'bitable': {
			const token = element.getAttribute('data-token') || element.getAttribute('data-bitable-token');
			const title = element.querySelector('.bitable-title, .block-title')?.textContent?.trim() || element.textContent?.trim();
			const href = token ? `https://bytedance.larkoffice.com/base/${token}` : '';
			element.replaceWith(href ? createLinkParagraph(document, href, title || `[Database: ${token}]`) : createBlockElement(document, 'p', title ? `[Database: ${title}]` : '[Embedded Database]'));
			break;
		}
		case 'chat_card':
		case 'chatgroup':
		case 'chat_group': {
			const p = document.createElement('p');
			const name = element.querySelector('.chat-name, .group-name')?.textContent?.trim() || element.textContent?.trim();
			p.textContent = name ? `[Chat: ${name}]` : '[Chat]';
			element.replaceWith(p);
			break;
		}
		case 'equation': {
			const formula = element.getAttribute('data-equation') || element.textContent?.trim();
			if (formula) {
				const span = document.createElement('span');
				span.textContent = `$$${formula}$$`;
				element.replaceWith(span);
			}
			break;
		}
		case 'task':
		case 'okr':
		case 'okr_objective':
		case 'okr_key_result':
		case 'okr_progress':
		case 'add_ons': {
			const p = document.createElement('p');
			p.textContent = element.textContent?.trim() || `[${type}]`;
			element.replaceWith(p);
			break;
		}
		case 'jira_issue':
		case 'jira': {
			const anchor = element.querySelector('a[href]');
			if (anchor) {
				element.replaceWith(createLinkParagraph(document, anchor.getAttribute('href') || '', anchor.textContent?.trim() || 'Jira'));
			} else {
				const p = document.createElement('p');
				p.textContent = element.textContent?.trim() || '[Jira]';
				element.replaceWith(p);
			}
			break;
		}
		case 'pending': {
			element.remove();
			break;
		}
		case 'undefined':
		case 'undefinedblock':
		case 'undefined_block': {
			const text = element.textContent?.trim();
			if (text) {
				const p = document.createElement('p');
				p.textContent = text;
				element.replaceWith(p);
			} else {
				element.remove();
			}
			break;
		}
		default:
			break;
	}
}

function enrichFeishuTextBlocks(document: Document) {
	convertFeishuInlineElements(document);

	const blockTree = buildFeishuBlockTree(document);
	const walk = (nodes: FeishuBlockNode[]) => {
		for (const node of nodes) {
			walk(node.children);
			renderBlockNode(document, node);
		}
	};

	walk(blockTree);
	mergeConsecutiveListBlocks(document, document.body, 'li', 'ul');

	for (const list of Array.from(document.querySelectorAll('ul'))) {
		const orderedChildren = Array.from(list.children).filter(child => child.getAttribute('data-feishu-list') === 'ordered');
		if (orderedChildren.length === list.children.length && orderedChildren.length > 0) {
			const ol = document.createElement('ol');
			for (const child of Array.from(list.children)) {
				child.removeAttribute('data-feishu-list');
				ol.appendChild(child);
			}
			list.replaceWith(ol);
		}
	}

	for (const li of Array.from(document.querySelectorAll('li'))) {
		li.removeAttribute('data-feishu-list');
	}
}

function getImageCandidateUrl(element: Element): string | undefined {
	return element.getAttribute('data-src')
		|| element.getAttribute('data-origin-src')
		|| element.getAttribute('data-actualsrc')
		|| element.getAttribute('data-preview-url')
		|| element.getAttribute('data-thumb')
		|| element.getAttribute('data-image')
		|| element.getAttribute('src')
		|| parseBackgroundImage(element.getAttribute('style'));
}

function getAssetCaption(element: Element): string | undefined {
	return extractCaption(element)
		|| element.getAttribute('data-caption')
		|| element.querySelector('[data-caption]')?.getAttribute('data-caption')
		|| undefined;
}

function resolveFeishuAssetUrl(element: Element, pageUrl: string): { candidateUrl?: string; originalUrl?: string; markdownUrl?: string; token?: string } {
	const token = element.getAttribute('data-token')
		|| element.getAttribute('data-file-token')
		|| element.getAttribute('data-image-token')
		|| element.getAttribute('data-board-token')
		|| element.getAttribute('data-doc-token')
		|| undefined;

	const candidateUrl = getImageCandidateUrl(element);
	if (candidateUrl) {
		return {
			candidateUrl,
			originalUrl: element.getAttribute('data-origin-src') || candidateUrl,
			markdownUrl: absoluteUrl(candidateUrl, pageUrl),
			token,
		};
	}

	if (token) {
		const base = new URL(pageUrl);
		const inferredUrl = `${base.origin}/space/api/box/stream/download/asynccode/?code=${token}`;
		return {
			candidateUrl: inferredUrl,
			originalUrl: inferredUrl,
			markdownUrl: inferredUrl,
			token,
		};
	}

	return { token };
}

export async function extractFeishuRichMedia(
	document: Document,
	url: string,
	authContext: AssetAuthContext,
): Promise<RichMediaExtractionResult> {
	enrichFeishuTextBlocks(document);

	const assets: RichMediaAsset[] = [];
	const seenUrls = new Set<string>();
	let assetCounter = 0;

	const registerAsset = (
		type: RichMediaAssetType,
		candidateUrl: string | undefined,
		element: Element,
		metadata: Partial<RichMediaAsset> = {},
	) => {
		if (!candidateUrl) {
			return undefined;
		}

		const resolvedUrl = absoluteUrl(candidateUrl, url);
		if (!resolvedUrl || seenUrls.has(resolvedUrl)) {
			return undefined;
		}
		seenUrls.add(resolvedUrl);
		assetCounter += 1;
		const asset = pushAsset(assets, url, authContext, assetCounter, type, resolvedUrl, {
			altText: metadata.altText || element.getAttribute('alt') || undefined,
			caption: metadata.caption || getAssetCaption(element),
			blockMetadata: {
				blockType: element.getAttribute('data-block-type') || type,
				tagName: element.tagName.toLowerCase(),
				className: element.getAttribute('class') || undefined,
				folded: isFoldedElement(element),
				...metadata.blockMetadata,
			},
			markdownUrl: metadata.markdownUrl || resolvedUrl,
			originalUrl: metadata.originalUrl || resolvedUrl,
			rawBinaryMetadata: metadata.rawBinaryMetadata,
		});
		return asset;
	};

	const imageElements = Array.from(document.querySelectorAll('img, [data-block-type="image"], .docx-image-block, [data-image-token], [data-preview-url], [data-thumb]'));
	for (const img of imageElements) {
		const imgBlockType = img.getAttribute('data-block-type');
		if (imgBlockType && imgBlockType !== 'image') {
			continue;
		}
		const resolved = resolveFeishuAssetUrl(img, url);
		if (!resolved.candidateUrl || resolved.candidateUrl.startsWith('data:')) {
			continue;
		}
		registerAsset('image', resolved.candidateUrl, img, {
			altText: img.getAttribute('alt') || undefined,
			caption: getAssetCaption(img),
			originalUrl: resolved.originalUrl,
			markdownUrl: resolved.markdownUrl,
			blockMetadata: resolved.token ? { token: resolved.token } : undefined,
		});
	}

	const backgroundCandidates = Array.from(document.querySelectorAll('[style*="background-image"], [data-preview-url], [data-thumb], [data-image], [data-image-token]'));
	for (const element of backgroundCandidates) {
		const bgBlockType = element.getAttribute('data-block-type');
		if (bgBlockType && bgBlockType !== 'image') {
			continue;
		}
		const resolved = resolveFeishuAssetUrl(element, url);
		if (!resolved.candidateUrl || !isLikelyFeishuMediaUrl(resolved.candidateUrl)) {
			continue;
		}
		const asset = registerAsset('image', resolved.candidateUrl, element, {
			caption: getAssetCaption(element),
			originalUrl: resolved.originalUrl,
			markdownUrl: resolved.markdownUrl,
			blockMetadata: resolved.token ? { token: resolved.token } : undefined,
		});
		if (asset && !element.querySelector('img')) {
			element.appendChild(createFigure(document, asset));
		}
	}

	const richBlockSelectors = [
		'.whiteboard_align',
		'.whiteboard-block_container',
		'[data-block-type="canvas"]',
		'[data-block-type="sketch"]',
		'[data-block-type="board"]',
		'.block-canvas',
		'.block-sketch',
		'[data-preview-url]',
		'[data-export-url]',
		'[data-board-token]',
		'[data-json*="preview"]',
	].join(', ');

	const richBlocks = Array.from(document.querySelectorAll(richBlockSelectors));
	for (const block of richBlocks) {
		const blockType = (block.getAttribute('data-block-type') || '').toLowerCase();
		const inferredType: RichMediaAssetType = blockType === 'sketch'
			? 'sketch'
			: blockType === 'canvas' || blockType === 'board' || block.classList.contains('whiteboard_align')
				? 'canvas'
				: /sketch/i.test(block.className)
					? 'sketch'
					: 'canvas';

		let candidateUrl =
			block.getAttribute('data-export-url') ||
			block.getAttribute('data-preview-url') ||
			block.getAttribute('data-thumb') ||
			parseBackgroundImage(block.getAttribute('style'));

		if (!candidateUrl) {
			const canvasEl = block.querySelector('canvas');
			if (canvasEl) {
				try {
					candidateUrl = canvasEl.toDataURL('image/png');
				} catch {
					// Ignore CORS issues with canvas.
				}
			}
		}

		let inlineJsonPreview: string | undefined;
		const rawJson = block.getAttribute('data-json') || block.getAttribute('data-props');
		if (rawJson) {
			try {
				const parsed = JSON.parse(rawJson);
				inlineJsonPreview = parsed.previewUrl || parsed.preview || parsed.exportUrl || parsed.url || parsed.image;
			} catch {
				// Ignore malformed inline state.
			}
		}

		const token = block.getAttribute('data-board-token') || block.getAttribute('data-token') || undefined;
		const asset = registerAsset(inferredType, candidateUrl || inlineJsonPreview || (token ? `${new URL(url).origin}/space/api/board/export?token=${token}` : undefined), block, {
			altText: inferredType === 'sketch' ? 'Feishu sketch preview' : 'Feishu canvas preview',
			caption: getAssetCaption(block),
			blockMetadata: {
				...(rawJson ? { rawJson } : {}),
				...(token ? { token } : {}),
				folded: isFoldedElement(block),
			},
		});

		if (asset) {
			const figure = createFigure(document, asset);
			block.replaceWith(figure);
		}
	}

	return {
		platform: 'feishu',
		assets,
		enrichedHtml: document.body?.innerHTML || '',
		authContext,
	};
}
