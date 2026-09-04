/**
 * @jest-environment node
 */

import { LIS_LE_COMPOSER, PUBLIE_DEPUIS_LE_COMPOSER } from '@/app/connecte/composer-porte';
import { COMPOSER, FORMATS_SERVIS, HUMEURS, LONGUEUR_MAX_DU_CONTENU } from '@/lib/contenu/composer';

/**
 * `/composer` (#4966) — CE QUE L'ÉCRAN PUBLIE, opposé à un serveur cousu.
 *
 * **`publie()` A ATTERRI SUR `dev` SANS UN SEUL TÉMOIN** — mesuré le
 * 2026-09-04 : la primitive de création existait, écrite pour cet écran, et
 * aucun test ne l'exerçait, aucune route ne l'appelait. Ces témoins sont donc
 * autant les siens que ceux de la porte : ils opposent le CORPS RÉELLEMENT
 * ENVOYÉ à la passerelle, pas la forme du document.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';
const ORIGINE = 'https://meeshy.test';

const requete = (chemin: string, avecJeton = true): Request =>
  new Request(`${ORIGINE}${chemin}`, { headers: avecJeton ? { cookie: COOKIE } : {} });

const poste = (
  corps: Readonly<Record<string, string>>,
  options: { readonly avecJeton?: boolean; readonly origine?: string | null } = {},
): Request =>
  new Request(`${ORIGINE}/composer`, {
    method: 'POST',
    headers: {
      ...(options.avecJeton === false ? {} : { cookie: COOKIE }),
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
  regionalLanguage: 'wo',
  customDestinationLanguage: null,
};

/** Le serveur cousu RETIENT le corps envoyé — c'est lui, le sujet. */
const serveur = (options: { readonly statutDeLaPublication?: number; readonly lecteur?: unknown } = {}) => {
  const corps: unknown[] = [];
  const recuperer = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.includes('/auth/me')) return json({ success: true, data: options.lecteur ?? LECTRICE });
    if (url.endsWith('/api/v1/posts')) {
      corps.push(JSON.parse(String(init?.body ?? '{}')));
      const statut = options.statutDeLaPublication ?? 201;
      return statut >= 400
        ? json({ success: false, error: { message: 'Contenu refusé.' } }, statut)
        : json({ success: true, data: { id: 'p-neuf' } }, statut);
    }
    throw new Error(`appel non prévu : ${url}`);
  };
  return { corps, recuperer };
};

describe('le composer servi', () => {
  it('renvoie vers la connexion sans jeton', async () => {
    const reponse = await LIS_LE_COMPOSER(requete('/composer', false), serveur().recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fcomposer');
  });

  /**
   * DEUX ONGLETS, ET C'EST LE SUJET. Un onglet « Réel » ou « Story » serait un
   * lien vers une publication que cet écran ne peut pas composer, ou vers une
   * route qui n'existe pas : le contrôle sans effet de la charte règle 7. Le
   * témoin nomme les DEUX absents plutôt que de compter — un compte qui
   * passerait de 2 à 3 ne dirait pas lequel est revenu.
   */
  it('ne rend que les formats qu’il peut publier', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer'), serveur().recuperer)).text();

    expect(html).toContain('href="/composer?format=post"');
    expect(html).toContain('href="/composer?format=humeur"');
    expect(html).not.toContain('format=reel');
    expect(html).not.toContain('format=story');
    expect(html).not.toContain('href="/stories/new"');
  });

  it('sert le format demandé, et le dit à autre chose qu’à la couleur', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=humeur'), serveur().recuperer)).text();

    expect(html).toContain('href="/composer?format=humeur" aria-current="page"');
    expect(html).toContain(HUMEURS[0]);
  });

  /** Un format inventé dans l'adresse n'atteint pas le document. */
  it('retombe sur le premier format devant une valeur inconnue', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=<script>'), serveur().recuperer)).text();

    expect(html).toContain(`href="/composer?format=${FORMATS_SERVIS[0].cle}" aria-current="page"`);
    expect(html).not.toContain('<script>a');
  });

  /**
   * LA BORNE EST DITE ET APPLIQUÉE, et elle vient du schéma. Le « 140 » de la
   * cible n'est appliqué par aucune route : l'afficher aurait été un chiffre
   * que rien ne tient.
   */
  it('applique la borne de CreatePostSchema, jamais celle de la planche', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer'), serveur().recuperer)).text();

    expect(html).toContain(`maxlength="${LONGUEUR_MAX_DU_CONTENU}"`);
    expect(html).not.toContain('maxlength="140"');
  });

  /**
   * LA LIGNE « TRADUCTION » DIT LA LANGUE RÉELLE, pas « Auto ». Elle annonce ce
   * qui va être REVENDIQUÉ — le premier rang du Prisme de la lectrice.
   */
  it('annonce la langue que la publication revendiquera', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer'), serveur().recuperer)).text();

    expect(html).toContain('Publié en français');
  });

  /**
   * ET IL SE TAIT QUAND RIEN N'EST DÉCLARÉ — le témoin qui a attrapé le défaut.
   * La première écriture lisait `languesDuLecteur`, qui retombe sur « fr » :
   * un compte sans langue configurée aurait publié tout son contenu ÉTIQUETÉ
   * FRANÇAIS, et chaque lecteur aurait traduit depuis une langue jamais
   * écrite. Le repli d'une LECTURE n'est pas la valeur d'une ÉCRITURE.
   */
  it('se tait sur la langue quand le lecteur n’en déclare aucune', async () => {
    const sans = { ...LECTRICE, systemLanguage: null, regionalLanguage: null };
    const html = await (await LIS_LE_COMPOSER(requete('/composer'), serveur({ lecteur: sans }).recuperer)).text();

    expect(html).toContain(COMPOSER.traductionSansLangue);
  });
});

