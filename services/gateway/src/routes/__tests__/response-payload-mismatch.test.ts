/**
 * Le cliquet du balayage « le schéma décrit-il la charge utile ENVOYÉE ? ».
 *
 * Frère du balayage des objets nus, et né de lui : en réparant les dix sites
 * nus du cycle 91, trois défauts BIEN FORMÉS sont apparus — des schémas dont
 * chaque propriété est déclarée dans les règles, mais qui décrivent une autre
 * charge utile que celle du handler. fast-json-stringify supprimant tout champ
 * non déclaré, ces trois-là vidaient une réponse ENTIÈRE sans qu'aucun outil
 * existant puisse le voir.
 *
 * L'outil de la famille précédente ne pouvait PAS les trouver : il cherche
 * l'absence de `properties`, et ces schémas en ont.
 *
 * Quand ce témoin tombe :
 *
 * - **une entrée EN TROP** ⇒ un handler et son schéma viennent de diverger.
 *   `kind: 'total'` est une réponse VIDE en production ; `kind: 'partial'`
 *   nomme les clés supprimées. Dans les deux cas, la question est la même :
 *   qui a raison, le schéma ou l'émetteur ? Elle se tranche en lisant
 *   l'émetteur, jamais le type.
 * - **une entrée EN MOINS** ⇒ un site réparé ; retirer sa ligne fait partie du
 *   correctif.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { scanFileForMismatches, sweepPayloadMismatches, topLevelKeys } from './response-payload-mismatch';

const ROUTES_DIR = join(__dirname, '..');

/**
 * **VIDE — et c'est un état à défendre, pas un état atteint.**
 *
 * Le dernier désaccord était `POST /conversations/:id/invite`, qui renvoyait
 * `member` quand son schéma déclarait `membership` : le profil du nouvel
 * adhérent n'atteignait pas le fil. Il est resté gelé ici DÉLIBÉRÉMENT le temps
 * d'un cycle, parce que l'aligner sans poser le gate `resolvePrefsOnly` dans le
 * MÊME lot aurait publié la présence de l'invité (règle du cycle 84 : « quand on
 * répare ce qui rendait une donnée invisible, on pose dans le même lot la règle
 * qui décide si elle a le droit d'être vue »).
 *
 * Le lot est fait au cycle 92 bis : les deux routes de MUTATION de participant
 * passent par `serializeConversationParticipant`, qui exige qu'on lui donne la
 * visibilité de présence.
 *
 * **Quand ce témoin tombe :** un nouveau site vient d'être écrit dont le schéma
 * déclare des clés que son handler n'envoie pas. Ne pas le geler ici par
 * réflexe — ouvrir l'ÉMETTEUR, qui est le seul discriminant (cycle 91 bis §10),
 * et ne geler que ce qu'une raison écrite justifie de laisser ouvert.
 */
const FROZEN_MISMATCHES: readonly string[] = [];

describe('balayage — un schéma de réponse décrit la charge utile que le handler ENVOIE', () => {
  it("n'introduit aucun désaccord que l'inventaire gelé ne nomme pas", () => {
    const actual = sweepPayloadMismatches(ROUTES_DIR)
      .map((m) => `${m.file}|${m.kind}|${[...m.dropped].sort().join(',')}`)
      .sort();

    expect(actual).toEqual([...FROZEN_MISMATCHES].sort());
  });

  it('ne compte plus AUCUNE réponse totalement vidée', () => {
    const emptied = sweepPayloadMismatches(ROUTES_DIR).filter((m) => m.kind === 'total');

    expect(emptied).toEqual([]);
  });
});

describe('balayage — ce que la détection sait discriminer', () => {
  it('signale une réponse VIDÉE : aucune clé envoyée n’est déclarée', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          success: { type: 'boolean' },
          data: { type: 'object', properties: { user: { type: 'string' } } }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, { requires2FA: true, twoFactorToken: 'tok' });
      });`;

    const [found] = scanFileForMismatches(source, 'x.ts');
    expect(found).toMatchObject({ kind: 'total', dropped: ['requires2FA', 'twoFactorToken'] });
  });

  it('signale une perte PARTIELLE en nommant les seules clés supprimées', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', properties: { reactions: { type: 'array' } } }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, { reactions: rows, total: rows.length });
      });`;

    const [found] = scanFileForMismatches(source, 'x.ts');
    expect(found).toMatchObject({ kind: 'partial', dropped: ['total'] });
  });

  it('ne signale RIEN quand le schéma déclare tout ce qui part', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', properties: {
            messageId: { type: 'string' }, deleted: { type: 'boolean' }
          } }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, { messageId, deleted: true });
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  /**
   * Un `...spread` peut apporter les clés déclarées : conclure à la perte
   * TOTALE serait faux. C'est exactement la forme des deux transports
   * d'édition (`{...updatedMessage, conversationId, translations}`).
   */
  it('ne conclut jamais au vide quand la charge utile porte un spread', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', properties: { id: { type: 'string' } } }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, { ...message, meta: stats });
      });`;

    const [found] = scanFileForMismatches(source, 'x.ts');
    expect(found.kind).toBe('partial');
    expect(found.dropped).toEqual(['meta']);
  });

  it('ignore un schéma dont le bloc `data` ne déclare aucune propriété', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', additionalProperties: true }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, { anything: 1 });
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  it('ne retrouve pas un `sendSuccess` cité dans un COMMENTAIRE', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', properties: { id: { type: 'string' } } }
        } } } }
      }, async (request, reply) => {
        // Avant le cycle 91 : sendSuccess(reply, { disparu: true })
        return sendSuccess(reply, { id });
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  it('lit la forme abrégée `{ userId, role }` comme deux clés', () => {
    const source = `const payload = { userId, role, participant: p };`;

    expect(topLevelKeys(source, source.indexOf('{'))).toEqual(['userId', 'role', 'participant']);
  });

  it('ne prend pas les clés d’un objet IMBRIQUÉ pour des clés de premier niveau', () => {
    const source = `const payload = { meta: { conversationStats: s }, deleted: true };`;

    expect(topLevelKeys(source, source.indexOf('{'))).toEqual(['meta', 'deleted']);
  });
});
