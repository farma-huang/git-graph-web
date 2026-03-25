// Standard 16-colour palette (0-7 normal, 8-15 bright)
const ANSI_16_COLOURS: string[] = [
	'#000000', '#c00000', '#00c000', '#c0c000',
	'#0000c0', '#c000c0', '#00c0c0', '#c0c0c0',
	'#808080', '#ff0000', '#00ff00', '#ffff00',
	'#0000ff', '#ff00ff', '#00ffff', '#ffffff'
];

function build256Palette(): string[] {
	const palette: string[] = [...ANSI_16_COLOURS];
	// 16-231: 6x6x6 colour cube
	for (let r = 0; r < 6; r++) {
		for (let g = 0; g < 6; g++) {
			for (let b = 0; b < 6; b++) {
				const rv = r === 0 ? 0 : 55 + r * 40;
				const gv = g === 0 ? 0 : 55 + g * 40;
				const bv = b === 0 ? 0 : 55 + b * 40;
				palette.push(`rgb(${rv},${gv},${bv})`);
			}
		}
	}
	// 232-255: greyscale ramp
	for (let i = 0; i < 24; i++) {
		const v = 8 + i * 10;
		palette.push(`rgb(${v},${v},${v})`);
	}
	return palette;
}

const PALETTE_256 = build256Palette();

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

interface AnsiState {
	fg: string | null;
	bg: string | null;
	bold: boolean;
}

function stateToStyle(state: AnsiState): string {
	const parts: string[] = [];
	if (state.bold) parts.push('font-weight:bold');
	if (state.fg) parts.push(`color:${state.fg}`);
	if (state.bg) parts.push(`background:${state.bg}`);
	return parts.join(';');
}

function isActive(state: AnsiState): boolean {
	return state.bold || state.fg !== null || state.bg !== null;
}

export function ansiToHtml(input: string): string {
	// Regex: match ESC[ ... m sequences
	const ESC_SEQ = /\x1b\[([0-9;]*)m/g;
	let result = '';
	let state: AnsiState = { fg: null, bg: null, bold: false };
	let spanOpen = false;
	let lastIndex = 0;

	const closeSpan = () => {
		if (spanOpen) { result += '</span>'; spanOpen = false; }
	};

	const openSpanIfNeeded = () => {
		if (isActive(state)) {
			result += `<span style="${stateToStyle(state)}">`;
			spanOpen = true;
		}
	};

	let match: RegExpExecArray | null;
	while ((match = ESC_SEQ.exec(input)) !== null) {
		// Append text before this sequence
		const textBefore = input.slice(lastIndex, match.index);
		if (textBefore) result += escapeHtml(textBefore);
		lastIndex = match.index + match[0].length;

		// Parse the codes
		const codes = match[1] === '' ? [0] : match[1].split(';').map(Number);
		closeSpan();

		let i = 0;
		while (i < codes.length) {
			const code = codes[i];
			if (code === 0) {
				state = { fg: null, bg: null, bold: false };
			} else if (code === 1) {
				state.bold = true;
			} else if (code >= 30 && code <= 37) {
				state.fg = ANSI_16_COLOURS[code - 30];
			} else if (code >= 40 && code <= 47) {
				state.bg = ANSI_16_COLOURS[code - 40];
			} else if (code >= 90 && code <= 97) {
				state.fg = ANSI_16_COLOURS[code - 90 + 8];
			} else if (code >= 100 && code <= 107) {
				state.bg = ANSI_16_COLOURS[code - 100 + 8];
			} else if (code === 38 && codes[i + 1] === 5) {
				state.fg = PALETTE_256[codes[i + 2]] ?? null;
				i += 2;
			} else if (code === 48 && codes[i + 1] === 5) {
				state.bg = PALETTE_256[codes[i + 2]] ?? null;
				i += 2;
			} else if (code === 38 && codes[i + 1] === 2) {
				state.fg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
				i += 4;
			} else if (code === 48 && codes[i + 1] === 2) {
				state.bg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
				i += 4;
			}
			// unknown codes are silently ignored
			i++;
		}

		openSpanIfNeeded();
	}

	// Remaining text after last sequence
	const tail = input.slice(lastIndex);
	if (tail) result += escapeHtml(tail);
	closeSpan();

	return result;
}
