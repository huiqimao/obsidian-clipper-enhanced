import browser from 'webextension-polyfill';
import { detectBrowser } from './utils/browser-detection';
import { updateCurrentActiveTab, isValidUrl, isBlankPage } from './utils/active-tab-manager';
import { TextHighlightData } from './utils/highlighter';
import { debounce } from './utils/debounce';
import { Settings } from './types/types';

const YOUTUBE_EMBED_RULE_ID = 9001;

// Chrome: declarativeNetRequest to rewrite Referer on YouTube embeds.
// Safari/Firefox use the native video element instead (see reader.ts).
async function enableYouTubeEmbedRule(tabId: number): Promise<void> {
	await chrome.declarativeNetRequest.updateSessionRules({
		removeRuleIds: [YOUTUBE_EMBED_RULE_ID],
		addRules: [{
			id: YOUTUBE_EMBED_RULE_ID,
			priority: 1,
			action: {
				type: 'modifyHeaders' as any,
				requestHeaders: [{
					header: 'Referer',
					operation: 'set' as any,
					value: 'https://obsidian.md/'
				}]
			},
			condition: {
				urlFilter: '||youtube.com/embed/',
				resourceTypes: ['sub_frame' as any],
				tabIds: [tabId]
			}
		}]
	});
}

async function disableYouTubeEmbedRule(): Promise<void> {
	await chrome.declarativeNetRequest.updateSessionRules({
		removeRuleIds: [YOUTUBE_EMBED_RULE_ID]
	});
}

let sidePanelOpenWindows: Set<number> = new Set();
let highlighterModeState: { [tabId: number]: boolean } = {};
let readerModeState: { [tabId: number]: boolean } = {};
let hasHighlights = false;
let isContextMenuCreating = false;
let popupPorts: { [tabId: number]: browser.Runtime.Port } = {};

