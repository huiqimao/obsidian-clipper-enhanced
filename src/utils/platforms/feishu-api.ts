import browser from '../browser-polyfill';
import type { AssetAuthContext, FeishuApiBlock, RichMediaExtractionResult } from '../../types/types';
import { convertFeishuBlocksToMarkdown } from './feishu-block-to-markdown';

/**
 * Parse a Feishu URL and return { type, token }.
 * Supports /docx/{id} and /wiki/{id} paths.
 */
export function extractFeishuDocToken(url: string): { type: 'docx' | 'wiki'; token: string } | null {
	try {
		const parsed = new URL(url);
		if (!/(^|\.)(feishu\.cn|larksuite\.com|larkoffice\.com)$/i.test(parsed.hostname)) {
			return null;
		}
		const segments = parsed.pathname.split('/').filter(Boolean);
		for (const docType of ['docx', 'wiki'] as const) {
			const idx = segments.indexOf(docType);
			if (idx !== -1 && idx + 1 < segments.length) {
				const id = segments[idx + 1];
				if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
					return { type: docType, token: id };
				}
			}
		}
		return null;
	} catch {
		return null;
	}
}

/** Backward-compatible: extract only docx document IDs */
export function extractFeishuDocumentId(url: string): string | null {
	const parsed = extractFeishuDocToken(url);
	return parsed ? parsed.token : null;
}

export function getFeishuApiBase(url: string): string {
	try {
		const hostname = new URL(url).hostname;
		if (/(larksuite\.com|larkoffice\.com)$/i.test(hostname)) {
			return 'https://open.larksuite.com';
		}
	} catch { /* ignore */ }
	return 'https://open.feishu.cn';
}

export async function extractFeishuViaApi(
	url: string,
	authContext: AssetAuthContext,
): Promise<RichMediaExtractionResult | null> {
	const docInfo = extractFeishuDocToken(url);
	if (!docInfo) {
		return null;
	}

	const apiBase = getFeishuApiBase(url);
	console.log('[Feishu API] Attempting extraction:', docInfo.type, docInfo.token, 'apiBase:', apiBase);

	try {
		const response = await browser.runtime.sendMessage({
			action: 'feishuFetchDoc',
			docType: docInfo.type,
			docToken: docInfo.token,
			apiBase,
		}) as {
			success: boolean;
			markdown?: string;
			blocks?: FeishuApiBlock[];
			accessToken?: string;
			sheetData?: Record<string, unknown[][]>;
			comments?: unknown[];
			error?: string;
		};

		if (!response?.success) {
			console.warn('[Feishu API] API extraction failed:', response?.error || 'unknown error');
			return null;
		}

		let markdown = '';

		// Strategy 1: Direct markdown from /docs/v1/content API
		if (response.markdown) {
			console.log('[Feishu API] Got markdown directly from content API');
			markdown = response.markdown;
		}
		// Strategy 2: Convert blocks to markdown
		else if (response.blocks?.length) {
			console.log('[Feishu API] Got', response.blocks.length, 'blocks, converting to markdown');
			markdown = convertFeishuBlocksToMarkdown(
				response.blocks, apiBase, undefined,
				response.sheetData, response.comments,
			);
		}

		if (!markdown.trim()) {
			console.warn('[Feishu API] Extracted markdown is empty');
			return null;
		}

		return {
			platform: 'feishu',
			assets: [],
			enrichedHtml: '',
			authContext,
			markdownContent: markdown,
		};
	} catch (err) {
		console.error('[Feishu API] Error during extraction:', err);
		return null;
	}
}
