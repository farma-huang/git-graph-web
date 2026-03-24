import * as fs from 'fs';
import * as path from 'path';

const files = [
    'vscodeApi.ts',
    'utils.ts',
    'textFormatter.ts',
    'dialog.ts',
    'contextMenu.ts',
    'dropdown.ts',
    'findWidget.ts',
    'settingsWidget.ts',
    'graph.ts',
    'main.ts'
];

let bundle = '';
for (const file of files) {
    let content = fs.readFileSync(path.join(__dirname, '../web', file), 'utf8');
    // Remove imports
    content = content.replace(/^import .*;/gm, '');
    // Replace export const vscode = ... with just const vscode = ...
    content = content.replace(/^export const vscode/gm, 'const vscode');
    bundle += content + '\n\n';
}

fs.writeFileSync(path.join(__dirname, '../web/bundle.ts'), bundle);
