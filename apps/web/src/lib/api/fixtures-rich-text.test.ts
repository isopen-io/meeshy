import { describe, expect, test } from 'bun:test';

import { loadConversation, loadConversationsPage, PAGE_SIZE } from './conversations';
import { CONVERSATIONS } from './fixtures';
import { RICH_TEXT_CONVERSATION_ID } from './fixtures-rich-text';
import { createHttpTransport } from './http';

/**
 * **LE CORPUS DE DÉMONSTRATION NE GROSSIT PAS LA LISTE** (#7032, revue #7033).
 *
 * `CONVERSATIONS` est un INVENTAIRE PARTAGÉ : sa TAILLE est lue par des gates
 * qui n'ont rien à voir avec le texte enrichi. Le salon « Texte enrichi » y
 * était entré, et son `lastMessageAt` (`threadMoment(2)`, ≈ 2 min) en faisait
 * le plus récent de tout le corpus — donc la 46ᵉ rangée servie. Trois comptes
 * mesurés ont bougé d'un cran, et le TROISIÈME n'a été trouvé qu'en CI :
 *
 *   `fixtures-pagination.test.ts`   45 → 46 conversations
 *   `conversations.test.ts`         15 → 16 en page 2
 *   `scripts/check-lens.mjs:939`    44 → 45 rangées rendues — ROUGE, sans
 *                                   `continue-on-error`, job `institutionnel-v3`
 *
 * Le doc-comment de `surgedConversations` (`fixtures.ts`) énonce exactement
 * cette loi, et le lot l'a enfreinte : « le corpus est importé par 7 modules
 * et 18 gates nomment une de ses conversations — le faire grandir sous eux
 * ferait dépendre leurs comptes […] d'un couplage que rien ne rendrait
 * visible avant l'intégration ».
 *
 * D'où les DEUX témoins ci-dessous, qui ne valent qu'ENSEMBLE : le premier
 * seul se satisferait d'un salon supprimé, le second seul d'un salon remis
 * dans la liste. Un corpus de démonstration s'ouvre par son ADRESSE — c'est
 * ce que fait `check-rich-text.mjs`, et c'est ce que font déjà les DEUX
 * autres moitiés du même corpus (`hashtag-posts.ts` et `public-profile.ts`
 * l'importent à la demande, jamais par la liste).
 */
describe('le salon « Texte enrichi » vit HORS de la liste servie', () => {
  const transport = () => createHttpTransport({ base: '', fetchImpl: () => Promise.reject(new Error('aucun réseau en fixtures')) });

  test('aucune des deux pages servies ne le porte — les comptes des gates ne bougent pas', async () => {
    const deps = { source: 'fixtures' as const, transport: transport() };
    const page1 = await loadConversationsPage(deps);
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;

    const page2 = await loadConversationsPage({ ...deps, before: page1.data.cursorPagination.nextCursor ?? '' });
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;

    const servies = [...page1.data.conversations, ...page2.data.conversations];
    expect(servies.map((c) => c.id)).not.toContain(RICH_TEXT_CONVERSATION_ID);
    expect(servies).toHaveLength(45);
    expect(page1.data.conversations).toHaveLength(PAGE_SIZE);
    expect(page2.data.conversations).toHaveLength(15);
    expect(CONVERSATIONS).toHaveLength(45);
  });

  test('et il S’OUVRE quand même par son adresse — le gate y navigue en direct', async () => {
    const result = await loadConversation({ source: 'fixtures', transport: transport(), id: RICH_TEXT_CONVERSATION_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.title).toBe('Texte enrichi');
  });

  test('un identifiant inconnu reste un 404 — l’ouverture hors liste n’est pas un fourre-tout', async () => {
    const result = await loadConversation({ source: 'fixtures', transport: transport(), id: 'c-jamais-vue' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});
