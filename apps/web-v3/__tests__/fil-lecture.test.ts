/**
 * @jest-environment node
 */

import { lisLeFil, messageDepuis } from '@/lib/api/messagerie';

/**
 * CE QUI TRAVERSE LA FRONTIÈRE POUR PEINDRE UNE BULLE — et ce qui n'a pas à la
 * traverser.
 *
 * `lisLeFil` demandait `?limit=50` et rien d'autre, donc la passerelle servait
 * TOUTES les traductions de chaque message (« absent = all languages »). Sur
 * l'écran du rôle premier, cela veut dire N textes transportés par message pour
 * qu'un seul soit lu — et le document en portait une copie de plus, la descente
 * du Prisme se faisant alors dans le navigateur. Le prisme du lecteur est connu
 * au moment de l'appel : on demande exactement ce qu'on saura servir.
 */

const reponse = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });

const messageBrut = {
  id: 'm-1',
  senderId: 'participant-9',
  content: 'Hello',
  originalLanguage: 'en',
  translations: [{ targetLanguage: 'fr', translatedContent: 'Bonjour' }],
  createdAt: '2026-08-30T12:01:00.000Z',
  sender: { id: 'participant-9', displayName: 'Ibrahim', type: 'anonymous', user: null },
};

const appelle = async (langues?: readonly string[]) => {
  const urls: string[] = [];

  const verdict = await lisLeFil({
    base: 'https://gate.test',
    jeton: 'jeton',
    conversationId: '6501f2a1b2c3d4e5f6a7b8c9',
    participantId: 'participant-1',
    ...(langues === undefined ? {} : { langues }),
    recuperer: (url) => {
      urls.push(url);
      return Promise.resolve(reponse({ success: true, data: { messages: [messageBrut] } }));
    },
  });

  return { urls, verdict };
};

describe('`languages=` — l’opt-in de bande passante que la passerelle offre', () => {
  it('demande EXACTEMENT le prisme du lecteur', async () => {
    const { urls } = await appelle(['fr', 'en']);

    expect(urls[0]).toContain('languages=fr%2Cen');
    expect(urls[0]).toContain('limit=50');
  });

  /**
   * Un prisme vide n'est pas « aucune langue » : `languages=` vide est une
   * requête malformée, et la demander ferait servir un fil sans traduction à
   * quelqu'un dont on n'a simplement rien su.
   */
  it('n’envoie pas le paramètre quand le prisme est vide ou absent', async () => {
    expect((await appelle([])).urls[0]).not.toContain('languages=');
    expect((await appelle()).urls[0]).not.toContain('languages=');
  });
});

describe('ce que la passerelle DIT d’un auteur sans compte', () => {
  /**
   * `sender.type` vient de `Participant.type`, et c'est la seule source qui
   * l'affirme. Le déduire d'un `user` absent ferait passer un membre pour un
   * invité dès qu'une projection plus pauvre ne demande pas la relation —
   * c'est-à-dire poser un badge FAUX sur une identité.
   */
  it('marque « anonyme » sur `sender.type`, jamais sur l’absence de `user`', () => {
    expect(messageDepuis(messageBrut, 'participant-1')?.anonyme).toBe(true);
    expect(
      messageDepuis({ ...messageBrut, sender: { id: 'u', displayName: 'Ada' } }, 'participant-1')
        ?.anonyme,
    ).toBe(false);
    expect(
      messageDepuis(
        { ...messageBrut, sender: { id: 'u', displayName: 'Ada', type: 'member' } },
        'participant-1',
      )?.anonyme,
    ).toBe(false);
  });
});
