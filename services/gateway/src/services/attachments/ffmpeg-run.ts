import { spawn } from 'child_process';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { guardedTimeout } from '../../utils/guarded-timer.js';

const logger = enhancedLogger.child({ module: 'ffmpeg-run' });

export const FFMPEG_DEFAULT_TIMEOUT_MS = 5 * 60_000;

/** Run ffmpeg with the given argv; resolves on exit 0, rejects otherwise. */
export function runFfmpeg(args: string[], timeoutMs: number = FFMPEG_DEFAULT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    const timer = guardedTimeout({ name: 'ffmpeg-transcode-timeout', afterMs: timeoutMs, logger, run: () => {
      proc.kill('SIGKILL');
      reject(new Error('ffmpeg transcode timeout'));
    } });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}