async function injectContentScript(tabId: number): Promise<void> {
	if (browser.scripting) {
		console.log('[Obsidian Clipper] Using scripting API');
		await browser.scripting.executeScript({
			target: { tabId },
			files: ['content.js']
		});
	} else {
		console.log('[Obsidian Clipper] Using tabs.executeScript fallback');
		await browser.tabs.executeScript(tabId, { file: 'content.js' });
	}
	console.log('[Obsidian Clipper] Injection completed, waiting for init...');

	// Poll until the content script responds, rather than a fixed delay.
	// Try immediately after injection, then back off with 50ms sleeps.
	let ready = false;
	for (let i = 0; i < 8; i++) {
		try {
			await browser.tabs.sendMessage(tabId, { action: "ping" });
			ready = true;
			break;
		} catch {
			// Not ready yet
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	if (!ready) {
		throw new Error('Content script did not respond after injection');
	}
	console.log('[Obsidian Clipper] Post-injection ping succeeded');
}

async function ensureContentScriptLoadedInBackground(tabId: number): Promise<void> {
	try {
		// First, get the tab information
		const tab = await browser.tabs.get(tabId);

		// Check if the URL is valid before proceeding
		if (!tab.url || !isValidUrl(tab.url)) {
			throw new Error('Invalid URL for content script injection');
		}

		// Attempt to send a message to the content script
		await browser.tabs.sendMessage(tabId, { action: "ping" });
		console.log('[Obsidian Clipper] Content script ping succeeded');
	} catch (error) {
		// If the error is about invalid URL, re-throw it
		if (error instanceof Error && error.message.includes('invalid URL')) {
			throw error;
		}

		// If the message fails, the content script is not loaded, so inject it
		console.log('[Obsidian Clipper] Ping failed, injecting content script...', error);
		await injectContentScript(tabId);
	}
}

function getHighlighterModeForTab(tabId: number): boolean {
	return highlighterModeState[tabId] ?? false;
}

function getReaderModeForTab(tabId: number): boolean {
	return readerModeState[tabId] ?? false;
}

async function initialize() {
	try {
		// Set up tab listeners
		await setupTabListeners();

		browser.tabs.onRemoved.addListener((tabId) => {
			delete highlighterModeState[tabId];
			delete readerModeState[tabId];
		});
		
		// Initialize context menu
		await debouncedUpdateContextMenu(-1);

		// Set up action popup based on openBehavior setting
		await updateActionPopup();

		console.log('Background script initialized successfully');
	} catch (error) {
		console.error('Error initializing background script:', error);
	}
}

// Check if a popup is open for a given tab
function isPopupOpen(tabId: number): boolean {
	return popupPorts.hasOwnProperty(tabId);
}

browser.runtime.onConnect.addListener((port) => {
	if (port.name === 'popup') {
		const tabId = port.sender?.tab?.id;
		if (tabId) {
			popupPorts[tabId] = port;
			port.onDisconnect.addListener(() => {
				delete popupPorts[tabId];
			});
		}
	}
});

async function sendMessageToPopup(tabId: number, message: any): Promise<void> {
	if (isPopupOpen(tabId)) {
		try {
			await popupPorts[tabId].postMessage(message);
		} catch (error) {
			console.warn(`Error sending message to popup for tab ${tabId}:`, error);
		}
	}
}



browser.runtime.onMessage.addListener((request: unknown, sender: browser.Runtime.MessageSender, sendResponse: (response?: any) => void): true | undefined => {
	if (typeof request === 'object' && request !== null) {
		const typedRequest = request as { action: string; isActive?: boolean; hasHighlights?: boolean; tabId?: number; text?: string; section?: string };
		
		if (typedRequest.action === 'copy-to-clipboard' && typedRequest.text) {
			// Use content script to copy to clipboard
			browser.tabs.query({active: true, currentWindow: true}).then(async (tabs) => {
				const currentTab = tabs[0];
				if (currentTab && currentTab.id) {
					try {
						const response = await browser.tabs.sendMessage(currentTab.id, {
							action: 'copy-text-to-clipboard',
							text: typedRequest.text
						});
						if ((response as any) && (response as any).success) {
							sendResponse({success: true});
						} else {
							sendResponse({success: false, error: 'Failed to copy from content script'});
						}
					} catch (err) {
						sendResponse({ success: false, error: (err as Error).message });
					}
				} else {
					sendResponse({success: false, error: 'No active tab found'});
				}
			});
			return true;
		}

		if (typedRequest.action === "extractContent" && sender.tab && sender.tab.id) {
			browser.tabs.sendMessage(sender.tab.id, request).then(sendResponse);
			return true;
		}

		if (typedRequest.action === "ensureContentScriptLoaded") {
			const tabId = typedRequest.tabId || sender.tab?.id;
			if (tabId) {
				ensureContentScriptLoadedInBackground(tabId)
					.then(() => sendResponse({ success: true }))
					.catch((error) => sendResponse({ 
						success: false, 
						error: error instanceof Error ? error.message : String(error) 
					}));
				return true;
			} else {
				sendResponse({ success: false, error: 'No tab ID provided' });
				return true;
			}
		}

		if (typedRequest.action === "enableYouTubeEmbedRule") {
			const tabId = sender.tab?.id;
			if (tabId) {
				enableYouTubeEmbedRule(tabId).then(() => {
					sendResponse({ success: true });
				}).catch(() => {
					sendResponse({ success: true });
				});
			} else {
				sendResponse({ success: true });
			}
			return true;
		}

		if (typedRequest.action === "disableYouTubeEmbedRule") {
			disableYouTubeEmbedRule().then(() => {
				sendResponse({ success: true });
			}).catch(() => {
				sendResponse({ success: true });
			});
			return true;
		}

		if (typedRequest.action === "feishuAuthorize") {
			(async () => {
				try {
					const feishuSettings = await browser.storage.sync.get('feishu_settings') as { feishu_settings?: { appId?: string; appSecret?: string } };
					const appId = feishuSettings.feishu_settings?.appId;
					const appSecret = feishuSettings.feishu_settings?.appSecret;

					if (!appId || !appSecret) {
						sendResponse({ success: false, error: 'App ID and App Secret are required' });
						return;
					}

					// Use Chrome identity API's built-in redirect URL
					const redirectUri = chrome.identity.getRedirectURL();
					const state = Math.random().toString(36).slice(2);
					const authBase = 'https://accounts.larksuite.com';

					const authUrl = `${authBase}/open-apis/authen/v1/authorize?` +
						`client_id=${encodeURIComponent(appId)}` +
						`&response_type=code` +
						`&redirect_uri=${encodeURIComponent(redirectUri)}` +
						`&scope=${encodeURIComponent('docx:document:readonly docs:document.comment:read sheets:spreadsheet:read wiki:wiki:readonly offline_access')}` +
						`&state=${state}`;

					console.log('[Feishu BG] Starting OAuth flow, redirect URI:', redirectUri);

					// Launch the auth flow in a popup window
					const responseUrl = await new Promise<string>((resolve, reject) => {
						chrome.identity.launchWebAuthFlow(
							{ url: authUrl, interactive: true },
							(callbackUrl) => {
								if (chrome.runtime.lastError) {
									reject(new Error(chrome.runtime.lastError.message));
								} else if (callbackUrl) {
									resolve(callbackUrl);
								} else {
									reject(new Error('No callback URL returned'));
								}
							}
						);
					});

					// Extract the authorization code from the callback URL
					const callbackParams = new URL(responseUrl).searchParams;
					const code = callbackParams.get('code');
					const error = callbackParams.get('error');

					if (error || !code) {
						sendResponse({ success: false, error: error || 'No authorization code received' });
						return;
					}

					// Exchange code for user_access_token
					const apiBase = 'https://open.larksuite.com';
					console.log('[Feishu BG] Exchanging auth code for user_access_token...');
					const resp = await fetch(`${apiBase}/open-apis/authen/v2/oauth/token`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json; charset=utf-8' },
						body: JSON.stringify({
							grant_type: 'authorization_code',
							client_id: appId,
							client_secret: appSecret,
							code,
							redirect_uri: redirectUri,
						}),
					});

					const json = await resp.json();
					if (json.code !== 0 || !json.access_token) {
						console.warn('[Feishu BG] Token exchange failed:', json);
						sendResponse({ success: false, error: json.error_description || json.msg || `code ${json.code}` });
						return;
					}

					// Store tokens
					await browser.storage.local.set({
						feishu_user_token: {
							access_token: json.access_token,
							refresh_token: json.refresh_token,
							expires_at: Date.now() + (json.expires_in * 1000),
							refresh_expires_at: Date.now() + ((json.refresh_token_expires_in || 604800) * 1000),
						},
					});

					console.log('[Feishu BG] User access token stored successfully');
					sendResponse({ success: true });
				} catch (err) {
					console.error('[Feishu BG] OAuth error:', err);
					sendResponse({ success: false, error: (err as Error).message });
				}
			})();
			return true;
		}

		async function fetchComments(apiBase: string, docId: string, headers: Record<string, string>): Promise<unknown[]> {
			const comments: unknown[] = [];
			try {
				let commentPageToken: string | undefined;
				for (let p = 0; p < 10; p++) {
					const params = new URLSearchParams({ file_type: 'docx', page_size: '100' });
					if (commentPageToken) params.set('page_token', commentPageToken);
					const resp = await fetch(
						`${apiBase}/open-apis/drive/v1/files/${docId}/comments?${params}`,
						{ headers },
					);
					if (!resp.ok) break;
					const json = await resp.json();
					if (json.code !== 0) break;
					comments.push(...(json.data?.items || []));
					if (!json.data?.has_more) break;
					commentPageToken = json.data.page_token;
				}
				if (comments.length > 0) {
					console.log(`[Feishu BG] Fetched ${comments.length} comments`);
				}
			} catch (e) {
				console.warn('[Feishu BG] Failed to fetch comments:', e);
			}
			return comments;
		}

		if (typedRequest.action === "feishuFetchDoc" || typedRequest.action === "feishuFetchBlocks") {
			const req = typedRequest as unknown as {
				docType?: 'docx' | 'wiki';
				docToken?: string;
				documentId?: string;
				apiBase: string;
			};
			const apiBase = req.apiBase;
			const docType = req.docType || 'docx';
			const docToken = req.docToken || req.documentId || '';

			(async () => {
				try {
					// Get stored user_access_token
					const stored = await browser.storage.local.get('feishu_user_token') as {
						feishu_user_token?: {
							access_token: string;
							refresh_token: string;
							expires_at: number;
							refresh_expires_at: number;
						};
					};

					let accessToken = stored.feishu_user_token?.access_token;

					if (!accessToken) {
						sendResponse({ success: false, error: 'Not authorized. Please authorize in Feishu settings.' });
						return;
					}

					// Refresh token if expired
					if (stored.feishu_user_token && Date.now() > stored.feishu_user_token.expires_at) {
						console.log('[Feishu BG] Token expired, refreshing...');
						const feishuSettings = await browser.storage.sync.get('feishu_settings') as { feishu_settings?: { appId?: string; appSecret?: string } };
						const appId = feishuSettings.feishu_settings?.appId;
						const appSecret = feishuSettings.feishu_settings?.appSecret;

						if (appId && appSecret && stored.feishu_user_token.refresh_token) {
							const refreshResp = await fetch(`${apiBase}/open-apis/authen/v2/oauth/token`, {
								method: 'POST',
								headers: { 'Content-Type': 'application/json; charset=utf-8' },
								body: JSON.stringify({
									grant_type: 'refresh_token',
									client_id: appId,
									client_secret: appSecret,
									refresh_token: stored.feishu_user_token.refresh_token,
								}),
							});

							const refreshJson = await refreshResp.json();
							if (refreshJson.access_token) {
								accessToken = refreshJson.access_token;
								await browser.storage.local.set({
									feishu_user_token: {
										access_token: refreshJson.access_token,
										refresh_token: refreshJson.refresh_token || stored.feishu_user_token.refresh_token,
										expires_at: Date.now() + (refreshJson.expires_in * 1000),
										refresh_expires_at: Date.now() + ((refreshJson.refresh_token_expires_in || 604800) * 1000),
									},
								});
								console.log('[Feishu BG] Token refreshed successfully');
							} else {
								sendResponse({ success: false, error: 'Token expired and refresh failed. Please re-authorize.' });
								return;
							}
						} else {
							sendResponse({ success: false, error: 'Token expired. Please re-authorize.' });
							return;
						}
					}

					const authHeaders = { Authorization: `Bearer ${accessToken}` };

					// For wiki pages, resolve the wiki_token to a docx obj_token first
					let documentId = docToken;
					if (docType === 'wiki') {
						console.log('[Feishu BG] Resolving wiki token:', docToken);
						const nodeResp = await fetch(
							`${apiBase}/open-apis/wiki/v2/spaces/get_node?token=${docToken}`,
							{ headers: authHeaders },
						);
						if (nodeResp.ok) {
							const nodeJson = await nodeResp.json();
							if (nodeJson.code === 0 && nodeJson.data?.node?.obj_token) {
								documentId = nodeJson.data.node.obj_token;
								console.log('[Feishu BG] Wiki resolved to docx:', documentId);
							} else {
								console.warn('[Feishu BG] Wiki node resolution failed:', nodeJson.msg);
							}
						}
					}

					// Strategy 1: Try /docs/v1/content API for direct markdown
					console.log('[Feishu BG] Trying /docs/v1/content API...');
					try {
						const contentParams = new URLSearchParams({
							doc_token: documentId,
							doc_type: 'docx',
							content_type: 'markdown',
						});
						const contentResp = await fetch(
							`${apiBase}/open-apis/docs/v1/content?${contentParams}`,
							{ headers: authHeaders },
						);
						if (contentResp.ok) {
							const contentJson = await contentResp.json();
							if (contentJson.code === 0 && contentJson.data?.content) {
								console.log('[Feishu BG] Got markdown from content API');

								// Also fetch comments
								const comments = await fetchComments(apiBase, documentId, authHeaders);

								sendResponse({
									success: true,
									markdown: contentJson.data.content,
									accessToken,
									comments,
								});
								return;
							}
							console.warn('[Feishu BG] Content API returned:', contentJson.code, contentJson.msg);
						}
					} catch (e) {
						console.warn('[Feishu BG] Content API failed:', e);
					}

					// Strategy 2: Fall back to blocks API
					console.log('[Feishu BG] Falling back to blocks API...');
					const allItems: unknown[] = [];
					let pageToken: string | undefined;

					for (let page = 0; page < 20; page++) {
						const params = new URLSearchParams({ page_size: '500' });
						if (pageToken) params.set('page_token', pageToken);

						const resp = await fetch(
							`${apiBase}/open-apis/docx/v1/documents/${documentId}/blocks?${params}`,
							{ headers: authHeaders },
						);

						if (!resp.ok) {
							const text = await resp.text().catch(() => '');
							console.warn(`[Feishu BG] Blocks HTTP ${resp.status}`, text.slice(0, 300));
							sendResponse({ success: false, error: `HTTP ${resp.status}` });
							return;
						}

						const json = await resp.json();
						if (json.code !== 0) {
							sendResponse({ success: false, error: json.msg || `API code ${json.code}` });
							return;
						}

						allItems.push(...(json.data?.items || []));
						if (!json.data?.has_more) break;
						pageToken = json.data.page_token;
					}

					console.log(`[Feishu BG] Got ${allItems.length} blocks`);

					// Fetch embedded sheet content
					const sheetData: Record<string, string[][]> = {};
					for (const item of allItems) {
						const b = item as any;
						if (b.block_type === 30 && b.sheet?.token) {
							try {
								const sheetToken = b.sheet.token as string;
								const [spreadsheetToken, sheetId] = sheetToken.includes('_')
									? [sheetToken.split('_')[0], sheetToken.split('_').slice(1).join('_')]
									: [sheetToken, ''];
								if (spreadsheetToken && sheetId) {
									const sheetResp = await fetch(
										`${apiBase}/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}`,
										{ headers: authHeaders },
									);
									if (sheetResp.ok) {
										const sheetJson = await sheetResp.json();
										if (sheetJson.code === 0 && sheetJson.data?.valueRange?.values) {
											sheetData[sheetToken] = sheetJson.data.valueRange.values;
										}
									}
								}
							} catch (e) {
								console.warn('[Feishu BG] Failed to fetch sheet:', e);
							}
						}
					}

					const comments = await fetchComments(apiBase, documentId, authHeaders);

					sendResponse({ success: true, blocks: allItems, accessToken, sheetData, comments });
				} catch (err) {
					console.error('[Feishu BG] Error:', err);
					sendResponse({ success: false, error: (err as Error).message });
				}
			})();
			return true;
		}

		if (typedRequest.action === "feishuDownloadMedia") {
			const { url: mediaUrl, accessToken: mediaToken } = typedRequest as unknown as {
				url: string;
				accessToken: string;
			};

			(async () => {
				try {
					const resp = await fetch(mediaUrl, {
						headers: { Authorization: `Bearer ${mediaToken}` },
					});

					if (!resp.ok) {
						sendResponse({ success: false, error: `HTTP ${resp.status}` });
						return;
					}

					const contentType = resp.headers.get('content-type') || 'image/png';
					const buffer = await resp.arrayBuffer();
					const bytes = new Uint8Array(buffer);
					let binary = '';
					for (let i = 0; i < bytes.length; i++) {
						binary += String.fromCharCode(bytes[i]);
					}
					const base64 = btoa(binary);
					const dataUri = `data:${contentType};base64,${base64}`;

					sendResponse({ success: true, dataUri });
				} catch (err) {
					sendResponse({ success: false, error: (err as Error).message });
				}
			})();
			return true;
		}

		if (typedRequest.action === "sidePanelOpened") {
			if (sender.tab && sender.tab.windowId) {
				sidePanelOpenWindows.add(sender.tab.windowId);
				updateCurrentActiveTab(sender.tab.windowId);
			}
		}

		if (typedRequest.action === "sidePanelClosed") {
			if (sender.tab && sender.tab.windowId) {
				sidePanelOpenWindows.delete(sender.tab.windowId);
			}
		}

		if (typedRequest.action === "highlighterModeChanged" && sender.tab && typedRequest.isActive !== undefined) {
			const tabId = sender.tab.id;
			if (tabId) {
				highlighterModeState[tabId] = typedRequest.isActive;
				sendMessageToPopup(tabId, { action: "updatePopupHighlighterUI", isActive: typedRequest.isActive });
				debouncedUpdateContextMenu(tabId);
			}
		}

		if (typedRequest.action === "readerModeChanged" && sender.tab && typedRequest.isActive !== undefined) {
			const tabId = sender.tab.id;
			if (tabId) {
				readerModeState[tabId] = typedRequest.isActive;
				debouncedUpdateContextMenu(tabId);
			}
		}

		if (typedRequest.action === "highlightsCleared" && sender.tab) {
			hasHighlights = false;
			debouncedUpdateContextMenu(sender.tab.id!);
		}

		if (typedRequest.action === "updateHasHighlights" && sender.tab && typedRequest.hasHighlights !== undefined) {
			hasHighlights = typedRequest.hasHighlights;
			debouncedUpdateContextMenu(sender.tab.id!);
		}

		if (typedRequest.action === "getHighlighterMode") {
			const tabId = typedRequest.tabId || sender.tab?.id;
			if (tabId) {
				sendResponse({ isActive: getHighlighterModeForTab(tabId) });
			} else {
				sendResponse({ isActive: false });
			}
			return true;
		}

		if (typedRequest.action === "getReaderMode") {
			const tabId = typedRequest.tabId || sender.tab?.id;
			if (tabId) {
				sendResponse({ isActive: getReaderModeForTab(tabId) });
			} else {
				sendResponse({ isActive: false });
			}
			return true;
		}

		if (typedRequest.action === "toggleHighlighterMode" && typedRequest.tabId) {
			toggleHighlighterMode(typedRequest.tabId)
				.then(newMode => sendResponse({ success: true, isActive: newMode }))
				.catch(error => sendResponse({ success: false, error: error.message }));
			return true;
		}

		if (typedRequest.action === "openPopup") {
			openPopup()
				.then(() => {
					sendResponse({ success: true });
				})
				.catch((error: unknown) => {
					console.error('Error opening popup in background script:', error);
					sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
				});
			return true;
		}

		if (typedRequest.action === "toggleReaderMode" && typedRequest.tabId) {
			injectReaderScript(typedRequest.tabId).then(() => {
				browser.tabs.sendMessage(typedRequest.tabId!, { action: "toggleReaderMode" })
					.then((response: any) => {
						if (response?.success) {
							readerModeState[typedRequest.tabId!] = response.isActive ?? false;
							debouncedUpdateContextMenu(typedRequest.tabId!);
						}
						sendResponse(response);
					})
					.catch(() => {
						// Page may have reloaded before responding (reader restore)
						sendResponse({ success: true, isActive: false });
					});
			});
			return true;
		}

		if (typedRequest.action === "getActiveTabAndToggleIframe") {
			browser.tabs.query({active: true, currentWindow: true}).then(async (tabs) => {
				const currentTab = tabs[0];
				if (currentTab && currentTab.id) {
					try {
						// Check if the URL is valid before trying to inject content script
						if (!currentTab.url || !isValidUrl(currentTab.url) || isBlankPage(currentTab.url)) {
							sendResponse({success: false, error: 'Cannot open iframe on this page'});
							return;
						}

						// Ensure content script is loaded first
						await ensureContentScriptLoadedInBackground(currentTab.id);
						await browser.tabs.sendMessage(currentTab.id, { action: "toggle-iframe" });
						sendResponse({success: true});
					} catch (error) {
						console.error('Error sending toggle-iframe message:', error);
						sendResponse({success: false, error: error instanceof Error ? error.message : String(error)});
					}
				} else {
					sendResponse({success: false, error: 'No active tab found'});
				}
			});
			return true;
		}

		if (typedRequest.action === "toggleIframe") {
			const tab = sender.tab;
			if (tab?.id && tab.url && isValidUrl(tab.url) && !isBlankPage(tab.url)) {
				ensureContentScriptLoadedInBackground(tab.id)
					.then(() => browser.tabs.sendMessage(tab.id!, { action: "toggle-iframe" }))
					.then(() => sendResponse({ success: true }))
					.catch((error) => {
						console.error('Error toggling iframe:', error);
						sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
					});
			} else {
				sendResponse({ success: false, error: 'Cannot open iframe on this page' });
			}
			return true;
		}

		if (typedRequest.action === "getActiveTab") {
			browser.tabs.query({active: true, currentWindow: true}).then(async (tabs) => {
				let currentTab = tabs[0];
				// Fallback for when currentWindow has no tabs (e.g., debugging popup in DevTools)
				if (!currentTab || !currentTab.id) {
					const allActiveTabs = await browser.tabs.query({active: true});
					currentTab = allActiveTabs.find(tab =>
						tab.id && tab.url && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('moz-extension://')
					) || allActiveTabs[0];
				}
				if (currentTab && currentTab.id) {
					sendResponse({tabId: currentTab.id});
				} else {
					sendResponse({error: 'No active tab found'});
				}
			});
			return true;
		}

		if (typedRequest.action === "openOptionsPage") {
			try {
				if (typeof browser.runtime.openOptionsPage === 'function') {
					// Chrome way
					browser.runtime.openOptionsPage();
				} else {
					// Firefox way
					browser.tabs.create({
						url: browser.runtime.getURL('settings.html')
					});
				}
				sendResponse({success: true});
			} catch (error) {
				console.error('Error opening options page:', error);
				sendResponse({success: false, error: error instanceof Error ? error.message : String(error)});
			}
			return true;
		}

		if (typedRequest.action === "openSettings") {
			try {
				const section = typedRequest.section ? `?section=${typedRequest.section}` : '';
				browser.tabs.create({
					url: browser.runtime.getURL(`settings.html${section}`)
				});
				sendResponse({success: true});
			} catch (error) {
				console.error('Error opening settings:', error);
				sendResponse({success: false, error: error instanceof Error ? error.message : String(error)});
			}
			return true;
		}

		if (typedRequest.action === "copyMarkdownToClipboard" || typedRequest.action === "saveMarkdownToFile") {
			if (sender.tab?.id) {
				(async () => {
					try {
						await ensureContentScriptLoadedInBackground(sender.tab!.id!);
						await browser.tabs.sendMessage(sender.tab!.id!, { action: typedRequest.action });
						sendResponse({success: true});
					} catch (error) {
						sendResponse({success: false, error: error instanceof Error ? error.message : String(error)});
					}
				})();
				return true;
			}
		}

		if (typedRequest.action === "getTabInfo") {
			browser.tabs.get(typedRequest.tabId as number).then((tab) => {
				sendResponse({
					success: true,
					tab: {
						id: tab.id,
						url: tab.url
					}
				});
			}).catch((error) => {
				console.error('Error getting tab info:', error);
				sendResponse({
					success: false,
					error: error instanceof Error ? error.message : String(error)
				});
			});
			return true;
		}

		if (typedRequest.action === "forceInjectContentScript") {
			const tabId = typedRequest.tabId;
			if (tabId) {
				injectContentScript(tabId)
					.then(() => sendResponse({ success: true }))
					.catch((error) => {
						console.error('[Obsidian Clipper] forceInjectContentScript failed:', error);
						sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
					});
				return true;
			} else {
				sendResponse({ success: false, error: 'Missing tabId' });
				return true;
			}
		}

		if (typedRequest.action === "sendMessageToTab") {
			const tabId = (typedRequest as any).tabId;
			const message = (typedRequest as any).message;
			if (tabId && message) {
				// Ensure content script is loaded before sending message
				ensureContentScriptLoadedInBackground(tabId).then(() => {
					console.log('[Obsidian Clipper] Sending message to tab:', message.action);
					return browser.tabs.sendMessage(tabId, message);
				}).then((response) => {
					console.log('[Obsidian Clipper] Tab response:', response ? 'has content=' + !!((response as any).content) : response);
					sendResponse(response);
				}).catch((error) => {
					console.error('[Obsidian Clipper] Error sending message to tab:', error);
					sendResponse({
						success: false,
						error: error instanceof Error ? error.message : String(error)
					});
				});
				return true;
			} else {
				sendResponse({
					success: false,
					error: 'Missing tabId or message'
				});
				return true;
			}
		}

		if (typedRequest.action === "openObsidianUrl") {
			const url = (typedRequest as any).url;
			if (url) {
				browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
					const currentTab = tabs[0];
					if (currentTab && currentTab.id) {
						browser.tabs.update(currentTab.id, { url: url }).then(() => {
							sendResponse({ success: true });
						}).catch((error) => {
							console.error('Error opening Obsidian URL:', error);
							sendResponse({
								success: false,
								error: error instanceof Error ? error.message : String(error)
							});
						});
					} else {
						sendResponse({
							success: false,
							error: 'No active tab found'
						});
					}
				}).catch((error) => {
					console.error('Error querying tabs:', error);
					sendResponse({
						success: false,
						error: error instanceof Error ? error.message : String(error)
					});
				});
				return true;
			} else {
				sendResponse({
					success: false,
					error: 'Missing URL'
				});
				return true;
			}
		}

		// For other actions that use sendResponse
		if (typedRequest.action === "extractContent" ||
			typedRequest.action === "ensureContentScriptLoaded" ||
			typedRequest.action === "getHighlighterMode" ||
			typedRequest.action === "toggleHighlighterMode" ||
			typedRequest.action === "openObsidianUrl") {
			return true;
		}
	}
	return undefined;
});

