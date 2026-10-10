import type { EmbeddedTranslator } from './engine';
import { NLLB_CODES } from './nllb-codes';

export type WorkerRequest = { readonly id: number; readonly text: string; readonly source: string; readonly target: string };

export type WorkerReply =
  | { readonly id: number; readonly ok: true; readonly text: string }
  | { readonly id: number; readonly ok: false; readonly error: string };

/**
 * **LE CÔTÉ WORKER** (#9898) — toute la logique, testable sans thread ;
 * `device-translation-worker.ts` n'en est que la colle (motif de
 * `video-effects-host.ts`). Le modèle tourne hors du fil principal : la
 * liste défile pendant qu'un message se traduit.
 */
export function createWorkerHost(params: { readonly engine: EmbeddedTranslator; readonly post: (reply: WorkerReply) => void }) {
  return {
    receive: async ({ id, text, source, target }: WorkerRequest): Promise<void> => {
      try {
        params.post({ id, ok: true, text: await params.engine.translate(text, { source, target }) });
      } catch (error) {
        params.post({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

export type WorkerPort = {
  postMessage(request: WorkerRequest): void;
  addEventListener(type: 'message', listener: (event: { readonly data: WorkerReply }) => void): void;
};

const nllbSupports = (source: string, target: string): boolean => NLLB_CODES[source] !== undefined && NLLB_CODES[target] !== undefined;

/**
 * **LE CÔTÉ PAGE** — un `EmbeddedTranslator` dont le calcul vit dans le Worker.
 * La page décide seule de ce que le modèle couvre, sans réveiller le Worker :
 * `supports` est celui du moteur que le Worker charge (NLLB par défaut).
 */
export function createWorkerTranslator(params: {
  readonly port: WorkerPort;
  readonly name: string;
  readonly supports?: (source: string, target: string) => boolean;
}): EmbeddedTranslator {
  const waiting = new Map<number, { readonly resolve: (text: string) => void; readonly reject: (error: Error) => void }>();
  let next = 0;

  params.port.addEventListener('message', ({ data }) => {
    const pending = waiting.get(data.id);
    if (pending === undefined) return;
    waiting.delete(data.id);
    if (data.ok) pending.resolve(data.text);
    else pending.reject(new Error(data.error));
  });

  return {
    name: params.name,
    supports: params.supports ?? nllbSupports,
    translate: (text, { source, target }) =>
      new Promise((resolve, reject) => {
        next += 1;
        waiting.set(next, { resolve, reject });
        params.port.postMessage({ id: next, text, source, target });
      }),
  };
}
