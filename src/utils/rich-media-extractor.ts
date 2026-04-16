import type { AssetAuthContext, RichMediaExtractionResult, RichMediaPlatform } from '../types/types';
import { resolveAssetAuth } from './asset-auth';
import { extractFeishuViaApi } from './platforms/feishu-api';

export interface RichMediaExtractionOptions {
	document: Document;
	url: string;
	authContext?: AssetAuthContext;
}

export function detectPlatformContext(url: string, doc?: Document): RichMediaPlatform {
	const hostname = (() => {
		try {
			return new URL(url).hostname;
		} catch {
			return doc?.location?.hostname || '';
		}
	})();

	if (/(^|\.)(feishu\.cn|larksuite\.com|larkoffice\.com)$/i.test(hostname)) {
		return 'feishu';
	}

	if (doc?.querySelector('[data-doc-appid], [data-block-type], .docs-editor-container, .lark-editor')) {
		return 'feishu';
	}

	return 'generic';
}

export async function extractRichMediaAssets(input: Document | RichMediaExtractionOptions, url?: string): Promise<RichMediaExtractionResult> {
	const options: RichMediaExtractionOptions = isDocument(input)
		? { document: input, url: url || input.URL }
		: input;

	const platform = detectPlatformContext(options.url, options.document);
	const authContext = options.authContext ?? await resolveAssetAuth(platform, options.document);

	if (platform === 'feishu') {
		try {
			const apiResult = await extractFeishuViaApi(options.url, authContext);
			if (apiResult) {
				return apiResult;
			}
		} catch {
			// API extraction failed
		}
		// Return generic result without DOM mutation to avoid corrupting the page
		return {
			platform: 'feishu',
			assets: [],
			enrichedHtml: options.document.body?.innerHTML || '',
			authContext,
		};
	}
	
	function isDocument(value: Document | RichMediaExtractionOptions): value is Document {
		return typeof (value as Document).querySelector === 'function';
	}

	return {
		platform: 'generic',
		assets: [],
		enrichedHtml: options.document.body?.innerHTML || '',
		authContext,
	};
}

export function enrichContentWithRichMedia(html: string, result?: RichMediaExtractionResult): string {
	if (!result?.assets?.length) {
		return html;
	}

	return result.enrichedHtml || html;
}
