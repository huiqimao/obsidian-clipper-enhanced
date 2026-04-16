import browser from './utils/browser-polyfill';

(async () => {
	const status = document.getElementById('status')!;
	const params = new URLSearchParams(window.location.search);
	const code = params.get('code');
	const error = params.get('error');

	if (error) {
		status.textContent = `Authorization denied: ${error}`;
		return;
	}

	if (!code) {
		status.textContent = 'No authorization code received.';
		return;
	}

	status.textContent = 'Exchanging code for token...';

	try {
		const response = await browser.runtime.sendMessage({
			action: 'feishuExchangeToken',
			code,
		}) as { success: boolean; error?: string };

		if (response?.success) {
			status.textContent = 'Authorization successful! You can close this tab.';
			setTimeout(() => window.close(), 2000);
		} else {
			status.textContent = `Token exchange failed: ${response?.error || 'Unknown error'}`;
		}
	} catch (err) {
		status.textContent = `Error: ${(err as Error).message}`;
	}
})();
