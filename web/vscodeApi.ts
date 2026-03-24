class VSCodeApi {
	private ws: WebSocket;
	private state: any = {};
	private callbacks: ((msg: any) => void)[] = [];

	constructor() {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		this.ws = new WebSocket(`${protocol}//${window.location.host}`);
		
		this.ws.onmessage = (event) => {
			const msg = JSON.parse(event.data);
			for (const cb of this.callbacks) {
				cb({ data: msg }); // Mocking VS Code's window.addEventListener('message', ...)
			}
		};
		
		// Map window.addEventListener to our mock if they try to use it directly
		const originalAddEventListener = window.addEventListener;
		window.addEventListener = (type: string, listener: any) => {
			if (type === 'message') {
				this.callbacks.push(listener);
			} else {
				originalAddEventListener.call(window, type, listener);
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
}

export const vscode = new VSCodeApi();