browser.commands.onCommand.addListener(async (command, tab) => {
	// Some browsers (e.g. Orion) don't pass the tab parameter, so fall back to querying
	if (!tab?.id) {
		const tabs = await browser.tabs.query({active: true, currentWindow: true});
		tab = tabs[0];
	}

	if (command === 'quick_clip') {
		if (tab?.id) {
			openPopup();
			setTimeout(() => {
				browser.runtime.sendMessage({action: "triggerQuickClip"})
					.catch(error => console.error("Failed to send quick clip message:", error));
			}, 500);
		}
	}
	if (command === "toggle_highlighter" && tab?.id) {
		await ensureContentScriptLoadedInBackground(tab.id);
		toggleHighlighterMode(tab.id);
	}
	if (command === "copy_to_clipboard" && tab?.id) {
		await browser.tabs.sendMessage(tab.id, { action: "copyToClipboard" });
	}
	if (command === "toggle_reader" && tab?.id) {
		await ensureContentScriptLoadedInBackground(tab.id);
		await injectReaderScript(tab.id);
		await browser.tabs.sendMessage(tab.id, { action: "toggleReaderMode" });
	}
});

const debouncedUpdateContextMenu = debounce(async (tabId: number) => {
	if (isContextMenuCreating) {
		return;
	}
	isContextMenuCreating = true;

	try {
		await browser.contextMenus.removeAll();

		let currentTabId = tabId;
		if (currentTabId === -1) {
			const tabs = await browser.tabs.query({ active: true, currentWindow: true });
			if (tabs.length > 0) {
				currentTabId = tabs[0].id!;
			}
		}

		const isHighlighterMode = getHighlighterModeForTab(currentTabId);
		const isReaderMode = getReaderModeForTab(currentTabId);

		const menuItems: {
			id: string;
			title: string;
			contexts: browser.Menus.ContextType[];
		}[] = [
				{
					id: "open-obsidian-clipper",
					title: "Save this page",
					contexts: ["page", "selection", "image", "video", "audio"]
				},
				{
					id: 'copy-markdown-to-clipboard',
					title: browser.i18n.getMessage('copyToClipboard'),
					contexts: ["page", "selection"]
				},
				{
					id: isReaderMode ? "exit-reader" : "enter-reader",
					title: isReaderMode ? browser.i18n.getMessage('disableReader') : browser.i18n.getMessage('readerOn'),
					contexts: ["page", "selection"]
				},
				{
					id: isHighlighterMode ? "exit-highlighter" : "enter-highlighter",
					title: isHighlighterMode ? browser.i18n.getMessage('disableHighlighter') : browser.i18n.getMessage('highlighterOn'),
					contexts: ["page","image", "video", "audio"]
				},
				{
					id: "highlight-selection",
					title: "Add to highlights",
					contexts: ["selection"]
				},
				{
					id: "highlight-element",
					title: "Add to highlights",
					contexts: ["image", "video", "audio"]
				},
				{
					id: 'open-embedded',
					title: browser.i18n.getMessage('openEmbedded'),
					contexts: ["page", "selection"]
				}
			];

		const browserType = await detectBrowser();
		if (browserType === 'chrome') {
			menuItems.push({
				id: 'open-side-panel',
				title: browser.i18n.getMessage('openSidePanel'),
				contexts: ["page", "selection"]
			});
		}

		for (const item of menuItems) {
			await browser.contextMenus.create(item);
		}
	} catch (error) {
		console.error('Error updating context menu:', error);
	} finally {
		isContextMenuCreating = false;
	}
}, 100); // 100ms debounce time

