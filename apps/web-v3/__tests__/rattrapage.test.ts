/**
 * @jest-environment node
 */

import { PLAFOND_DE_TOURS, rattrape } from '@/lib/realtime/sync/delta-client';

/**
 * LE RATTRAPAGE — `GET /sync`, et les deux faits que le module vendait faux.
 *
 * 1. `hasGap` était présenté comme LA raison d'appeler cette porte. Il est
 *    structurellement FAUX pour l'unique audience de l'écran : `checkpointSeq`
 *    vaut 0 en dur pour une identité anonyme, `GAP_THRESHOLD` vaut 10 000, et
 *    ce client n'envoie aucun `seq`. Le drapeau reste LU (un membre le lèvera),
 *    mais il ne peut pas être le mécanisme du séparateur du § 7.
 * 2. `hasMore` / `nextCursor` étaient IGNORÉS. Or la passerelle ne fait PAS
 *    avancer son checkpoint sur une page tronquée
 *    (`checkpoint: coveredTheWindow ? checkpoint : sinceDate`) : le client
 *    rangeait un watermark inchangé et redemandait éternellement la MÊME
 *    première page — un trou réel, jamais paginé et jamais signalé.
 *
 * Ces témoins opposent la pagination ET la lacune honnête. Le bouchon e2e, lui,
 * POSAIT le drapeau à la main : il prouvait que l'écran sait lire un booléen,
 * pas que la production le lève un jour.
 */

type Page = {
  readonly ajoutes?: readonly string[];
  readonly hasMore?: boolean;
  readonly nextCursor?: string | null;
  readonly hasGap?: boolean;
  readonly checkpoint?: string;
};

const messageServi = (id: string) => ({
  id,
  senderId: 'participant-9',
  content: `contenu ${id}`,
  originalLanguage: 'fr',
  translations: [],
  createdAt: '2026-08-30T12:00:00.000Z',
  sender: { id: 'participant-9', displayName: 'Ibrahim', type: 'anonymous', user: null },
});

