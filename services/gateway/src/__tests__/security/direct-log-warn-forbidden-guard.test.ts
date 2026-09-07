/**
 * Aucun site n'appelle `.log.warn(` directement — jumelle de
 * `direct-log-error-forbidden-guard.test.ts` (#3617), pour le niveau WARN (#5415).
 *
 * `server.ts` construit Fastify avec `logger: false` : `fastify.log` (et
 * `request.log`, le même objet) est le no-op d'`abstract-logging` — ses
 * méthodes existent, ne rejettent pas, et n'écrivent RIEN. `logWarn()`
 * (`utils/logger.ts`) le sait et écrit TOUJOURS par son propre `logger`
 * console, en plus de servir le logger reçu quand il sait émettre — mais
 * cette garantie ne vaut que pour les appelants qui PASSENT PAR ELLE.
 *
 * `logWarn()` portait EXACTEMENT le même défaut que `logError()` avant #3617,
 * jamais corrigé pour ce niveau : elle n'appelait que le PARAMÈTRE `logger`,
 * jamais le singleton du module. 30 sites du dépôt, sur 18 fichiers,
 * appelaient `fastify.log.warn({ err }, 'message')` ou
 * `request.log.warn(...)` DIRECTEMENT — l'idiome Pino usuel, et un no-op
 * silencieux sous cette configuration précise. Un avertissement qui devrait
 * alerter (échec non bloquant, dégradation silencieuse tolérée) ne laissait
 * alors AUCUNE trace en production.
 *
 * Cette garde interdit la FORME, pas seulement les sites trouvés :
 * `.log.warn(` en dehors de `utils/logger.ts`, où vit le seul appel légitime
 * (`console.warn` par `MeeshyLogger.warn`, qui n'a pas cette forme). Un
 * futur appelant qui écrit `fastify.log.warn(...)` ou `request.log.warn(...)`
 * la fait tomber — la réparation est `logWarn(logger, message, error)`,
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

/** `<quelque chose>.log.warn(` — la forme qui atteint le no-op sous `logger: false`. */
const APPEL_DIRECT = /\.log\.warn\(/;

function appelsDirects(texte: string): Array<{ ligne: string; numero: number }> {
  return lignesDeCode(texte).filter(({ ligne }) => APPEL_DIRECT.test(ligne));
}

describe('Aucun `.log.warn(` direct — logWarn() est le seul site qui écrit réellement en prod', () => {
  it('le balayage LIT bien l’arbre du service — sinon il serait vert à vide', () => {
    const fichiers = fichiersTs(SRC);
    expect(fichiers.length).toBeGreaterThan(200);
    // Et il SAIT reconnaître la forme fautive, sous ses deux receveurs.
    expect(appelsDirects("fastify.log.warn({ err }, 'boom');")).toHaveLength(1);
    expect(appelsDirects("request.log.warn({ err }, 'boom');")).toHaveLength(1);
    // La forme correcte ne le fait pas tomber.
    expect(appelsDirects("logWarn(fastify.log, 'boom', error);")).toHaveLength(0);
    expect(appelsDirects("fastify.log.info('ok');")).toHaveLength(0);
    expect(appelsDirects("fastify.log.error('ok');")).toHaveLength(0);
  });

  it('aucun fichier de production n’appelle `.log.warn(` directement', () => {
    const fautifs = fichiersTs(SRC).flatMap((f) =>
      appelsDirects(fs.readFileSync(f, 'utf8')).map(
        ({ numero, ligne }) => `${path.relative(SRC, f)}:${numero}  ${ligne}`
      )
    );

    expect(fautifs).toEqual([]);
  });
});
