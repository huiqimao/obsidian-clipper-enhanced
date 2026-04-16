export interface Template {
	id: string;
	name: string;
	behavior: 'create' | 'append-specific' | 'append-daily' | 'prepend-specific' | 'prepend-daily' | 'overwrite';
	noteNameFormat: string;
	path: string;
	noteContentFormat: string;
	properties: Property[];
	triggers?: string[];
	vault?: string;
	context?: string;
}

export interface Property {
	id?: string;
	name: string;
	value: string;
	type?: string;
}

export interface ExtractedContent {
	[key: string]: string;
}

export type FilterFunction = (value: string, param?: string) => string | any[];

export interface PromptVariable {
	key: string;
	prompt: string;
	filters?: string;
}

export interface PropertyType {
	name: string;
	type: string;
	defaultValue?: string;
}

export interface Provider {
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	apiKeyRequired?: boolean;
	presetId?: string;
}

export interface Rating {
	rating: number;
	date: string;
}

export type SaveBehavior = 'addToObsidian' | 'saveFile' | 'copyToClipboard';

export interface ReaderSettings {
	fontSize: number;
	lineHeight: number;
	maxWidth: number;
	lightTheme: string;
	darkTheme: string;
	appearance: 'auto' | 'light' | 'dark';
	fonts: string[];
	defaultFont: string;
	blendImages: boolean;
	colorLinks: boolean;
	pinPlayer: boolean;
	autoScroll: boolean;
	highlightActiveLine: boolean;
	customCss: string;
}

export interface FeishuSettings {
	appId: string;
	appSecret: string;
}

export interface Settings {
	vaults: string[];
	showMoreActionsButton: boolean;
	betaFeatures: boolean;
	legacyMode: boolean;
	silentOpen: boolean;
	openBehavior: 'popup' | 'embedded' | 'reader';
	highlighterEnabled: boolean;
	alwaysShowHighlights: boolean;
	highlightBehavior: string;
	interpreterModel?: string;
	models: ModelConfig[];
	providers: Provider[];
	interpreterEnabled: boolean;
	interpreterAutoRun: boolean;
	defaultPromptContext: string;
	propertyTypes: PropertyType[];
	readerSettings: ReaderSettings;
	feishuSettings: FeishuSettings;
	stats: {
		addToObsidian: number;
		saveFile: number;
		copyToClipboard: number;
		share: number;
	};
	history: HistoryEntry[];
	ratings: Rating[];
	saveBehavior: 'addToObsidian' | 'saveFile' | 'copyToClipboard';
}

export interface ModelConfig {
	id: string;
	providerId: string;
	providerModelId: string;
	name: string;
	enabled: boolean;
}

export interface HistoryEntry {
	datetime: string;
	url: string;
	action: 'addToObsidian' | 'saveFile' | 'copyToClipboard' | 'share';
	title?: string;
	vault?: string;
	path?: string;
}

export interface ConversationMessage {
	author: string;
	content: string;
	timestamp?: string;
	metadata?: Record<string, any>;
}

export interface ConversationMetadata {
	title?: string;
	description?: string;
	site: string;
	url: string;
	messageCount: number;
	startTime?: string;
	endTime?: string;
}

export interface Footnote {
	url: string;
	text: string;
}

export type RichMediaPlatform = 'feishu' | 'generic';
export type RichMediaAssetType = 'image' | 'canvas' | 'sketch' | 'unknown';
export type AssetAuthStrategy = 'public' | 'credentials' | 'token' | 'relay';

export interface AssetAuthContext {
	platform: RichMediaPlatform;
	strategy: AssetAuthStrategy;
	needsRelay: boolean;
	credentials?: RequestCredentials;
	headers?: Record<string, string>;
	cookies?: Record<string, string>;
	storage?: Record<string, string>;
	token?: string;
	tokenSource?: 'cookie' | 'localStorage' | 'sessionStorage' | 'window';
	resolvedAt?: string;
}

export interface RichMediaAsset {
	id: string;
	platform: RichMediaPlatform;
	type: RichMediaAssetType;
	originalUrl?: string;
	fetchUrl: string;
	resolvedUrl?: string;
	markdownUrl?: string;
	altText?: string;
	caption?: string;
	authRequired: boolean;
	authContext?: AssetAuthContext;
	blockMetadata?: Record<string, any>;
	rawBinaryMetadata?: Record<string, any>;
}

export interface RichMediaExtractionResult {
	platform: RichMediaPlatform;
	assets: RichMediaAsset[];
	enrichedHtml: string;
	authContext?: AssetAuthContext;
	markdownContent?: string;
}

