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
 *   `kind: 'envelope'` et `kind: 'total'` sont deux réponses VIDES en
 *   production ; `kind: 'partial'` nomme les clés supprimées. Dans les trois
 *   cas, la question est la même : qui a raison, le schéma ou l'émetteur ? Elle
 *   se tranche en lisant l'émetteur, jamais le type.
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
 * **VIDE, et il l'est resté à travers #4192.**
 *
 * L'élargissement de la sonde y a fait entrer QUATRE sites d'un coup — quatre
 * défauts qui vivaient dans son angle mort, exactement comme #4139 y a vécu :
 * un schéma 2xx qui déclare ses clés à la RACINE, là où `sendSuccess` écrit
 * `{ success, data }`, si bien que fast-json-stringify supprime `data` EN BLOC
 * et que la route sert `{"success":true}`.
 *
 * Ils ont été gelés le temps d'un lot — le territoire de #4192 était la SONDE,
 * et `routes/` était édité par cinq sessions au même moment —, puis CORRIGÉS à
 * l'intégration du même lot. Ce qu'ils coûtaient :
 *
 * | site | ce que le client perdait |
 * |---|---|
 * | `POST /conversations/:id/read` | il marquait une conversation lue sans jamais savoir combien de messages |
 * | `DELETE /notifications/admin/clear-all` | un geste IRRÉVERSIBLE rendait « succès » sans dire combien de lignes il venait de supprimer |
 * | `GET /tracking-links/admin/all` | la liste d'administration arrivait VIDE, sans erreur ni journal |
 * | `GET /tracking-links/admin/:token/clicks` | idem, sur les clics |
 *
 * **La cible est VIDE, et c'est un état à défendre.** Quand une entrée
 * NOUVELLE apparaît, ne pas la geler par réflexe : ouvrir l'ÉMETTEUR, qui est
 * le seul discriminant (cycle 91 bis), et ne geler que ce qu'une raison ÉCRITE
 * justifie de laisser ouvert — pour la durée d'un lot, pas d'un trimestre.
 */
const FROZEN_MISMATCHES: readonly string[] = [];

describe('balayage — un schéma de réponse décrit la charge utile que le handler ENVOIE', () => {
  it("n'introduit aucun désaccord que l'inventaire gelé ne nomme pas", () => {
    const actual = sweepPayloadMismatches(ROUTES_DIR)
      .map((m) => `${m.file}|${m.kind}|${[...m.dropped].sort().join(',')}`)
      .sort();

    expect(actual).toEqual([...FROZEN_MISMATCHES].sort());
  });

  it('ne compte plus AUCUNE réponse totalement vidée par un jeu de clés disjoint', () => {
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
    const source = `const payload = { meta: { conversationStats: s, total: 2 }, deleted: true };`;

    expect(topLevelKeys(source, source.indexOf('{'))).toEqual(['meta', 'deleted']);
  });
});

/**
 * L'élargissement de #4192 — la charge passée par une VARIABLE.
 *
 * La limite d'origine (« un `sendSuccess(reply, maVariable)` lui échappe, et
 * c'est assumé ») a laissé passer #4139, le défaut le plus grave de la famille
 * que cette sonde garde : les trois routes du parcours SMS répondent toutes
 * `const { success: _s, ...data } = result; sendSuccess(reply, data)`. Une
 * limite écrite dans un doc-comment ne rougit jamais — d'où ces témoins.
 */
describe('balayage — la charge utile passée par une variable locale', () => {
  it('suit un `const p = { … }` composé par le handler et signale la perte TOTALE', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', properties: { user: { type: 'string' } } }
        } } } }
      }, async (request, reply) => {
        const payload = { requires2FA: true, twoFactorToken: 'tok' };
        return sendSuccess(reply, payload);
      });`;

    const [found] = scanFileForMismatches(source, 'x.ts');
    expect(found).toMatchObject({ kind: 'total', dropped: ['requires2FA', 'twoFactorToken'] });
  });

  it('suit un `const p = { … }` et nomme la seule clé supprimée', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', properties: { reactions: { type: 'array' } } }
        } } } }
      }, async (request, reply) => {
        const payload = { reactions: rows, total: rows.length };
        return sendSuccess(reply, payload);
      });`;

    const [found] = scanFileForMismatches(source, 'x.ts');
    expect(found).toMatchObject({ kind: 'partial', dropped: ['total'] });
  });

  /**
   * **Critère 2 de #4192.** `result` est un objet INCONNU : son reste peut
   * porter n'importe quelle clé, `user` comprise. Conclure à la perte totale
   * serait un faux positif sur une charge dynamique — plus cher que le trou
   * qu'on ferme. C'est déjà la règle des spreads littéraux ; elle vaut ici.
   */
  it('ne conclut JAMAIS au vide sur un reste de déstructuration (`...data` d’un objet inconnu)', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', properties: { user: { type: 'string' } } }
        } } } }
      }, async (request, reply) => {
        const { success: _s1, ...data1 } = result as any;
        return sendSuccess(reply, data1);
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  it('ne conclut pas au vide quand la variable est MUTÉE entre sa déclaration et l’envoi', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', properties: { user: { type: 'string' } } }
        } } } }
      }, async (request, reply) => {
        const payload = { requires2FA: true };
        payload.user = await loadUser();
        return sendSuccess(reply, payload);
      });`;

    const [found] = scanFileForMismatches(source, 'x.ts');
    expect(found.kind).toBe('partial');
  });

  /**
   * Le littéral qui suit dans le fichier n'est PAS la charge : chercher « le
   * premier `{` après le `=` » — la forme naïve, et celle que le dépouillement
   * des schémas emploie légitimement un étage plus haut — attrape ici l'objet
   * de journalisation. La sonde exige que la valeur COMMENCE par `{`.
   */
  it('se TAIT quand la variable vient d’un appel — elle ne résout pas ce qu’elle ne voit pas', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', properties: { user: { type: 'string' } } }
        } } } }
      }, async (request, reply) => {
        const payload = await buildPayload(request);
        request.log.info({ route: 'x' });
        return sendSuccess(reply, payload);
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  it('se TAIT quand la variable est déclarée HORS du handler', () => {
    const source = `
      const payload = { requires2FA: true };
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          data: { type: 'object', properties: { user: { type: 'string' } } }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, payload);
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });
});