browser.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId === "open-obsidian-clipper") {
		openPopup();
	} else if (info.menuItemId === "enter-highlighter" && tab && tab.id) {
		await setHighlighterMode(tab.id, true);
	} else if (info.menuItemId === "exit-highlighter" && tab && tab.id) {
		await setHighlighterMode(tab.id, false);
	} else if (info.menuItemId === "highlight-selection" && tab && tab.id) {
		await highlightSelection(tab.id, info);
	} else if (info.menuItemId === "highlight-element" && tab && tab.id) {
		await highlightElement(tab.id, info);
	} else if ((info.menuItemId === "enter-reader" || info.menuItemId === "exit-reader") && tab && tab.id) {
		await ensureContentScriptLoadedInBackground(tab.id);
		await injectReaderScript(tab.id);
		const response = await browser.tabs.sendMessage(tab.id, { action: "toggleReaderMode" }) as { success?: boolean; isActive?: boolean };
		if (response?.success) {
			readerModeState[tab.id] = response.isActive ?? false;
			debouncedUpdateContextMenu(tab.id);
		}
	} else if (info.menuItemId === 'open-embedded' && tab && tab.id) {
		await ensureContentScriptLoadedInBackground(tab.id);
		await browser.tabs.sendMessage(tab.id, { action: "toggle-iframe" });
	} else if (info.menuItemId === 'open-side-panel' && tab && tab.id && tab.windowId) {
		chrome.sidePanel.open({ tabId: tab.id });
		sidePanelOpenWindows.add(tab.windowId);
		await ensureContentScriptLoadedInBackground(tab.id);
	} else if (info.menuItemId === 'copy-markdown-to-clipboard' && tab && tab.id) {
		await ensureContentScriptLoadedInBackground(tab.id);
		await browser.tabs.sendMessage(tab.id, { action: "copyMarkdownToClipboard" });
	}
});

