import { promises as fs } from 'fs';
import path from 'path';

const TUS_TEMP_PATH = path.join(process.env.UPLOAD_PATH || '/app/uploads', '.tus-resumable');
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export class TusCleanupService {
  private interval: ReturnType<typeof setInterval> | null = null;

  start(intervalMs: number = 60 * 60 * 1000) {
    this.interval = setInterval(() => this.cleanup(), intervalMs);
    console.log('[TusCleanup] Started cleanup cron (every 1h, max age 24h)');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async cleanup(): Promise<number> {
    let removed = 0;
    try {
      const entries = await fs.readdir(TUS_TEMP_PATH);
      const now = Date.now();

      for (const entry of entries) {
        const fullPath = path.join(TUS_TEMP_PATH, entry);
        try {
          const stats = await fs.stat(fullPath);
          if (now - stats.mtimeMs > MAX_AGE_MS) {
            await fs.rm(fullPath, { recursive: true, force: true });
            removed++;
          }
        } catch {
          // File may have been deleted between readdir and stat
        }
      }

      if (removed > 0) {
        console.log(`[TusCleanup] Removed ${removed} stale uploads`);
      }
    } catch {
      // Directory may not exist yet
    }
    return removed;
  }
}
