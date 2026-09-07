/**
 * @jest-environment node
 */

import { LIS_LA_STORY_NEUVE, PUBLIE_UNE_STORY } from '@/app/connecte/story-neuve-porte';
import { HEURES_DE_VIE_D_UNE_STORY, STORY_NEUVE } from '@/lib/contenu/story-neuve';
import { STORY } from '@/lib/contenu/story';

/**
 * `/stories/new` (#5033) — LES DEUX CONTRÔLES DE LA CIBLE, ET LEUR ASYMÉTRIE.
 *
 * L'audience MUTE la charge ; l'expiration n'a AUCUNE capacité serveur. Les
 * témoins les jugent donc différemment : le premier sur le corps envoyé, le
 * second sur l'ABSENCE de champ — c'est ce qui distingue un réglage d'une
 * mention, et les confondre produirait un contrôle qui ne règle rien.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';
const ORIGINE = 'https://meeshy.test';

const requete = (chemin: string, avecJeton = true): Request =>
  new Request(`${ORIGINE}${chemin}`, { headers: avecJeton ? { cookie: COOKIE } : {} });

const poste = (
  corps: Readonly<Record<string, string>>,
  options: { readonly origine?: string | null } = {},
): Request =>
  new Request(`${ORIGINE}/stories/new`, {
    method: 'POST',
    headers: {
      cookie: COOKIE,
      ...(options.origine === null ? {} : { origin: options.origine ?? ORIGINE }),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(corps).toString(),
  });

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const LECTRICE = {
  id: 'u-amina',
  username: 'amina',
  displayName: 'Amina Diallo',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
};

const serveur = (options: { readonly statut?: number; readonly lecteur?: unknown } = {}) => {
  const corps: unknown[] = [];
  const recuperer = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.includes('/auth/me')) return json({ success: true, data: options.lecteur ?? LECTRICE });
    if (url.endsWith('/api/v1/posts')) {
      corps.push(JSON.parse(String(init?.body ?? '{}')));
      const statut = options.statut ?? 201;
      return statut >= 400
        ? json({ success: false, error: { message: 'Contenu refusé.' } }, statut)
        : json({ success: true, data: { id: 's-neuve' } }, statut);
    }
    throw new Error(`appel non prévu : ${url}`);
  };
  return { corps, recuperer };
};

describe('l’écran de nouvelle story', () => {
  it('renvoie vers la connexion sans jeton', async () => {
    const reponse = await LIS_LA_STORY_NEUVE(requete('/stories/new', false), serveur().recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fstories%2Fnew');
  });

  /**
   * L'EXPIRATION N'EST PAS UN CHAMP — aucune capacité serveur
   * (`CreatePostSchema` ne porte aucune échéance). Le témoin garde l'ABSENCE :
   * un `<select>` ou un `<input>` sur cette ligne serait un réglage qui ne
   * règle rien, et il ne se verrait qu'à l'usage.
   */
  it('dit l’expiration, et n’en fait pas un contrôle', async () => {
    const html = await (await LIS_LA_STORY_NEUVE(requete('/stories/new'), serveur().recuperer)).text();

    expect(html).toContain(`${STORY_NEUVE.expiration} ${HEURES_DE_VIE_D_UNE_STORY} h`);
    expect(html).not.toContain('name="expiration"');
    expect(html).not.toContain('id="s-expiration"');
  });

  /**
   * ET LA VALEUR EST 20 h, JAMAIS 24 — la cible écrit « 24 h » et la copie du
   * LECTEUR portait la même erreur. Le nombre vient du gateway
   * (`EPHEMERAL_POST_TTL_HOURS.STORY`), pas d'un document de design.
   */
  it('sert la durée que la passerelle applique, pas celle de la planche', async () => {
    const html = await (await LIS_LA_STORY_NEUVE(requete('/stories/new'), serveur().recuperer)).text();

    expect(HEURES_DE_VIE_D_UNE_STORY).toBe(20);
    expect(html).not.toContain('24 h');
    // La MÊME durée est servie au lecteur d'une story indisponible : deux
    // phrases qui divergent diraient deux vérités sur le même fait.
    expect(STORY.indisponible.corps).toContain(`${HEURES_DE_VIE_D_UNE_STORY} h`);
    expect(STORY.indisponible.corps).not.toContain('24 h');
  });

  /**
   * LE DÉFAUT EST « CONTACTS », PAS « PUBLIC ». C'est le défaut SERVEUR d'une
   * story, et reprendre celui du composer aurait ouvert au monde entier ce que
   * le service ferme aux contacts — sans aucun message pour le dire.
   */
  it('propose « Contacts » par défaut, comme le serveur', async () => {
    const html = await (await LIS_LA_STORY_NEUVE(requete('/stories/new'), serveur().recuperer)).text();

    expect(html).toContain('value="FRIENDS" selected');
    expect(html).not.toContain('value="PUBLIC" selected');
  });
});

describe('publier une story', () => {
  it('refuse un formulaire venu d’un autre site', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(
      poste({ texte: 'Bonjour' }, { origine: 'https://ailleurs.test' }),
      recuperer,
    );

    expect(reponse.status).toBe(403);
    expect(corps).toEqual([]);
  });

  it('envoie un STORY avec son texte et sa langue revendiquée', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(poste({ texte: 'Les coulisses de la revue.' }), recuperer);

    expect(corps).toEqual([
      { type: 'STORY', content: 'Les coulisses de la revue.', visibility: 'FRIENDS', originalLanguage: 'fr' },
    ]);
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/stories/new?publie=1');
  });

  /** L'AUDIENCE MUTE LA CHARGE — c'est le critère de fin, et il porte sur ce qui PART. */
  it.each(['PUBLIC', 'FRIENDS', 'PRIVATE'])('l’audience %s part telle quelle', async (choisie) => {
    const { corps, recuperer } = serveur();
    await PUBLIE_UNE_STORY(poste({ texte: 'Bonjour', audience: choisie }), recuperer);

    expect(corps[0]).toMatchObject({ visibility: choisie });
  });

  /** Une audience inventée retombe sur le défaut SERVEUR, jamais sur PUBLIC. */
  it('retombe sur Contacts devant une audience inconnue', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_UNE_STORY(poste({ texte: 'Bonjour', audience: 'COMMUNITY' }), recuperer);

    expect(corps[0]).toMatchObject({ visibility: 'FRIENDS' });
  });

  it('refuse une story vide sans appeler la passerelle', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_UNE_STORY(poste({ texte: '  ' }), recuperer);

    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(await reponse.text()).toContain(STORY_NEUVE.vide);
  });

  it('un refus garde le texte et l’audience choisis', async () => {
    const { recuperer } = serveur({ statut: 422 });
    const reponse = await PUBLIE_UNE_STORY(poste({ texte: 'Ce que j’ai écrit', audience: 'PRIVATE' }), recuperer);
    const html = await reponse.text();

    expect(html).toContain('Ce que j’ai écrit');
    expect(html).toContain('value="PRIVATE" selected');
  });

  it('ne revendique aucune langue quand le lecteur n’en déclare aucune', async () => {
    const sans = { ...LECTRICE, systemLanguage: null };
    const { corps, recuperer } = serveur({ lecteur: sans });
    await PUBLIE_UNE_STORY(poste({ texte: 'Ẹ káàbọ̀' }), recuperer);

    expect(corps[0]).not.toHaveProperty('originalLanguage');
  });
});
