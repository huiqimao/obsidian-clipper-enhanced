// AES-GCM encryption for sensitive settings (appSecret) stored in browser.storage.sync.
// The encryption key is derived from the extension's own ID, which is stable per installation
// and not accessible to other extensions. This prevents casual plaintext inspection of
// sync storage without meaningful runtime overhead.

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;

function getKeyMaterial(): string {
	// chrome.runtime.id is the extension's unique ID — stable per install, per user
	if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
		return chrome.runtime.id;
	}
	// Fallback for non-extension contexts (tests)
	return 'obsidian-clipper-dev-key';
}

async function deriveKey(): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const rawKey = encoder.encode(getKeyMaterial().padEnd(32, '0').slice(0, 32));
	return crypto.subtle.importKey('raw', rawKey, { name: ALGO }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plaintext: string): Promise<string> {
	if (!plaintext) return '';
	const key = await deriveKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoded = new TextEncoder().encode(plaintext);
	const cipherBuf = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);
	const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(cipherBuf), iv.byteLength);
	return btoa(String.fromCharCode(...combined));
}

export async function decryptSecret(ciphertext: string): Promise<string> {
	if (!ciphertext) return '';
	// If the value looks like a raw (unencrypted) secret, return it as-is so
	// existing saved values keep working until the user re-saves.
	if (!isEncrypted(ciphertext)) return ciphertext;
	try {
		const key = await deriveKey();
		const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
		const iv = combined.slice(0, 12);
		const data = combined.slice(12);
		const plainBuf = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
		return new TextDecoder().decode(plainBuf);
	} catch {
		// Decryption failed (e.g. stored with a different extension ID) — return empty
		// so the user is prompted to re-enter rather than seeing garbled text.
		return '';
	}
}

// Heuristic: base64 strings of encrypted data are longer than typical secrets
// and contain no spaces. Raw Feishu app secrets are ~32 alphanumeric chars.
function isEncrypted(value: string): boolean {
	return value.length > 50 && /^[A-Za-z0-9+/=]+$/.test(value);
}

export function validateFeishuCredentials(appId: string, appSecret: string): string | null {
	if (!appId.trim()) return 'App ID is required.';
	if (!appSecret.trim()) return 'App Secret is required.';
	// Feishu App IDs always start with "cli_"
	if (!appId.startsWith('cli_')) return 'App ID should start with "cli_".';
	// Feishu App Secrets are 32-character hex strings
	if (appSecret.length < 16) return 'App Secret looks too short. Please check it in the Feishu App Console.';
	return null;
}