browser.runtime.onInstalled.addListener(() => {
	debouncedUpdateContextMenu(-1); // Use a dummy tabId for initial creation
});

async function isSidePanelOpen(windowId: number): Promise<boolean> {
	return sidePanelOpenWindows.has(windowId);
}

async function setupTabListeners() {
	const browserType = await detectBrowser();
	if (['chrome', 'brave', 'edge'].includes(browserType)) {
		browser.tabs.onActivated.addListener(handleTabChange);
		browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
			if (changeInfo.status === 'complete') {
				handleTabChange({ tabId, windowId: tab.windowId });
			}
		});
	}
}

const debouncedPaintHighlights = debounce(async (tabId: number) => {
	if (!getHighlighterModeForTab(tabId)) {
		await setHighlighterMode(tabId, false);
	}
	await paintHighlights(tabId);
}, 250);

async function handleTabChange(activeInfo: { tabId: number; windowId?: number }) {
	if (activeInfo.windowId && await isSidePanelOpen(activeInfo.windowId)) {
		updateCurrentActiveTab(activeInfo.windowId);
		await debouncedPaintHighlights(activeInfo.tabId);
	}
}

async function paintHighlights(tabId: number) {
	try {
		const tab = await browser.tabs.get(tabId);
		if (!tab || !tab.url || !isValidUrl(tab.url) || isBlankPage(tab.url)) {
			return;
		}

		await ensureContentScriptLoadedInBackground(tabId);
		await browser.tabs.sendMessage(tabId, { action: "paintHighlights" });

	} catch (error) {
		console.error('Error painting highlights:', error);
	}
}

