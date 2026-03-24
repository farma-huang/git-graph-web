export interface Disposable {
	dispose(): void;
}

export class DisposableBase implements Disposable {
	private disposables: Disposable[] = [];
	private disposed: boolean = false;

	/**
	 * Disposes the resources used by the subclass.
	 */
	public dispose() {
		this.disposed = true;
		this.disposables.forEach((disposable) => {
			try {
				disposable.dispose();
			} catch (_) { }
		});
		this.disposables = [];
	}

	/**
	 * Register a single disposable.
	 */
	protected registerDisposable(disposable: Disposable) {
		this.disposables.push(disposable);
	}

	/**
	 * Register multiple disposables.
	 */
	protected registerDisposables(...disposables: Disposable[]) {
		this.disposables.push(...disposables);
	}

	/**
	 * Is the Disposable disposed.
	 * @returns `TRUE` => Disposable has been disposed, `FALSE` => Disposable hasn't been disposed.
	 */
	protected isDisposed() {
		return this.disposed;
	}
}

export function toDisposable(fn: () => void): Disposable {
	return {
		dispose: fn
	};
}
