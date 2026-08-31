/**
 * La version de politique de consentement a UN site, des deux côtés (#4487).
 *
 * `PUT /me/consents/{purpose}` exige que le client cite la version en vigueur
 * et répond **409** sur toute autre valeur. Le régime est juste ; ce qui ne
 * l'était pas, c'est que les deux côtés tenaient la valeur séparément — un
 * `process.env … ?? '2026-08-30'` côté passerelle, un `'2026-08-30'` écrit en
 * dur côté web.
 *
 * Tout déploiement posant l'override transformait alors **chaque** écriture
 * unifiée du web en 409, avalé par un `console.warn` : l'utilisateur voyait un
 * succès pendant que le miroir n'était jamais écrit. Et aucun témoin ne pouvait
 * l'attraper — celui du web épinglait `expect.any(String)`, jamais la valeur.
 *
 * > Une valeur qui traverse une frontière et n'a pas de site unique finit par
 * > diverger. Ce n'est pas une question de discipline : les deux côtés ne sont
 * > pas relus le même jour, et rien ne les compare.
 *
 * Cette garde interdit le retour de la recopie. Elle ne vérifie pas que les
 * deux valeurs sont ÉGALES — elles le sont par construction depuis qu'il n'y en
 * a qu'une ; elle vérifie qu'on n'en réintroduit pas une seconde.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const RACINE = join(__dirname, '../../../../..');

/** Une date ISO courte écrite en dur — la forme qu'a prise la recopie. */
const VERSION_EN_DUR = /['"`]\d{4}-\d{2}-\d{2}['"`]/;

/** Les fichiers qui PARLENT de consentement hors du site unique. */
const SITES = [
  'apps/web/hooks/use-voice-profile-management.ts',
  'services/gateway/src/routes/me/consents.ts',
] as const;

/** Le site UNIQUE, seul autorisé à porter la valeur. */
const SITE_UNIQUE = 'packages/shared/types/consents.ts';

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('La version de politique de consentement a UN site (#4487)', () => {
  it('le site unique la porte — sinon la garde ci-dessous ne garderait rien', () => {
    // Témoin de balayage : sans lui, un chemin erroné rendrait « aucune date en
    // dur nulle part » et la garde affirmerait le contraire de ce qu'elle
    // mesure.
    const source = readFileSync(join(RACINE, SITE_UNIQUE), 'utf8');
    expect(VERSION_EN_DUR.test(sansCommentaires(source))).toBe(true);
  });

  it.each(SITES)('%s ne réintroduit AUCUNE version écrite en dur', (relatif) => {
    const source = sansCommentaires(readFileSync(join(RACINE, relatif), 'utf8'));
    expect(VERSION_EN_DUR.test(source)).toBe(false);
  });
});