/**
 * L'ENVELOPPE — la forme que #4139 portait, et que la sonde ne pouvait pas voir.
 *
 * `sendSuccess` écrit `{ success, data }`. Un schéma 2xx qui déclare `tokenId`
 * à la RACINE ne décrit pas une charge appauvrie : il en décrit une AUTRE, et
 * fast-json-stringify supprime `data` EN BLOC. La réponse part à
 * `{"success":true}` — tout le parcours de réinitialisation par SMS était coupé
 * sur les deux clients, et un code SMS était consommé pour un jeton qui
 * n'atteignait jamais l'appelant.
 *
 * Mesuré : sur le `password-reset.ts` d'AVANT le correctif a62555bb15, la sonde
 * d'avant #4192 rend `[]` et celle d'après nomme les quatre schémas fautifs.
 */
describe('balayage — un schéma 2xx qui ne déclare pas l’enveloppe `data`', () => {
  /** **Critère 5 de #4192** : le motif exact des trois routes SMS. */
  it('signale un `const {…, ...data} = result` servi sous un schéma qui déclare ses clés à la RACINE', () => {
    const source = `
      fastify.post('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          success: { type: 'boolean' },
          tokenId: { type: 'string' },
          maskedUserInfo: { type: 'object', properties: { username: { type: 'string' } } }
        } } } }
      }, async (request, reply) => {
        const { success: _s1, ...data1 } = result as any;
        return sendSuccess(reply, data1);
      });`;

    const [found] = scanFileForMismatches(source, 'x.ts');
    expect(found).toMatchObject({
      kind: 'envelope',
      declared: ['success', 'tokenId', 'maskedUserInfo'],
      dropped: ['data'],
    });
  });

  it('signale la même enveloppe sur une charge LITTÉRALE', () => {
    const source = `
      fastify.get('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          success: { type: 'boolean' },
          trackingLinks: { type: 'array' },
          total: { type: 'number' }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, { trackingLinks: rows, total: 3 });
      });`;

    const [found] = scanFileForMismatches(source, 'x.ts');
    expect(found).toMatchObject({ kind: 'envelope', dropped: ['data'] });
  });

  it('ne signale RIEN quand le schéma déclare bien `data`', () => {
    const source = `
      fastify.get('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          success: { type: 'boolean' },
          data: { type: 'object', properties: { tokenId: { type: 'string' } } }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, { tokenId: 'abc' });
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  /**
   * `sendSuccess(reply, undefined)` n'écrit aucune clé `data` sur le fil : un
   * schéma qui ne déclare que `success` y dit VRAI. Sans cette question, la
   * forme `envelope` signalait dix accusés de réception corrects pour quatre
   * vrais défauts — et un balayage qui crie plus souvent qu'il n'a raison finit
   * gelé en bloc.
   */
  it('ne signale pas un accusé de réception qui n’envoie AUCUNE charge', () => {
    const source = `
      fastify.delete('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          success: { type: 'boolean' }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, undefined, { message: 'ok' });
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  it('ne signale pas un `sendSuccess(reply, null)`', () => {
    const source = `
      fastify.delete('/x', {
        schema: { response: { 200: { type: 'object', properties: {
          success: { type: 'boolean' }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, null);
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  /**
   * `additionalProperties` non `false` laisse passer `data` : le schéma est
   * OUVERT, donc rien ne prouve une perte. Se taire y est la seule réponse
   * honnête — c'est la même règle que pour un spread.
   */
  it('se TAIT sur un schéma ouvert par `additionalProperties`', () => {
    const source = `
      fastify.get('/x', {
        schema: { response: { 200: { type: 'object', additionalProperties: true, properties: {
          success: { type: 'boolean' }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, { tokenId: 'abc' });
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  it('se TAIT sur un statut décrit par une RÉFÉRENCE de schéma', () => {
    const source = `
      fastify.get('/x', {
        schema: { response: { 200: successEnvelopeSchema } }
      }, async (request, reply) => {
        return sendSuccess(reply, { tokenId: 'abc' });
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  /**
   * Le spread porte des `properties` que la sonde ne voit pas : conclure à
   * l'absence de `data` sur la seule moitié LISIBLE du schéma serait un faux
   * positif — même règle que pour un spread dans la charge utile.
   */
  it('se TAIT sur un schéma dont les propriétés sont composées par un spread', () => {
    const source = `
      fastify.get('/x', {
        schema: { response: { 200: { ...successEnvelopeSchema, properties: {
          success: { type: 'boolean' }
        } } } }
      }, async (request, reply) => {
        return sendSuccess(reply, { tokenId: 'abc' });
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });

  it('ne regarde que les statuts 2xx — un 4xx sans `data` est la forme NORMALE', () => {
    const source = `
      fastify.get('/x', {
        schema: { response: {
          200: { type: 'object', properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { id: { type: 'string' } } }
          } },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'string' } } }
        } }
      }, async (request, reply) => {
        return sendSuccess(reply, { id });
      });`;

    expect(scanFileForMismatches(source, 'x.ts')).toEqual([]);
  });
});