const passerelle = (pages: readonly Page[]) => {
  const urls: string[] = [];

  const recuperer = async (url: string, _options?: RequestInit): Promise<Response> => {
    const page = pages[urls.length] ?? pages[pages.length - 1] ?? {};
    urls.push(url);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          checkpoint: page.checkpoint ?? '2026-08-30T12:00:05.000Z',
          collections: {
            messages: {
              added: (page.ajoutes ?? []).map(messageServi),
              modified: [],
              deleted: [],
            },
          },
          hasMore: page.hasMore === true,
          nextCursor: page.nextCursor ?? null,
          hasGap: page.hasGap === true,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  return { urls, recuperer };
};

const appelle = (pages: readonly Page[]) => {
  const bouchon = passerelle(pages);

  return {
    urls: bouchon.urls,
    verdict: rattrape({
      base: 'https://gate.test',
      jeton: 'jeton',
      conversationId: '6501f2a1b2c3d4e5f6a7b8c9',
      participantId: 'participant-1',
      depuis: '2026-08-30T12:00:00.000Z',
      recuperer: bouchon.recuperer,
    }),
  };
};

describe('la fenêtre TRONQUÉE se pagine avant de se peindre', () => {
  it('suit nextCursor jusqu’à ce que la passerelle dise que la fenêtre est couverte', async () => {
    const { urls, verdict } = appelle([
      { ajoutes: ['m1'], hasMore: true, nextCursor: 'curseur-1' },
      { ajoutes: ['m2'], hasMore: true, nextCursor: 'curseur-2' },
      { ajoutes: ['m3'], hasMore: false },
    ]);

    const resultat = await verdict;

    expect(resultat.etat).toBe('servi');
    if (resultat.etat !== 'servi') return;
    expect(resultat.valeur.messages.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);
    expect(resultat.valeur.lacune).toBe(false);
    expect(urls).toHaveLength(3);
    expect(urls[0]).not.toContain('cursor=');
    expect(urls[1]).toContain('cursor=curseur-1');
    expect(urls[2]).toContain('cursor=curseur-2');
  });

  /**
   * LE SÉPARATEUR ATTEIGNABLE. C'est la seule forme par laquelle « des messages
   * manquent ici » peut se peindre pour un invité aujourd'hui — et elle dit la
   * vérité : la fenêtre n'a PAS été couverte.
   */
  it('peint la lacune quand le plafond de tours n’a pas suffi', async () => {
    const { urls, verdict } = appelle([
      { ajoutes: ['m1'], hasMore: true, nextCursor: 'c1' },
      { ajoutes: ['m2'], hasMore: true, nextCursor: 'c2' },
      { ajoutes: ['m3'], hasMore: true, nextCursor: 'c3' },
      { ajoutes: ['m4'], hasMore: true, nextCursor: 'c4' },
      { ajoutes: ['m5'], hasMore: true, nextCursor: 'c5' },
      { ajoutes: ['m6'], hasMore: true, nextCursor: 'c6' },
    ]);

    const resultat = await verdict;

    expect(resultat.etat).toBe('servi');
    if (resultat.etat !== 'servi') return;
    expect(resultat.valeur.lacune).toBe(true);
    expect(urls).toHaveLength(PLAFOND_DE_TOURS);
  });

  /**
   * `hasMore` sans curseur : la passerelle dit qu'il reste quelque chose et ne
   * dit pas où. Redemander serait la boucle infinie que le défaut d'origine
   * produisait — on s'arrête, et on DIT.
   */
  it('s’arrête et peint la lacune quand hasMore n’est accompagné d’aucun curseur', async () => {
    const { urls, verdict } = appelle([{ ajoutes: ['m1'], hasMore: true, nextCursor: null }]);

    const resultat = await verdict;

    expect(resultat.etat).toBe('servi');
    if (resultat.etat !== 'servi') return;
    expect(resultat.valeur.lacune).toBe(true);
    expect(urls).toHaveLength(1);
  });

  it('rend encore ce qui a été lu quand un tour suivant tombe, et le DIT', async () => {
    const bouchon = passerelle([{ ajoutes: ['m1'], hasMore: true, nextCursor: 'c1' }]);
    let tours = 0;

    const resultat = await rattrape({
      base: 'https://gate.test',
      jeton: 'jeton',
      conversationId: '6501f2a1b2c3d4e5f6a7b8c9',
      participantId: 'participant-1',
      depuis: '2026-08-30T12:00:00.000Z',
      recuperer: async (url, options) => {
        tours += 1;
        if (tours > 1) throw new TypeError('Failed to fetch');
        return bouchon.recuperer(url, options);
      },
    });

    expect(resultat.etat).toBe('servi');
    if (resultat.etat !== 'servi') return;
    expect(resultat.valeur.messages.map((message) => message.id)).toEqual(['m1']);
    expect(resultat.valeur.lacune).toBe(true);
  });

  it('rend « indisponible » quand c’est le PREMIER tour qui tombe — rien n’a été lu', async () => {
    const resultat = await rattrape({
      base: 'https://gate.test',
      jeton: 'jeton',
      conversationId: '6501f2a1b2c3d4e5f6a7b8c9',
      participantId: 'participant-1',
      depuis: '2026-08-30T12:00:00.000Z',
      recuperer: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    expect(resultat.etat).toBe('indisponible');
  });

  it('lit encore hasGap — il est mort pour un invité, pas retiré du contrat', async () => {
    const { verdict } = appelle([{ ajoutes: ['m1'], hasGap: true }]);
    const resultat = await verdict;

    expect(resultat.etat).toBe('servi');
    if (resultat.etat !== 'servi') return;
    expect(resultat.valeur.lacune).toBe(true);
  });

  it('n’envoie jamais le paramètre `seq` — le curseur de séquence n’existe pas pour un invité', async () => {
    const { urls, verdict } = appelle([{ ajoutes: [] }]);
    await verdict;

    expect(urls[0]).not.toContain('seq=');
  });
});
