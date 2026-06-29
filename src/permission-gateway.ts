export interface PermissionResult {
  behavior: 'allow' | 'deny';
  message?: string;
}

export interface PermissionResolution {
  behavior: 'allow' | 'deny';
  message?: string;
}

export class PendingPermissions {
  private pending = new Map<string, {
    resolve: (r: PermissionResult) => void;
    timer: NodeJS.Timeout;
  }>();

  /**
   * Per-request timeout in milliseconds. Defaults to 5 minutes; can be
   * overridden via env (CTI_PERMISSION_TIMEOUT_MS) for environments with
   * slower or faster user feedback cycles.
   */
  private timeoutMs = Number(process.env.CTI_PERMISSION_TIMEOUT_MS) || 5 * 60 * 1000;

  waitFor(toolUseID: string): Promise<PermissionResult> {
    return new Promise((resolve) => {
      // Defensive: if a previous waitFor for the same toolUseID is still
      // pending (e.g. SDK retried after a transient error), drain it first
      // so its promise resolves instead of hanging forever.
      const stale = this.pending.get(toolUseID);
      if (stale) {
        clearTimeout(stale.timer);
        stale.resolve({ behavior: 'deny', message: 'Superseded by new request' });
        this.pending.delete(toolUseID);
      }

      const timer = setTimeout(() => {
        this.pending.delete(toolUseID);
        resolve({ behavior: 'deny', message: 'Permission request timed out' });
      }, this.timeoutMs);
      // unref so the timer never keeps the event loop alive on its own —
      // the daemon has its own setInterval keepalive.
      timer.unref();

      this.pending.set(toolUseID, { resolve, timer });
    });
  }

  resolve(permissionRequestId: string, resolution: PermissionResolution): boolean {
    const entry = this.pending.get(permissionRequestId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    if (resolution.behavior === 'allow') {
      entry.resolve({ behavior: 'allow' });
    } else {
      entry.resolve({ behavior: 'deny', message: resolution.message || 'Denied by user' });
    }
    this.pending.delete(permissionRequestId);
    return true;
  }

  denyAll(): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.resolve({ behavior: 'deny', message: 'Bridge shutting down' });
    }
    this.pending.clear();
  }

  get size(): number {
    return this.pending.size;
  }
}