async function setHighlighterMode(tabId: number, activate: boolean) {
	try {
		// First, check if the tab exists
		const tab = await browser.tabs.get(tabId);
		if (!tab || !tab.url) {
			return;
		}

		// Check if the URL is valid and not a blank page
		if (!isValidUrl(tab.url) || isBlankPage(tab.url)) {
			return;
		}

		// Then, ensure the content script is loaded
		await ensureContentScriptLoadedInBackground(tabId);

		// Now try to send the message
		highlighterModeState[tabId] = activate;
		await browser.tabs.sendMessage(tabId, { action: "setHighlighterMode", isActive: activate });
		debouncedUpdateContextMenu(tabId);
		await sendMessageToPopup(tabId, { action: "updatePopupHighlighterUI", isActive: activate });

	} catch (error) {
		console.error('Error setting highlighter mode:', error);
		// If there's an error, assume highlighter mode should be off
		highlighterModeState[tabId] = false;
		debouncedUpdateContextMenu(tabId);
		await sendMessageToPopup(tabId, { action: "updatePopupHighlighterUI", isActive: false });
	}
}

async function toggleHighlighterMode(tabId: number): Promise<boolean> {
	try {
		const currentMode = getHighlighterModeForTab(tabId);
		const newMode = !currentMode;
		highlighterModeState[tabId] = newMode;
		await browser.tabs.sendMessage(tabId, { action: "setHighlighterMode", isActive: newMode });
		debouncedUpdateContextMenu(tabId);
		await sendMessageToPopup(tabId, { action: "updatePopupHighlighterUI", isActive: newMode });
		return newMode;
	} catch (error) {
		console.error('Error toggling highlighter mode:', error);
		throw error;
	}
}

