import { describe, expect, test } from 'vitest';
import { parseHTML } from 'linkedom';
import { detectPlatformContext, extractRichMediaAssets } from './rich-media-extractor';

describe('detectPlatformContext', () => {
	test('detects Feishu by host', () => {
		expect(detectPlatformContext('https://foo.feishu.cn/docx/123')).toBe('feishu');
	});

	test('detects Feishu by DOM signature', () => {
		const { document } = parseHTML('<html><body><div class="lark-editor"></div></body></html>');
		expect(detectPlatformContext('https://example.com/page', document as unknown as Document)).toBe('feishu');
	});
});

describe('extractRichMediaAssets', () => {
	test('returns raw HTML for Feishu pages when API is unavailable (no credentials)', async () => {
		const { document } = parseHTML(`
			<html><body>
				<div class="lark-editor">
					<p>Some content</p>
				</div>
			</body></html>
		`);

		const result = await extractRichMediaAssets({
			document: document as unknown as Document,
			url: 'https://foo.feishu.cn/docx/123',
		});

		// Without app credentials, API extraction is skipped
		// Fallback returns raw innerHTML without DOM mutation
		expect(result.platform).toBe('feishu');
		expect(result.assets).toEqual([]);
		expect(result.enrichedHtml).toContain('Some content');
		expect(result.markdownContent).toBeUndefined();
	});

	test('preserves original DOM structure for Feishu pages (no mutation)', async () => {
		const { document } = parseHTML(`
			<html><body>
				<div class="lark-editor">
					<div data-block-type="text">Original text</div>
				</div>
			</body></html>
		`);

		await extractRichMediaAssets({
			document: document as unknown as Document,
			url: 'https://foo.feishu.cn/docx/123',
		});

		// DOM should NOT be mutated — the original data-block-type should still be there
		const block = document.querySelector('[data-block-type="text"]');
		expect(block).not.toBeNull();
		expect(block?.textContent).toContain('Original text');
	});

	test('returns empty generic result for unsupported pages', async () => {
		const { document } = parseHTML('<html><body><article><p>Hello</p></article></body></html>');
		const result = await extractRichMediaAssets({
			document: document as unknown as Document,
			url: 'https://example.com/page',
		});

		expect(result.platform).toBe('generic');
		expect(result.assets).toEqual([]);
		expect(result.enrichedHtml).toContain('<article>');
	});
});
