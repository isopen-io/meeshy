/**
 * Balayage des ÉCRIVAINS des deux tables de préférences par utilisateur.
 *
 * `UserConversationPreferences` et `UserCommunityPreferences` sont par
 * UTILISATEUR, pas par appareil. Toute écriture doit donc être suivie d'une
 * diffusion sur la room personnelle, faute de quoi les autres appareils du même
 * compte restent sur un état périmé — ils tiennent leur liste avec le socket
 * pour source primaire, et rien ne les envoie relire.
 *
 * ## Ce que ce balayage mesure, et ce qu'il ne mesure pas
 *
 * Il relève les SITES D'ÉCRITURE, pas les diffusions. Il ne peut pas prouver
 * qu'un site diffuse — un émetteur peut vivre dix lignes plus bas, dans une
 * branche, ou déléguer. C'est un CLIQUET d'inventaire : il fige les écrivains
 * connus, chacun ayant été vérifié à la main, et tombe dès qu'un site nouveau
 * apparaît. Sa question au lot suivant est alors : **et celui-là, il diffuse ?**
 *
 * C'est la question qui a manqué deux fois :
 *
 * - côté CONVERSATION, les trois routes de `user-deletions.ts` écrivaient
 *   `deletedForUserAt` / `clearHistoryBefore` sans rien émettre — d'où le
 *   module écrivain unique `conversationPreferencesSync.ts` ;
 * - côté COMMUNAUTÉ, le glisser-déposer (`POST …/communities/reorder`) a
 *   persisté sans diffuser jusqu'au cycle 128, pendant que les deux autres
 *   verbes du MÊME fichier diffusaient depuis le lot F71.
 *
 * Les deux fois, le site fautif n'était pas caché : il était voisin, et il
 * n'appartenait simplement pas à la phrase du lot qui a fermé les autres.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC_ROOT = join(__dirname, '..');

const PREFERENCE_MODELS = ['userConversationPreferences', 'userCommunityPreferences'] as const;

const WRITE_METHODS = ['upsert', 'update', 'updateMany', 'create', 'createMany', 'delete', 'deleteMany'] as const;

export interface PreferenceWriteSite {
  /** Chemin relatif à `src/`, séparateurs POSIX. */
  readonly file: string;
  readonly model: (typeof PREFERENCE_MODELS)[number];
  readonly method: (typeof WRITE_METHODS)[number];
}

const isProductionFile = (relativePath: string): boolean =>
  relativePath.endsWith('.ts') &&
  !relativePath.endsWith('.d.ts') &&
  !relativePath.split('/').includes('__tests__');

function collectFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const absolute = join(dir, entry);
    const relative = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(absolute).isDirectory()) return collectFiles(absolute, relative);
    return isProductionFile(relative) ? [relative] : [];
  });
}

/**
 * Les commentaires sont dépouillés avant la recherche : sans cela le balayage
 * retrouve les commentaires des cycles précédents — qui CITENT les sites — au
 * lieu des sites eux-mêmes.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

export function sweepPreferenceWriteSites(root: string = SRC_ROOT): PreferenceWriteSite[] {
  const sites: PreferenceWriteSite[] = [];

  for (const file of collectFiles(root)) {
    const source = stripComments(readFileSync(join(root, file), 'utf8'));

    for (const model of PREFERENCE_MODELS) {
      for (const method of WRITE_METHODS) {
        const pattern = new RegExp(`\\.${model}\\s*\\.\\s*${method}\\s*\\(`, 'g');
        for (let count = source.match(pattern)?.length ?? 0; count > 0; count -= 1) {
          sites.push({ file, model, method });
        }
      }
    }
  }

  return sites.sort(
    (a, b) => a.file.localeCompare(b.file) || a.model.localeCompare(b.model) || a.method.localeCompare(b.method)
  );
}

export const formatSite = (site: PreferenceWriteSite): string =>
  `${site.file}|${site.model}|${site.method}`;
