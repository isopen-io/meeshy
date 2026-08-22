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
 * Les sites nus qui subsistent, gelés au cycle 87 bis, après la consolidation de
 * `routes/communities.ts` en coquille (cycle 86-ter), la réparation des trois
 * listes d'administration (cycle 87), celle des cinq sites de PRÉSENCE
 * (cycle 88) et celle des deux transports REST d'édition de message plus de la
 * création de lien de partage (cycle 88 bis).
 *
 * Le cycle 88 a montré que cette famille a TROIS formes, pas une, et que le
 * balayage ne peut en distinguer aucune — il ne voit que le schéma, jamais la
 * charge d'en face. Avant de réparer un site, établir laquelle il a :
 *
 * 1. **La clé déclarée existe dans la charge** ⇒ ce champ sort `{}`, le reste
 *    survit. C'est la forme que le cycle 86 a balayée.
 * 2. **La clé déclarée n'existe pas dans la charge** ⇒ le parent n'a plus
 *    aucune propriété qui matche, et sort `{}` ENTIER. Les deux entrées
 *    `messages-advanced.ts|message|200` et `sharing.ts|link|200` étaient de
 *    cette espèce — `data` était vide (cycle 88 bis).
 * 3. **Le schéma décrit la mauvaise ENVELOPPE** ⇒ toutes ses déclarations sont
 *    inertes et la charge traverse entière. Le balayage rend alors un FAUX
 *    POSITIF — et c'est le cas le plus dangereux, parce qu'un champ qu'on croit
 *    vidé peut être en fuite active (cycle 88, `messages.ts`).
 *
 * La question qui les départage : **que passe le gestionnaire à `sendSuccess`,
 * et à quel niveau le schéma prétend-il le décrire ?**
 *
 * **Les onze `400` ont été retirés au cycle 89** : c'étaient des `details` /
 * `errors` déclarés en TABLEAU au premier niveau, alors que l'enveloppe
 * (`utils/response.ts`) ÉTALE `details` à la racine et ne porte de tableau que
 * sous `violations`. Ces schémas écrits à la main supprimaient en prime
 * `error`, `message` ou `code` selon les cas. Tous remplacés par
 * `validationErrorResponseSchema`, qui déclare les cinq champs réels. Les `200` / `202` sont
 * la vraie dette — chacun vide une charge utile SERVIE. Inventaire raisonné et
 * priorisé : `tasks/realtime-sync-audit-2026-08-22-cycle86-bis.md` §6 et
 * `…-cycle87.md` §2.
 *
 * **Les sites de PRÉSENCE sont tous traités (cycle 88).** Cinq lignes ont donc
 * quitté cet inventaire : `communities/core.ts|user`, `magic-link.ts|user` ×2 et
 * `magic-link.ts|session` ×2 — schéma déclaré ET gate posé dans le même lot,
 * selon la règle du cycle 84 bis.
 *
 * **Les quatre `analysis` de `voice-analysis.ts` sont partis au cycle 90**, avec
 * la panne qu'ils recouvraient : le traducteur appelait deux méthodes
 * inexistantes (`analyze(analysis_types=…)`, `compare_voices`), si bien que ces
 * routes ne rendaient jamais 200. Réparer le schéma seul aurait publié une
 * charge utile dont chaque feuille était mal nommée, et des métriques de qualité
 * figées à 0,45 — l'émetteur et le contrat ne partageaient aucune clé de
 * feuille. Un normaliseur les réconcilie à la frontière
 * (`services/voice-analysis-normalize.ts`).
 *
 * `messages.ts|sender|200` RESTE, et ce n'est pas un oubli. Le balayage le
 * signale comme nu, mais la déclaration y est INERTE : le schéma de cette route
 * décrit le message quand `sendSuccess` répond `{ success, data }`, si bien que
 * rien n'y matche et que la charge utile traverse entière. Ce site portait donc
 * une fuite de présence ACTIVE — fermée au cycle 88 par un gate à la source.
 * Aligner son schéma sur l'enveloppe est un lot en soi : déclarer partiellement
 * ce qui passait entier TRONQUERAIT. Tant que ce n'est pas fait, la ligne reste
 * ici — elle nomme une dette de FORME, plus une fuite.
 */
const FROZEN_INVENTORY: readonly string[] = [
  'calls.ts|details|400',
  'links/admin.ts|creator|200',
  'messages.ts|sender|200',
  'users/profile.ts|permissions|200',
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

  it("ne compte plus aucun site nu dans les transports d'édition ni le partage réparés au cycle 88 bis", () => {
    const repaired = sweepRoutes(ROUTES_DIR).filter(
      (s) =>
        s.file === 'conversations/messages-advanced.ts' ||
        s.file === 'conversations/sharing.ts'
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
