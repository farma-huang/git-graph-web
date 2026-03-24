// Intercept 'load' event listeners so we can delay them until initialState is ready.
// This must happen before any other code runs.
const _originalAddEventListener = window.addEventListener.bind(window);
const _loadListeners: ((e: Event) => void)[] = [];

window.addEventListener = (type: string, listener: any, options?: any) => {
	if (type === 'load') {
		_loadListeners.push(listener);
	} else {
		_originalAddEventListener(type, listener, options);
	}
};

class VSCodeApi {
	private ws: WebSocket;
	private state: any = {};
	private callbacks: ((msg: any) => void)[] = [];

	constructor() {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		// In dev mode (Vite on 5173), WebSocket goes directly to the backend server on 3000.
		// In production (served from 3000), use the same host.
		const wsHost = window.location.port === '5173' ? `${window.location.hostname}:3000` : window.location.host;
		this.ws = new WebSocket(`${protocol}//${wsHost}`);

		this.ws.onmessage = (event) => {
			const msg = JSON.parse(event.data);
			for (const cb of this.callbacks) {
				cb({ data: msg }); // Mocking VS Code's window.addEventListener('message', ...)
			}
		};

		// Map window.addEventListener('message', ...) to our WebSocket callbacks
		const currentAddEventListener = window.addEventListener;
		window.addEventListener = (type: string, listener: any, options?: any) => {
			if (type === 'message') {
				this.callbacks.push(listener);
			} else {
				currentAddEventListener.call(window, type, listener, options);
			}
		};
	}

	postMessage(msg: any) {
		if (this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		} else {
			this.ws.addEventListener('open', () => this.ws.send(JSON.stringify(msg)), { once: true });
		}
	}

	getState() {
		return this.state;
	}

	setState(state: any) {
		this.state = state;
	}

	dispatchMessage(msg: any) {
		for (const cb of this.callbacks) {
			cb({ data: msg });
		}
	}

	callbackCount() {
		return this.callbacks.length;
	}
}

export const vscode = new VSCodeApi();

fetch('/api/initial-state')
	.then(res => res.json())
	.then(state => {
		(window as any).initialState = state;
		(window as any).globalState = { alwaysAcceptCheckoutCommit: false, issueLinkingConfig: null, pushTagSkipRemoteCheck: false };
		(window as any).workspaceState = { findIsCaseSensitive: false, findIsRegex: false, findOpenCommitDetailsView: false };
		// Fire all deferred 'load' listeners
		const loadEvent = new Event('load');
		for (const listener of _loadListeners) {
			listener(loadEvent);
		}
		// The server sends 'refresh' on WebSocket open, but that happens before load listeners
		// are registered. Re-dispatch refresh now that everything is ready.
		console.log('[vscodeApi] firing refresh, callbacks count:', vscode.callbackCount());
		vscode.dispatchMessage({ command: 'refresh' });
	});