async function highlightSelection(tabId: number, info: browser.Menus.OnClickData) {
	highlighterModeState[tabId] = true;
	
	const highlightData: Partial<TextHighlightData> = {
		id: Date.now().toString(),
		type: 'text',
		content: info.selectionText || '',
	};

	await browser.tabs.sendMessage(tabId, { 
		action: "highlightSelection", 
		isActive: true,
		highlightData,
	});
	hasHighlights = true;
	debouncedUpdateContextMenu(tabId);
}

async function highlightElement(tabId: number, info: browser.Menus.OnClickData) {
	highlighterModeState[tabId] = true;

	await browser.tabs.sendMessage(tabId, { 
		action: "highlightElement", 
		isActive: true,
		targetElementInfo: {
			mediaType: info.mediaType === 'image' ? 'img' : info.mediaType,
			srcUrl: info.srcUrl,
			pageUrl: info.pageUrl
		}
	});
	hasHighlights = true;
	debouncedUpdateContextMenu(tabId);
}

async function injectReaderScript(tabId: number) {
	try {
		await browser.scripting.insertCSS({
			target: { tabId },
			files: ['reader.css']
		});
		await browser.scripting.insertCSS({
			target: { tabId },
			files: ['highlighter.css']
		}).catch(() => {});

		// Inject scripts in sequence for all browsers
		await browser.scripting.executeScript({
			target: { tabId },
			files: ['browser-polyfill.min.js']
		});
		await browser.scripting.executeScript({
			target: { tabId },
			files: ['reader-script.js']
		});

		return true;
	} catch (error) {
		console.error('Error injecting reader script:', error);
		return false;
	}
}

