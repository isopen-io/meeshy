import type { SharedTranslationEnvelope, SharedTranslationInner } from '@meeshy/shared/types/shared-translation';

import type { SealPort } from './share';
import type { OpenPort } from './shared-translations';

type SealParams = Parameters<SealPort>[0];
type OpenParams = Parameters<OpenPort>[0];

export type SealRequest =
  | { readonly id: number; readonly op: 'seal'; readonly params: SealParams }
  | { readonly id: number; readonly op: 'open'; readonly params: OpenParams };

export type SealReply =
  | { readonly id: number; readonly ok: true; readonly op: 'seal'; readonly envelope: SharedTranslationEnvelope }
  | { readonly id: number; readonly ok: true; readonly op: 'open'; readonly inner: SharedTranslationInner | null }
  | { readonly id: number; readonly ok: false; readonly error: string };

/** Les deux fonctions du contrat partagé que le Worker exécute — le module `@meeshy/shared/utils/shared-translation-seal` les porte telles quelles. */
export type SealingModule = {
  readonly sealSharedTranslation: (params: SealParams) => Promise<SharedTranslationEnvelope>;
  readonly openSharedTranslation: (params: OpenParams) => Promise<SharedTranslationInner | null>;
};

/**
 * **LE CÔTÉ WORKER DU SCELLEMENT** (#9899) — toute la logique, testable sans
 * thread ; `shared-translation-seal-worker.ts` n'en est que la colle (motif de
 * `worker-protocol.ts`).
 *
 * Le contrat partagé valide ses entrées avec `zod` classique, ~10 Ko gzip de plus
 * que le `zod/mini` du reste de l'application — et il en partage le noyau : rangé
 * dans un chunk de la page, il alourdissait le chunk `zod` de 64 écrans (connexion,
 * fil, profil, appels…), alors qu'un lecteur ne scelle ou n'ouvre qu'à de rares
 * moments. Dans son propre Worker, il a son propre graphe de modules : la page
 * n'en paie rien, et le contrat partagé reste LE code qui scelle et qui ouvre.
 */
export function createSealHost(params: { readonly sealing: SealingModule; readonly post: (reply: SealReply) => void }) {
  const { sealing, post } = params;
  return {
    receive: async (request: SealRequest): Promise<void> => {
      try {
        post(
          request.op === 'seal'
            ? { id: request.id, ok: true, op: 'seal', envelope: await sealing.sealSharedTranslation(request.params) }
            : { id: request.id, ok: true, op: 'open', inner: await sealing.openSharedTranslation(request.params) },
        );
      } catch (error) {
        post({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}

export type SealWorkerPort = {
  postMessage(request: SealRequest): void;
  addEventListener(type: 'message', listener: (event: { readonly data: SealReply }) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: unknown) => void): void;
};

export const SEAL_TIMEOUT_MS = 20_000;

type Waiting = {
  readonly resolve: (reply: Extract<SealReply, { readonly ok: true }>) => void;
  readonly reject: (error: Error) => void;
};

/**
 * **LE CÔTÉ PAGE** — un `SealPort` et un `OpenPort` dont le calcul vit dans le
 * Worker. Un Worker qui échoue (script introuvable, refusé, mort) rejette ce qui
 * attend et tout ce qui suivra, sans rien poster dans le vide ; un Worker muet
 * rend la main au bout de {@link SEAL_TIMEOUT_MS}. Les appelants (`share.ts`,
 * `shared-translations.ts`) traitent ces rejets comme n'importe quelle panne : le
 * partage et la lecture vivent en marge de l'affichage et ne le bloquent jamais.
 */
export function createSealClient(params: { readonly port: SealWorkerPort; readonly timeoutMs?: number }): {
  readonly seal: SealPort;
  readonly open: OpenPort;
} {
  const { port } = params;
  const timeoutMs = params.timeoutMs ?? SEAL_TIMEOUT_MS;
  const waiting = new Map<number, Waiting>();
  let next = 0;
  let broken: Error | null = null;

  const fail = (error: Error): void => {
    broken = error;
    const pending = [...waiting.values()];
    waiting.clear();
    for (const entry of pending) entry.reject(error);
  };

  port.addEventListener('message', ({ data }) => {
    const entry = waiting.get(data.id);
    if (entry === undefined) return;
    waiting.delete(data.id);
    if (data.ok) entry.resolve(data);
    else entry.reject(new Error(data.error));
  });
  port.addEventListener('error', () => fail(new Error('le Worker du scellement a échoué')));
  port.addEventListener('messageerror', () => fail(new Error('le Worker du scellement a rendu une réponse illisible')));

  const roundTrip = (build: (id: number) => SealRequest): Promise<Extract<SealReply, { readonly ok: true }>> =>
    new Promise((resolve, reject) => {
      if (broken !== null) {
        reject(broken);
        return;
      }
      next += 1;
      const id = next;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`le Worker du scellement n'a pas répondu dans le délai (${timeoutMs} ms)`));
      }, timeoutMs);
      waiting.set(id, {
        resolve: (reply) => {
          clearTimeout(timer);
          resolve(reply);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      port.postMessage(build(id));
    });

  return {
    seal: async (sealParams) => {
      const reply = await roundTrip((id) => ({ id, op: 'seal', params: sealParams }));
      if (reply.op !== 'seal') throw new Error('réponse inattendue du Worker du scellement');
      return reply.envelope;
    },
    open: async (openParams) => {
      const reply = await roundTrip((id) => ({ id, op: 'open', params: openParams }));
      if (reply.op !== 'open') throw new Error('réponse inattendue du Worker du scellement');
      return reply.inner;
    },
  };
}

export type SealClient = ReturnType<typeof createSealClient>;
