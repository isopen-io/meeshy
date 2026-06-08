import { promises as fs } from 'fs';
import path from 'path';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const TUS_TEMP_PATH = path.join(process.env.UPLOAD_PATH || '/app/uploads', '.tus-resumable');
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const logger = enhancedLogger.child({ module: 'TusCleanupService' });

export class TusCleanupService {
  private interval: ReturnType<typeof setInterval> | null = null;

  start(intervalMs: number = 60 * 60 * 1000) {
    this.interval = setInterval(() => this.cleanup(), intervalMs);
    this.interval.unref?.();
    logger.info('TusCleanup started', { intervalHours: intervalMs / (60 * 60 * 1000), maxAgeHours: 24 });
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
        logger.info('TusCleanup removed stale uploads', { count: removed });
      }
    } catch {
      // Directory may not exist yet
    }
    return removed;
  }
}