describe('publier depuis le composer', () => {
  it('refuse un formulaire venu d’un autre site', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      poste({ format: 'post', texte: 'Bonjour' }, { origine: 'https://ailleurs.test' }),
      recuperer,
    );

    expect(reponse.status).toBe(403);
    expect(corps).toEqual([]);
  });

  /** LE CORPS ENVOYÉ — le sujet de ce lot, et ce que `publie()` n'avait jamais gagé. */
  /** ET AUCUNE CLÉ `originalLanguage` quand rien n'est déclaré : l'ABSENCE, jamais « fr ». */
  it('ne revendique aucune langue quand le lecteur n’en déclare aucune', async () => {
    const sans = { ...LECTRICE, systemLanguage: null, regionalLanguage: null };
    const { corps, recuperer } = serveur({ lecteur: sans });
    await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'Ẹ káàbọ̀' }), recuperer);

    expect(corps[0]).not.toHaveProperty('originalLanguage');
  });

  it('envoie un POST avec son texte, son type et sa langue revendiquée', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'La revue est prête.' }), recuperer);

    expect(corps).toEqual([
      { type: 'POST', content: 'La revue est prête.', visibility: 'PUBLIC', originalLanguage: 'fr' },
    ]);
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/composer?format=post&publie=1');
  });

  /**
   * L'AUDIENCE MUTE LA CHARGE — les trois valeurs, chacune vérifiée sur le
   * corps. C'est ce qui distingue un contrôle d'une mention (charte règle 7),
   * et une audience est une garde de CONFIDENTIALITÉ : la vérifier sur le
   * document rendu ne prouverait rien de ce qui part.
   */
  it.each([
    ['PUBLIC', 'PUBLIC'],
    ['FRIENDS', 'FRIENDS'],
    ['PRIVATE', 'PRIVATE'],
  ])('l’audience %s part telle quelle', async (choisie, attendue) => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'Bonjour', audience: choisie }), recuperer);

    expect(corps[0]).toMatchObject({ visibility: attendue });
  });

  /** Une audience inventée retombe sur la plus RESTRICTIVE des sens, jamais sur la charge brute. */
  it('n’envoie jamais une audience que la passerelle refuserait', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'Bonjour', audience: 'COMMUNITY' }), recuperer);

    expect(corps[0]).toMatchObject({ visibility: 'PUBLIC' });
  });

  /**
   * UNE HUMEUR EST UN `STATUS` AVEC SON EMOJI, et l'emoji EST le contenu : une
   * humeur sans texte est valide.
   */
  it('publie une humeur avec son emoji, même sans texte', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'humeur', humeur: '☕', texte: '' }), recuperer);

    expect(corps[0]).toMatchObject({ type: 'STATUS', content: '', moodEmoji: '☕' });
  });

  /** ET AUCUNE CLÉ `moodEmoji` HORS HUMEUR — une chaîne vide serait un emoji vide. */
  it('ne pose aucun moodEmoji sur un post', async () => {
    const { corps, recuperer } = serveur();
    await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'Bonjour', humeur: '☕' }), recuperer);

    expect(corps[0]).not.toHaveProperty('moodEmoji');
  });

  /**
   * RIEN À PUBLIER SE DIT SANS APPELER LA PASSERELLE. L'aller-retour serait
   * payé par le lecteur pour apprendre ce que le document savait déjà.
   */
  it('refuse une publication vide sans appeler la passerelle', async () => {
    const { corps, recuperer } = serveur();
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: '   ' }), recuperer);
    const html = await reponse.text();

    expect(corps).toEqual([]);
    expect(reponse.status).toBe(422);
    expect(html).toContain(COMPOSER.vide);
  });

  /**
   * UN REFUS REPOSE LA SAISIE. Perdre cinq lignes parce que la passerelle a
   * déplu est le défaut le plus cher d'un formulaire, et il ne se voit qu'au
   * pire moment.
   */
  it('un refus garde le texte, l’humeur et l’audience choisis', async () => {
    const { recuperer } = serveur({ statutDeLaPublication: 422 });
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(
      poste({ format: 'humeur', humeur: '🔥', texte: 'Ce que je viens d’écrire', audience: 'FRIENDS' }),
      recuperer,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(422);
    expect(html).toContain('Ce que je viens d’écrire');
    expect(html).toContain('value="🔥" checked');
    expect(html).toContain('value="FRIENDS" selected');
    expect(html).toContain(COMPOSER.refuse);
  });

  it('renvoie à la connexion quand la session a expiré', async () => {
    const { recuperer } = serveur({ statutDeLaPublication: 401 });
    const reponse = await PUBLIE_DEPUIS_LE_COMPOSER(poste({ format: 'post', texte: 'Bonjour' }), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fcomposer');
  });

  /** LE RETOUR DU PRG dit ce qui vient d'avoir lieu, et où le voir. */
  it('confirme la publication au retour, et mène au fil', async () => {
    const html = await (await LIS_LE_COMPOSER(requete('/composer?format=post&publie=1'), serveur().recuperer)).text();

    expect(html).toContain(COMPOSER.publie);
    expect(html).toContain('href="/feed"');
  });
});

/**
 * `/composer` A UNE PORTE — leçon 507. Le champ « Quoi de neuf ? » du fil est
 * la seule entrée que la planche dessine (`MeeshyWebV3.dc.html:870`).
 */
describe('le composer est atteignable', () => {
  it('le fil social porte un lien vers /composer', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(__dirname, '..', 'app/connecte/social-vue.ts'), 'utf8');

    expect(source).toContain('href="/composer"');
  });
});
