import type { AssetAuthContext, RichMediaPlatform } from '../types/types';

function safeReadStorage(storage: Storage | undefined, keys: string[]): Record<string, string> {
	const values: Record<string, string> = {};
	if (!storage) {
		return values;
	}

	for (const key of keys) {
		try {
			const value = storage.getItem(key);
			if (value) {
				values[key] = value;
			}
		} catch {
			// Ignore storage access failures in restricted contexts.
		}
	}

	return values;
}

function parseCookieString(cookieString: string): Record<string, string> {
	const cookies: Record<string, string> = {};
	for (const part of cookieString.split(';')) {
		const [rawKey, ...rawValue] = part.trim().split('=');
		if (!rawKey) {
			continue;
		}
		cookies[rawKey] = rawValue.join('=');
	}
	return cookies;
}

function findToken(source: Record<string, string>): { key: string; value: string } | null {
	let fallback: { key: string; value: string } | null = null;
	for (const [key, value] of Object.entries(source)) {
		if (!value) continue;
		if (/(csrf|token|passport)/i.test(key)) {
			return { key, value };
		}
		if (!fallback && /(session|tenant)/i.test(key)) {
			fallback = { key, value };
		}
	}
	return fallback;
}

export async function resolveAssetAuth(platform: RichMediaPlatform, doc?: Document): Promise<AssetAuthContext> {
	if (platform !== 'feishu') {
		return {
			platform: 'generic',
			strategy: 'public',
			needsRelay: false,
			credentials: 'same-origin',
			resolvedAt: new Date().toISOString(),
		};
	}

	const activeDocument = doc ?? (typeof document !== 'undefined' ? document : undefined);
	const activeWindow = activeDocument?.defaultView ?? (typeof window !== 'undefined' ? window : undefined);
	const cookies = activeDocument ? parseCookieString(activeDocument.cookie || '') : {};
	const localStorageValues = activeWindow
		? safeReadStorage(activeWindow.localStorage, [
			'session',
			'sessionid',
			'passport_csrf_token',
			'csrfToken',
			'xsrfToken',
			'feishu_csrf_token',
			'web_id',
			'tenantKey',
			'tenant_key',
			'lark-session',
			'client_token',
			'access_token',
			'bearer_token',
			'user_token',
		])
		: {};
	const sessionStorageValues = activeWindow
		? safeReadStorage(activeWindow.sessionStorage, [
			'session',
			'sessionid',
			'passport_csrf_token',
			'csrfToken',
			'xsrfToken',
			'feishu_csrf_token',
			'client_token',
			'access_token',
			'bearer_token',
			'user_token',
		])
		: {};

	const cookieToken = findToken(cookies);
	const localToken = findToken(localStorageValues);
	const sessionToken = findToken(sessionStorageValues);
	const token = cookieToken ?? localToken ?? sessionToken;
	const tokenSource = cookieToken ? 'cookie' : localToken ? 'localStorage' : sessionToken ? 'sessionStorage' : undefined;
	const headers: Record<string, string> = {};

	if (token) {
		headers.Authorization = `Bearer ${token.value}`;
	}

	const authContext: AssetAuthContext = {
		platform: 'feishu',
		strategy: token ? 'token' : 'credentials',
		needsRelay: false,
		credentials: 'include',
		headers: Object.keys(headers).length > 0 ? headers : undefined,
		cookies: Object.keys(cookies).length > 0 ? cookies : undefined,
		storage: Object.keys({ ...localStorageValues, ...sessionStorageValues }).length > 0
			? { ...localStorageValues, ...sessionStorageValues }
			: undefined,
		token: token?.value,
		tokenSource,
		resolvedAt: new Date().toISOString(),
	};

	const host = activeDocument?.location?.hostname || (typeof location !== 'undefined' ? location.hostname : '');
	if (!/(feishu\.cn|larksuite\.com|larkoffice\.com)$/i.test(host) && host) {
		authContext.needsRelay = true;
		authContext.strategy = token ? 'relay' : 'credentials';
	}

	return authContext;
}