// Feishu Open API block types
export const FEISHU_BLOCK_TYPE = {
	PAGE: 1, TEXT: 2,
	HEADING1: 3, HEADING2: 4, HEADING3: 5, HEADING4: 6,
	HEADING5: 7, HEADING6: 8, HEADING7: 9, HEADING8: 10, HEADING9: 11,
	BULLET: 12, ORDERED: 13, CODE: 14, QUOTE: 15,
	TODO: 17,
	BITABLE: 18, CALLOUT: 19, CHAT_CARD: 20, DIAGRAM: 21,
	DIVIDER: 22, FILE: 23, GRID: 24, GRID_COLUMN: 25,
	IFRAME: 26, IMAGE: 27, ISV: 28, MINDNOTE: 29,
	SHEET: 30, TABLE: 31, TABLE_CELL: 32, VIEW: 33,
	QUOTE_CONTAINER: 34, TASK: 35,
	OKR: 36, OKR_OBJECTIVE: 37, OKR_KEY_RESULT: 38, OKR_PROGRESS: 39,
	ADD_ONS: 40, JIRA_ISSUE: 41, WIKI_CATALOG: 42, BOARD: 43,
	AGENDA: 44, AGENDA_ITEM: 45, AGENDA_ITEM_TITLE: 46, AGENDA_ITEM_CONTENT: 47,
	LINK_PREVIEW: 48, SOURCE_SYNCED: 49, REFERENCE_SYNCED: 50,
	SUB_PAGE_LIST: 51, AI_TEMPLATE: 52,
	UNDEFINED: 999,
} as const;

export interface FeishuTextElementStyle {
	bold?: boolean;
	italic?: boolean;
	strikethrough?: boolean;
	underline?: boolean;
	inline_code?: boolean;
	text_color?: number;
	background_color?: number;
	link?: { url: string };
	comment_ids?: string[];
}

export interface FeishuTextRun {
	content: string;
	text_element_style?: FeishuTextElementStyle;
}

export interface FeishuMentionUser {
	user_id: string;
	text_element_style?: FeishuTextElementStyle;
}

export interface FeishuMentionDoc {
	token: string;
	obj_type: number;
	url: string;
	text_element_style?: FeishuTextElementStyle;
}

export interface FeishuEquation {
	content: string;
	text_element_style?: FeishuTextElementStyle;
}

export interface FeishuTextElement {
	text_run?: FeishuTextRun;
	mention_user?: FeishuMentionUser;
	mention_doc?: FeishuMentionDoc;
	reminder?: { expire_time: number; text_element_style?: FeishuTextElementStyle };
	file?: { file_token?: string; text_element_style?: FeishuTextElementStyle };
	equation?: FeishuEquation;
	undefined_element?: Record<string, never>;
}

export interface FeishuTextStyle {
	align?: number;
	done?: boolean;
	folded?: boolean;
	language?: number;
	wrap?: boolean;
	sequence?: string;
}

export interface FeishuText {
	style?: FeishuTextStyle;
	elements: FeishuTextElement[];
}

export interface FeishuTableProperty {
	row_size: number;
	column_size: number;
	column_width?: number[];
	header_row?: boolean;
	header_column?: boolean;
	merge_info?: Array<{ row_span: number; col_span: number }>;
}

export interface FeishuApiBlock {
	block_id: string;
	block_type: number;
	parent_id: string;
	children?: string[];
	page?: FeishuText;
	text?: FeishuText;
	heading1?: FeishuText;
	heading2?: FeishuText;
	heading3?: FeishuText;
	heading4?: FeishuText;
	heading5?: FeishuText;
	heading6?: FeishuText;
	heading7?: FeishuText;
	heading8?: FeishuText;
	heading9?: FeishuText;
	bullet?: FeishuText;
	ordered?: FeishuText;
	code?: FeishuText;
	quote?: FeishuText;
	todo?: FeishuText;
	callout?: { background_color?: number; border_color?: number; text_color?: number; emoji_id?: string };
	divider?: Record<string, never>;
	image?: { token: string; width?: number; height?: number; caption?: { content: string } };
	file?: { token?: string; name?: string };
	table?: { cells: string[]; property: FeishuTableProperty };
	table_cell?: Record<string, never>;
	grid?: { column_size: number };
	grid_column?: { width_ratio?: number };
	iframe?: { component: { type: number; url: string } };
	bitable?: { token: string; view_type?: number };
	sheet?: { token?: string };
	board?: { token?: string };
	quote_container?: Record<string, never>;
	task?: { task_id: string };
	jira_issue?: { id?: string; key?: string };
	okr?: { okr_id?: string };
	okr_objective?: { objective_id?: string; content?: FeishuText };
	okr_key_result?: { kr_id?: string; content?: FeishuText };
	mindnote?: { token?: string };
	source_synced?: { elements?: FeishuTextElement[] };
	reference_synced?: { source_block_id?: string; source_document_id?: string };
	link_preview?: { url?: string };
	view?: { view_type?: number };
	[key: string]: unknown;
}

export interface FeishuBlocksApiResponse {
	code: number;
	msg: string;
	data: {
		items: FeishuApiBlock[];
		page_token?: string;
		has_more: boolean;
	};
}
