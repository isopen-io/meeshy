import { createSealClient, type SealClient } from './seal-protocol';
import type { SealPort } from './share';
import type { OpenPort } from './shared-translations';

/** Le Worker du scellement — son script est celui que Vite construit à part (`shared-translation-seal-worker.ts`). */
export const openSealWorker = (): Worker =>
  new Worker(new URL('./shared-translation-seal-worker.ts', import.meta.url), { type: 'module', name: 'meeshy-shared-translation-seal' });

let client: SealClient | null = null;

function sealClient(): SealClient {
  if (client !== null) return client;
  if (typeof Worker === 'undefined') throw new Error('pas de Worker : rien ne se scelle ni ne s’ouvre ici');
  client = createSealClient({ port: openSealWorker() });
  return client;
}

/**
 * **LE SEUL SITE QUI ATTEINT LE SCELLEMENT PARTAGÉ** (#9899) — par un Worker,
 * créé à la première enveloppe à sceller ou à ouvrir. Le contrat partagé
 * (`@meeshy/shared/utils/shared-translation-seal`) valide ses entrées avec `zod`
 * « classique » : ~18 Ko gzip qui n'ont rien à faire dans la page — ni dans le
 * socle, ni dans le chunk du fil, ni dans le noyau de `zod` que partagent soixante
 * écrans — et que ne paie ni le lecteur sans partage à lire, ni celui dont aucune
 * traduction ne part. L'envoi (`share.ts`) et la lecture (`shared-translations.ts`)
 * reçoivent ce port ; aucun des deux n'importe le contrat. Sans Worker (rendu
 * serveur, navigateur sans Worker de module), le port rejette : le partage et la
 * lecture sont des marges de l'affichage, jamais son chemin.
 */
export const sealPort: SealPort = async (params) => sealClient().seal(params);

export const openPort: OpenPort = async (params) => sealClient().open(params);
