import { describe, expect, test } from 'vitest';
import { extractFeishuDocToken, extractFeishuDocumentId, getFeishuApiBase } from './feishu-api';

describe('extractFeishuDocToken', () => {
	test('extracts docx token', () => {
		const result = extractFeishuDocToken('https://company.feishu.cn/docx/TLLKdcpDro9ijQxA33ycNMabcef');
		expect(result).toEqual({ type: 'docx', token: 'TLLKdcpDro9ijQxA33ycNMabcef' });
	});

	test('extracts wiki token', () => {
		const result = extractFeishuDocToken('https://bytedance.larkoffice.com/wiki/NV9EwaPMPiNlJhkPC2CcCIoXn3g');
		expect(result).toEqual({ type: 'wiki', token: 'NV9EwaPMPiNlJhkPC2CcCIoXn3g' });
	});

	test('extracts wiki token from feishu.cn', () => {
		const result = extractFeishuDocToken('https://foo.feishu.cn/wiki/abc123');
		expect(result).toEqual({ type: 'wiki', token: 'abc123' });
	});

	test('returns null for sheets URL', () => {
		expect(extractFeishuDocToken('https://foo.feishu.cn/sheets/sheetToken')).toBeNull();
	});

	test('returns null for non-Feishu URL', () => {
		expect(extractFeishuDocToken('https://example.com/docx/abc123')).toBeNull();
	});

	test('returns null for malformed URL', () => {
		expect(extractFeishuDocToken('not-a-url')).toBeNull();
	});
});

describe('extractFeishuDocumentId', () => {
	test('extracts id from docx URL', () => {
		expect(extractFeishuDocumentId('https://company.feishu.cn/docx/TLLKdcpDro9ijQxA33ycNMabcef'))
			.toBe('TLLKdcpDro9ijQxA33ycNMabcef');
	});

	test('extracts id from wiki URL', () => {
		expect(extractFeishuDocumentId('https://bytedance.larkoffice.com/wiki/NV9EwaPMPiNlJhkPC2CcCIoXn3g'))
			.toBe('NV9EwaPMPiNlJhkPC2CcCIoXn3g');
	});

	test('extracts id from larksuite.com URL', () => {
		expect(extractFeishuDocumentId('https://company.larksuite.com/docx/abc123'))
			.toBe('abc123');
	});

	test('handles URL with query params', () => {
		expect(extractFeishuDocumentId('https://foo.feishu.cn/docx/myDocId?from=wiki'))
			.toBe('myDocId');
	});

	test('returns null for sheets URL', () => {
		expect(extractFeishuDocumentId('https://foo.feishu.cn/sheets/sheetToken')).toBeNull();
	});

	test('returns null for non-Feishu URL', () => {
		expect(extractFeishuDocumentId('https://example.com/docx/abc123')).toBeNull();
	});
});

describe('getFeishuApiBase', () => {
	test('returns open.feishu.cn for feishu.cn URLs', () => {
		expect(getFeishuApiBase('https://company.feishu.cn/docx/abc')).toBe('https://open.feishu.cn');
	});

	test('returns open.larksuite.com for larksuite.com URLs', () => {
		expect(getFeishuApiBase('https://company.larksuite.com/docx/abc')).toBe('https://open.larksuite.com');
	});

	test('returns open.larksuite.com for larkoffice.com URLs', () => {
		expect(getFeishuApiBase('https://company.larkoffice.com/docx/abc')).toBe('https://open.larksuite.com');
	});

	test('defaults to open.feishu.cn for unknown URLs', () => {
		expect(getFeishuApiBase('https://example.com/page')).toBe('https://open.feishu.cn');
	});
});
