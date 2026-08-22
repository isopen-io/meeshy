/**
 * Le cliquet du balayage `{ type: 'object' }`.
 *
 * Le cycle 84 bis a trouvé le défaut, le cycle 86 l'a balayé (38 sites) et a
 * conclu que « la règle vaut d'être outillée plutôt que mémorisée » — mais son
 * outil est resté dans le journal. Deux cycles plus tard, le cycle 87 en
 * trouvait trois exemplaires de plus, dont un dans un fichier qui portait déjà
 * la forme JUSTE trois cents lignes plus loin.
 *
 * Ce témoin installe l'outil dans le dépôt et gèle l'inventaire restant. Il ne
 * corrige rien : il empêche la famille de GRANDIR, et rend visible chaque
 * réparation.
 *
 * Quand ce témoin tombe :
 *
 * - **une entrée EN TROP** ⇒ un nouveau `{ type: 'object' }` nu vient d'entrer
 *   dans un schéma de réponse. Ce n'est pas un choix : déclarer `properties`
 *   (objet structuré) ou `additionalProperties` (carte à clés inconnues).
 *   Le silence n'est jamais la réponse.
 * - **une entrée EN MOINS** ⇒ un site a été réparé. Retirer sa ligne de
 *   `FROZEN_INVENTORY` fait partie du correctif.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { scanFile, stripComments, sweepRoutes } from './response-schema-sweep';

const ROUTES_DIR = join(__dirname, '..');

/**
 * Les sites nus qui subsistent, gelés au cycle 87.
 *
 * Les `400` sont des `details` / `errors` de schémas d'ERREUR : ils dégradent
 * un diagnostic, ils ne cassent aucun décodage client. Les `200` / `202` sont
 * la vraie dette — chacun vide une charge utile SERVIE. Inventaire raisonné et
 * priorisé : `tasks/realtime-sync-audit-2026-08-22-cycle86-bis.md` §6 et
 * `…-cycle87.md` §2.
 *
 * Les quatre `user:` / `sender:` touchent la présence : les traiter comme le
 * cycle 84 bis a traité le sien — déclarer le schéma ET poser le gate dans le
 * MÊME lot, sans quoi la réparation publie la fuite que la panne retenait.
 */
const FROZEN_INVENTORY: readonly string[] = [
  'admin/roles.ts|items|400',
  'admin/roles.ts|items|400',
  'anonymous.ts|items|400',
  'anonymous.ts|items|400',
  'calls.ts|details|400',
  'communities.ts|user|200',
  'communities/core.ts|user|200',
  'conversations/messages-advanced.ts|message|200',
  'conversations/messages-advanced.ts|message|200',
  'conversations/sharing.ts|link|200',
  'links/admin.ts|creator|200',
  'magic-link.ts|session|200',
  'magic-link.ts|session|200',
  'magic-link.ts|user|200',
  'magic-link.ts|user|200',
  'messages.ts|sender|200',
  'signal-protocol.ts|items|400',
  'signal-protocol.ts|items|400',
  'users/profile.ts|items|400',
  'users/profile.ts|items|400',
  'users/profile.ts|items|400',
  'users/profile.ts|items|400',
  'users/profile.ts|items|400',
  'users/profile.ts|permissions|200',
  'voice-analysis.ts|analysis|200',
  'voice-analysis.ts|analysis|200',
  'voice-analysis.ts|analysis|200',
  'voice-analysis.ts|analysis|200',
  'voice/translation.ts|attachment|200',
  'voice/translation.ts|attachment|202',
  'voice/translation.ts|transcription|200',
];

describe('balayage — un schéma de réponse ne déclare jamais un objet NU', () => {
  it("n'introduit aucun site que l'inventaire gelé ne nomme pas", () => {
    const actual = sweepRoutes(ROUTES_DIR)
      .map((s) => `${s.file}|${s.field}|${s.statusCode}`)
      .sort();

    expect(actual).toEqual([...FROZEN_INVENTORY].sort());
  });

  it('ne compte plus aucun site nu dans les trois listes réparées au cycle 87', () => {
    const repaired = sweepRoutes(ROUTES_DIR).filter(
      (s) => s.file === 'admin/content.ts' || s.file === 'admin/posts.ts'
    );

    expect(repaired).toEqual([]);
  });
});

describe('balayage — les trois discriminations qu’un grep ne fait pas', () => {
  it('ignore un objet qui DÉCLARE ses clés', () => {
    const source = `
      fastify.get('/x', { schema: { response: { 200: {
        type: 'object', properties: { id: { type: 'string' } }
      } } } });`;

    expect(scanFile(source, 'x.ts')).toEqual([]);
  });

  it("accepte `additionalProperties` comme déclaration d'une carte à clés inconnues", () => {
    const source = `
      fastify.get('/x', { schema: { response: { 200: {
        type: 'object', additionalProperties: { type: 'number' }
      } } } });`;

    expect(scanFile(source, 'x.ts')).toEqual([]);
  });

  it('ignore un objet nu sous `body` — AJV valide, il ne sérialise pas', () => {
    const source = `
      fastify.post('/x', { schema: { body: {
        type: 'object'
      } } });`;

    expect(scanFile(source, 'x.ts')).toEqual([]);
  });

  it('signale un objet nu sous `response`', () => {
    const source = `
      fastify.get('/x', { schema: { response: { 200: {
        type: 'object', properties: { creator: { type: 'object' } }
      } } } });`;

    const [site] = scanFile(source, 'x.ts');
    expect(site).toMatchObject({ file: 'x.ts', field: 'creator', statusCode: '200' });
  });

  it('ne retrouve PAS les commentaires des cycles précédents', () => {
    const source = `
      fastify.get('/x', { schema: { response: { 200: {
        // Défaut du cycle 84 : creator: { type: 'object' } vidait la réponse.
        type: 'object', properties: { creator: { type: 'object', properties: { id: { type: 'string' } } } }
      } } } });`;

    expect(scanFile(source, 'x.ts')).toEqual([]);
  });

  it('dépouille les commentaires en PRÉSERVANT les numéros de ligne', () => {
    const stripped = stripComments("const a = 1;\n// commentaire\nconst b = 2;\n");

    expect(stripped.split('\n')).toHaveLength(4);
    expect(stripped).not.toContain('commentaire');
    expect(stripped).toContain('const b = 2;');
  });

  it("ne dépouille pas ce qui ressemble à un commentaire DANS une chaîne", () => {
    const stripped = stripComments("const url = 'https://meeshy.me/x';");

    expect(stripped).toContain('https://meeshy.me/x');
  });
});
