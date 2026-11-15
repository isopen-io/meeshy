/**
 * Aucun site n'appelle `.log.error(` directement — l'ANCIEN motif de #3617.
 *
 * `server.ts` construit Fastify avec `logger: false` : `fastify.log` (et
 * `request.log`, le même objet) est le no-op d'`abstract-logging` — ses
 * méthodes existent, ne rejettent pas, et n'écrivent RIEN. `logError()`
 * (`utils/logger.ts`) le sait et écrit TOUJOURS par son propre `logger`
 * console, en plus de servir le logger reçu quand il sait émettre — mais
 * cette garantie ne vaut que pour les appelants qui PASSENT PAR ELLE.
 *
 * #3617 a fermé les 166 sites qui appelaient `logError(fastify.log, …)` avec
 * un `logError` alors muet. Le balayage qui a suivi a trouvé une SECONDE
 * forme du même défaut, invisible au premier correctif parce qu'elle ne
 * l'appelle pas du tout : 96 sites, sur 24 fichiers, appelaient
 * `fastify.log.error({ error }, 'message')` ou `request.log.error(...)`
 * DIRECTEMENT — l'idiome Pino usuel, et un no-op silencieux sous cette
 * configuration précise. Une erreur de route ne laissait alors AUCUNE trace
 * en production, exactement le symptôme que #3617 visait, par un chemin que
 * son critère de fin («garde de source interdisant l'ancien motif») n'avait
 * pas encore fermé.
 *
 * Cette garde interdit la FORME, pas seulement les 96 sites trouvés :
 * `.log.error(` en dehors de `utils/logger.ts`, où vit le seul appel légitime
 * (`console.error` par `MeeshyLogger.error`, qui n'a pas cette forme). Un
 * futur appelant qui écrit `fastify.log.error(...)` ou `request.log.error(...)`
 * la fait tomber — la réparation est `logError(logger, message, error)`,
 * jamais une ligne ajoutée à un inventaire : il n'y a pas d'appel direct
 * légitime à porter.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');

/** Le seul fichier autorisé à écrire un logger — il ne porte pas la forme interdite lui-même. */
const FICHIER_AUTORISE = path.join(SRC, 'utils', 'logger.ts');

function fichiersTs(racine: string): string[] {
  const sortie: string[] = [];
  for (const entree of fs.readdirSync(racine, { withFileTypes: true })) {
    const complet = path.join(racine, entree.name);
    if (entree.isDirectory()) {
      if (entree.name !== '__tests__') sortie.push(...fichiersTs(complet));
    } else if (entree.name.endsWith('.ts') && complet !== FICHIER_AUTORISE) {
      sortie.push(complet);
    }
  }
  return sortie;
}

function lignesDeCode(texte: string): Array<{ ligne: string; numero: number }> {
  return texte
    .split('\n')
    .map((ligne, i) => ({ ligne: ligne.trim(), numero: i + 1 }))
    .filter(({ ligne }) => !ligne.startsWith('//') && !ligne.startsWith('*') && !ligne.startsWith('/*'));
}

/** `<quelque chose>.log.error(` — la forme qui atteint le no-op sous `logger: false`. */
const APPEL_DIRECT = /\.log\.error\(/;

function appelsDirects(texte: string): Array<{ ligne: string; numero: number }> {
  return lignesDeCode(texte).filter(({ ligne }) => APPEL_DIRECT.test(ligne));
}

describe('Aucun `.log.error(` direct — logError() est le seul site qui écrit réellement en prod', () => {
  it('le balayage LIT bien l’arbre du service — sinon il serait vert à vide', () => {
    const fichiers = fichiersTs(SRC);
    expect(fichiers.length).toBeGreaterThan(200);
    // Et il SAIT reconnaître la forme fautive, sous ses deux receveurs.
    expect(appelsDirects("fastify.log.error({ error }, 'boom');")).toHaveLength(1);
    expect(appelsDirects("request.log.error({ err }, 'boom');")).toHaveLength(1);
    // La forme correcte ne le fait pas tomber.
    expect(appelsDirects("logError(fastify.log, 'boom', error);")).toHaveLength(0);
    expect(appelsDirects("fastify.log.info('ok');")).toHaveLength(0);
    expect(appelsDirects("fastify.log.warn('ok');")).toHaveLength(0);
  });

  it('aucun fichier de production n’appelle `.log.error(` directement', () => {
    const fautifs = fichiersTs(SRC).flatMap((f) =>
      appelsDirects(fs.readFileSync(f, 'utf8')).map(
        ({ numero, ligne }) => `${path.relative(SRC, f)}:${numero}  ${ligne}`
      )
    );

    expect(fautifs).toEqual([]);
  });
});
