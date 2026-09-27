import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * **UN LIEN PARTAGÉ NE PART JAMAIS SUR L'ORIGINE DE LA COQUE** (#8385).
 *
 * Dans la coque Capacitor, `location.origin` vaut `https://localhost` : un
 * lien composé dessus ne s'ouvre chez personne. `webOriginOf(apiConfig.base,
 * location.origin)` (#6361) rend l'origine PUBLIQUE, déduite de la passerelle,
 * et ne garde celle de la page qu'en développement.
 *
 * Le lien de parrainage (« Inviter des amis », #6707) lisait l'origine brute :
 * la coque partageait `https://localhost/signup/affiliate/<token>` pendant que
 * le navigateur partageait `https://meeshy.me/…`.
 *
 * Ce témoin lit le CODE : toute lecture de `location.origin` hors de
 * `web-origin.ts` passe par `webOriginOf(` sur la même ligne. Une liste
 * `origins: [webOriginOf(…), location.origin]` (reconnaître un lien interne)
 * reste permise : elle ne compose rien.
 */

const SRC = fileURLToPath(new URL('.', import.meta.url));

const sources = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

const rawOriginReads = (): readonly string[] =>
  sources(SRC)
    .filter((path) => !path.endsWith('/lib/links/web-origin.ts'))
    .flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, at: `${relative(SRC, path)}:${index + 1}` }))
        .filter(({ line }) => /location\.origin/.test(line) && !line.includes('webOriginOf(')),
    )
    .map(({ at }) => at);

describe("l'origine d'un lien partagé", () => {
  test("aucune lecture de location.origin n'échappe à webOriginOf", () => {
    expect(rawOriginReads()).toEqual([]);
  });
});
