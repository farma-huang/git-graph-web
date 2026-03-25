// @ts-ignore
import { describe, it, expect } from 'bun:test';
import { ansiToHtml } from './ansiToHtml';

describe('ansiToHtml', () => {
	it('returns plain text unchanged', () => {
		expect(ansiToHtml('hello world')).toBe('hello world');
	});

	it('escapes HTML special chars', () => {
		expect(ansiToHtml('<b>&"')).toBe('&lt;b&gt;&amp;&quot;');
	});

	it('applies standard foreground colour (red = 31)', () => {
		const result = ansiToHtml('\x1b[31mred\x1b[0m');
		expect(result).toContain('color:#c00000');
		expect(result).toContain('>red<');
	});

	it('applies bright foreground colour (bright green = 92)', () => {
		const result = ansiToHtml('\x1b[92mgreen\x1b[0m');
		expect(result).toContain('color:#00ff00');
	});

	it('applies 256-colour foreground', () => {
		// colour 196 = pure red in 256-palette cube
		const result = ansiToHtml('\x1b[38;5;196mred256\x1b[0m');
		expect(result).toContain('color:');
		expect(result).toContain('>red256<');
	});

	it('applies truecolor foreground', () => {
		const result = ansiToHtml('\x1b[38;2;255;128;0morange\x1b[0m');
		expect(result).toContain('color:rgb(255,128,0)');
	});

	it('applies bold', () => {
		const result = ansiToHtml('\x1b[1mbold\x1b[0m');
		expect(result).toContain('font-weight:bold');
	});

	it('strips unknown sequences silently', () => {
		const result = ansiToHtml('\x1b[99munknown\x1b[0m');
		expect(result).toBe('unknown');
	});

	it('handles mixed colour + bold', () => {
		const result = ansiToHtml('\x1b[1;31mbold red\x1b[0m');
		expect(result).toContain('font-weight:bold');
		expect(result).toContain('color:#c00000');
	});

	it('resets state after reset sequence', () => {
		const result = ansiToHtml('\x1b[31mred\x1b[0m normal');
		// "normal" should not have the red colour
		expect(result).not.toContain('>normal<');  // no span around normal
		expect(result.endsWith(' normal')).toBe(true);
	});
});
