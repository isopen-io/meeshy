import { openSharedTranslation, sealSharedTranslation } from '@meeshy/shared/utils/shared-translation-seal';

import { createSealHost, type SealReply, type SealRequest } from './seal-protocol';

/**
 * **LE WORKER DU SCELLEMENT PARTAGÉ** (#9899) — la colle : `self`, et le contrat
 * partagé (`sealSharedTranslation`, `openSharedTranslation`) avec son validateur
 * `zod` classique. La logique vit dans `seal-protocol.ts`. Ce Worker est construit
 * à part par Vite : son graphe de modules n'est pas celui de la page, donc le
 * noyau de `zod` que la page partage entre ses écrans n'en porte rien.
 */

type WorkerScope = {
  onmessage: ((event: MessageEvent<SealRequest>) => void) | null;
  readonly postMessage: (reply: SealReply) => void;
};

const scope = self as unknown as WorkerScope;

const host = createSealHost({ sealing: { sealSharedTranslation, openSharedTranslation }, post: (reply) => scope.postMessage(reply) });

scope.onmessage = (event) => void host.receive(event.data);