// When set to 'reader' or 'embedded', clear the popup so action.onClicked fires
// instead, handling the action directly without briefly opening the popup.
const validOpenBehaviors: Settings['openBehavior'][] = ['popup', 'embedded', 'reader'];

function parseOpenBehavior(raw: string | undefined): Settings['openBehavior'] {
	return validOpenBehaviors.includes(raw as Settings['openBehavior']) ? raw as Settings['openBehavior'] : 'popup';
}

async function updateActionPopup(openBehavior?: Settings['openBehavior']): Promise<void> {
	if (!openBehavior) {
		const data = await browser.storage.sync.get('general_settings');
		openBehavior = parseOpenBehavior((data.general_settings as Record<string, string>)?.openBehavior);
	}
	currentOpenBehavior = openBehavior;
	if (openBehavior === 'reader' || openBehavior === 'embedded') {
		await browser.action.setPopup({ popup: '' });
	} else {
		await browser.action.setPopup({ popup: 'popup.html' });
	}
}

let currentOpenBehavior: Settings['openBehavior'] = 'popup';

// In reader/embedded mode, opens embedded iframe instead of popup.
async function openPopup(): Promise<void> {
	if (currentOpenBehavior === 'reader' || currentOpenBehavior === 'embedded') {
		const tabs = await browser.tabs.query({ active: true, currentWindow: true });
		const tab = tabs[0];
		if (tab?.id && tab.url && isValidUrl(tab.url) && !isBlankPage(tab.url)) {
			await ensureContentScriptLoadedInBackground(tab.id);
			await browser.tabs.sendMessage(tab.id, { action: "toggle-iframe" });
			return;
		}
		// Fall through to popup if tab is invalid
	}
	await browser.action.openPopup();
}

browser.action.onClicked.addListener(async (tab) => {
	if (!tab?.id || !tab.url || !isValidUrl(tab.url) || isBlankPage(tab.url)) return;

	if (currentOpenBehavior === 'reader') {
		await ensureContentScriptLoadedInBackground(tab.id);
		await injectReaderScript(tab.id);
		const response = await browser.tabs.sendMessage(tab.id, { action: "toggleReaderMode" }) as { success?: boolean; isActive?: boolean };
		if (response?.success) {
			readerModeState[tab.id] = response.isActive ?? false;
			debouncedUpdateContextMenu(tab.id);
		}
	} else if (currentOpenBehavior === 'embedded') {
		await ensureContentScriptLoadedInBackground(tab.id);
		await browser.tabs.sendMessage(tab.id, { action: "toggle-iframe" });
	}
});

browser.storage.onChanged.addListener((changes, area) => {
	if (area === 'sync' && changes.general_settings) {
		updateActionPopup(parseOpenBehavior((changes.general_settings.newValue as Record<string, string>)?.openBehavior));
	}
});

// Initialize the extension
initialize().catch(error => {
	console.error('Failed to initialize background script:', error);
});
