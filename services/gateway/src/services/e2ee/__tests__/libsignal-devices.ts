/**
 * Des appareils libsignal RÉELS pour les témoins d'intégration (#3706, #13142) :
 * `libsignal-device.mjs` tourne dans un processus Node à part, car Jest remplace
 * la bibliothèque native par un simulacre. Les clés privées restent dans ce
 * processus ; seules les parties publiques et les chiffrés en sortent.
 */
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface } from 'readline';
import { join } from 'path';
import type { LibsignalPublicKeyApi } from '../signature-verifier';

const HELPER = join(__dirname, 'libsignal-device.mjs');

export class LibsignalDevices {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private next = 1;

  constructor() {
    this.child = spawn(process.execPath, [HELPER, 'serve']);
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      const { id, result, error } = JSON.parse(line) as { id: number; result?: unknown; error?: string };
      const waiter = this.pending.get(id);
      this.pending.delete(id);
      if (error) waiter?.reject(new Error(error));
      else waiter?.resolve(result);
    });
  }

  request<T>(command: string, args: Record<string, unknown>): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      this.child.stdin.write(`${JSON.stringify({ id, command, args })}\n`);
    });
  }

  close(): void {
    this.child.kill();
  }
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/** La surface `PublicKey` de libsignal, servie par la VRAIE bibliothèque d'un processus à part. */
export const realLibsignal: LibsignalPublicKeyApi = {
  PublicKey: {
    deserialize: (identityKey: Uint8Array) => ({
      verify: (message: Uint8Array, signature: Uint8Array) =>
        execFileSync(process.execPath, [HELPER, 'verify', b64(identityKey), b64(message), b64(signature)]).toString() === 'true',
    }),
  },
};
