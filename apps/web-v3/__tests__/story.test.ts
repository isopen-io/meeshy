/**
 * @jest-environment node
 */

import { lisLaStory, soumetsALaStory } from '@/app/(public)/stories/[id]/porte';
import {
  documentDeLInvitation,
  documentDeLaStory,
  documentIndisponible,
  type EtatDeLaStory,
} from '@/app/(public)/stories/[id]/story-vue';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '@/lib/api/cookies';
import { storyLue, voisinage, type Story, type Voisine } from '@/lib/api/publication';
import { STORY } from '@/lib/contenu/story';

/**
 * **UNE STORY PARTAGÉE SE LIT INTÉGRALEMENT, DANS LA LANGUE DU LECTEUR**
 * (issue #4895, `cible/story.png`).
 *
 * DEUX CHOSES QUE CES TÉMOINS GARDENT, ET UNE QU'ILS NE GARDENT PAS.
 *
 * Ils ne gardent PAS la descente du Prisme : elle vit dans
 * `resolvePrismTranslation` (`@meeshy/shared`), site unique, qui a ses propres
 * témoins. Ils gardent ce que la v3 lui DONNE — la carte des traductions d'un
 * post est un `Record<string, { text }>`, quand le résolveur attend
 * `Record<string, string>` — et ce que la v3 en AFFICHE : le cycle 122 dit
 * qu'une descente juste dont la valeur n'atteint aucun lecteur n'a corrigé
 * personne, et le cycle 123 qu'une surface qui ANNONCE une langue sans la
 * servir est pire qu'une surface muette.
 *
 * LE TÉMOIN DE RANG S'ÉCRIT SUR UN RANG AUTRE QUE LE PREMIER (leçon 261) : au
 * rang 1, le court-circuit interdit (« la langue d'origine est dans le prisme
 * ⇒ servir l'original ») et la règle juste rendent le même verdict.
 *
 * ET L'AUDIENCE EST CELLE QUE LA PASSERELLE ADMET (décision du porteur,
 * 2026-09-02) : `GET /posts/:postId` est en `requiredAuth`
 * (`services/gateway/src/routes/posts/core.ts:460-461`). La v3 s'y CONFORME —
 * le lecteur connecté lit la story, le visiteur sans session reçoit une
 * INVITATION, et rien du contenu ne part avant sa connexion.
 */

const ORIGINE = 'https://gate.test';
const MAINTENANT = Date.parse('2026-09-02T12:00:00.000Z');

const brute = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 's1',
  type: 'STORY',
  content: 'Three charts, two surprises. The review lands tomorrow.',
  originalLanguage: 'en',
  createdAt: '2026-09-02T09:00:00.000Z',
  expiresAt: '2026-09-03T05:00:00.000Z',
  authorId: 'u2',
  author: { id: 'u2', displayName: 'Ibrahim', username: 'ibrahim' },
  translations: {
    fr: { text: 'Trois graphiques, deux surprises. La revue arrive demain.' },
    es: { text: 'Tres gráficos, dos sorpresas. La revisión llega mañana.' },
  },
  isLikedByMe: false,
  media: [],
  ...attributs,
});

const lue = (
  attributs: Record<string, unknown> = {},
  langues: readonly string[] = ['fr'],
  langueDemandee: string | null = null,
): Story => {
  const story = storyLue({ brut: brute(attributs), langues, langueDemandee, maintenant: MAINTENANT, origine: ORIGINE });
  if (story === null) throw new Error('story non lue');
  return story;
};

const etat = (story: Story, attributs: Partial<EtatDeLaStory> = {}): EtatDeLaStory => ({
  story,
  voisinage: voisinage({ story, visibles: [] }),
  maintenant: MAINTENANT,
  confirmation: false,
  erreur: null,
  brouillon: '',
  ...attributs,
});

// --- ce que la v3 donne au résolveur, et ce qu'elle en affiche ---------------

describe('le Prisme sur une story', () => {
  it('sert la traduction de la langue PRIMAIRE du lecteur', () => {
    const story = lue({}, ['fr']);
    expect(story.texte).toBe('Trois graphiques, deux surprises. La revue arrive demain.');
    expect(story.langueServie).toBe('fr');
    expect(story.langueOriginale).toBe('en');
  });

  /**
   * LE TÉMOIN DE RANG. Prisme `['de','fr']`, story ANGLAISE, traduction
   * française disponible : la règle juste rend le français, un résolveur qui
   * ne consulterait que le rang 1 rendrait l'anglais.
   */
  it('descend le prisme ORDONNÉ, jamais le rang 1 seul', () => {
    expect(lue({}, ['de', 'fr']).langueServie).toBe('fr');
    expect(lue({}, ['de', 'es']).langueServie).toBe('es');
  });

  /**
   * La langue d'origine concourt à son RANG : prisme `['en','fr']` sur une
   * story anglaise ⇒ l'original, et AUCUNE annonce de traduction.
   */
  it('sert l’original — sans rien annoncer — quand l’origine gagne à son rang', () => {
    const story = lue({}, ['en', 'fr']);
    expect(story.texte).toBe('Three charts, two surprises. The review lands tomorrow.');
    expect(story.langueServie).toBeNull();
  });

  it('sert l’original quand aucune traduction ne matche', () => {
    expect(lue({}, ['yo']).langueServie).toBeNull();
  });

  it('n’offre que les langues RÉELLEMENT servies, l’origine comprise', () => {
    expect([...lue().languesOffertes].sort()).toEqual(['en', 'es', 'fr']);
  });

  it('ne prend pour traduction qu’une entrée dont le texte existe', () => {
    const story = lue({ translations: { fr: { text: '' }, es: { text: 'Hola' } } }, ['fr', 'es']);
    expect(story.langueServie).toBe('es');
    expect([...story.languesOffertes].sort()).toEqual(['en', 'es']);
  });
});

/**
 * LA VARIANTE DÉLIBÉRÉE (`?lang=xx`, § 5.4). C'est l'EFFET que le critère de
 * fin demande à `TranslationToggle` : « cliquer une langue CHANGE le texte
 * lu ». Sans JavaScript, la puce est un LIEN, et c'est le serveur qui sert
 * l'autre texte.
 */
describe('la langue explicitement demandée', () => {
  it('l’emporte sur le prisme du lecteur', () => {
    const story = lue({}, ['fr'], 'es');
    expect(story.texte).toBe('Tres gráficos, dos sorpresas. La revisión llega mañana.');
    expect(story.langueServie).toBe('es');
  });

  it('rend l’original quand elle DÉSIGNE la langue d’origine', () => {
    const story = lue({}, ['fr'], 'en');
    expect(story.texte).toBe('Three charts, two surprises. The review lands tomorrow.');
    expect(story.langueServie).toBeNull();
  });

  it('retombe sur le prisme quand aucune traduction ne la porte — jamais un refus', () => {
    expect(lue({}, ['fr'], 'yo').langueServie).toBe('fr');
  });
});

// --- ce qui n'a pas le DROIT d'être là (cycle 124, § 5.1) --------------------

describe('une story que la v3 ne sert pas', () => {
  it('refuse une story ÉCHUE — le balayeur ne passe qu’après, le client filtre', () => {
    expect(
      storyLue({
        brut: brute({ expiresAt: '2026-09-02T11:59:00.000Z' }),
        langues: ['fr'],
        langueDemandee: null,
        maintenant: MAINTENANT,
        origine: ORIGINE,
      }),
    ).toBeNull();
  });

  it('refuse un post qui n’est pas une story — l’adresse dit `stories`', () => {
    expect(
      storyLue({ brut: brute({ type: 'POST' }), langues: ['fr'], langueDemandee: null, maintenant: MAINTENANT, origine: ORIGINE }),
    ).toBeNull();
  });

  it('refuse une story supprimée', () => {
    expect(
      storyLue({
        brut: brute({ deletedAt: '2026-09-02T10:00:00.000Z' }),
        langues: ['fr'],
        langueDemandee: null,
        maintenant: MAINTENANT,
        origine: ORIGINE,
      }),
    ).toBeNull();
  });
});

describe('le média d’une story', () => {
  it('résout `fileUrl` sur l’origine PUBLIQUE de la passerelle, jamais sur celle du document', () => {
    const story = lue({
      media: [{ id: 'p1', fileUrl: '/api/v1/attachments/file/2026/scene.jpg', mimeType: 'image/jpeg', width: 1080, height: 1920, alt: 'Trois graphiques' }],
    });
    expect(story.medias).toEqual([
      { url: `${ORIGINE}/api/v1/attachments/file/2026/scene.jpg`, genre: 'image', alt: 'Trois graphiques', largeur: 1080, hauteur: 1920 },
    ]);
  });
});

// --- le voisinage : ce que les segments montrent, et ce que les taps font ----

const voisine = (id: string, minutes: number, auteurId = 'u2'): Voisine => ({
  id,
  auteurId,
  publieeA: new Date(MAINTENANT - minutes * 60_000).toISOString(),
});

describe('le voisinage d’une story', () => {
  it('n’ordonne que les stories du MÊME auteur, de la plus ancienne à la plus récente', () => {
    const v = voisinage({
      story: lue(),
      visibles: [voisine('s2', 10), voisine('s1', 180), voisine('s3', 5), voisine('autre', 20, 'u9')],
    });
    expect(v.segments.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(v.rang).toBe(0);
    expect(v.precedente).toBeNull();
    expect(v.suivante).toBe('s2');
  });

  it('rend un seul segment quand le voisinage ne porte pas la story ouverte', () => {
    const v = voisinage({ story: lue(), visibles: [voisine('autre', 20, 'u9')] });
    expect(v.segments.map((s) => s.id)).toEqual(['s1']);
    expect(v.precedente).toBeNull();
    expect(v.suivante).toBeNull();
  });

  it('désigne la précédente et la suivante au milieu de la file', () => {
    const v = voisinage({
      story: lue(),
      visibles: [voisine('s0', 300), voisine('s1', 180), voisine('s2', 10)],
    });
    expect(v.rang).toBe(1);
    expect(v.precedente).toBe('s0');
    expect(v.suivante).toBe('s2');
  });
});

// --- le document servi ------------------------------------------------------

describe('le document d’une story', () => {
  it('reste hors des index — un extrait périmé survivrait à la story (§ 5.4)', () => {
    expect(documentDeLaStory(etat(lue()))).toContain('<meta name="robots" content="noindex, nofollow"/>');
  });

  it('n’embarque aucun script applicatif — le thème et rien d’autre', () => {
    const html = documentDeLaStory(etat(lue()));
    expect([...html.matchAll(/<script/g)]).toHaveLength(1);
    expect(html).not.toContain('data-participation');
  });

  /**
   * `lang="xx"` est posé sur le NŒUD dont le texte a été résolu — pas ailleurs.
   * Le témoin regarde donc le paragraphe SERVI, jamais la présence du code
   * quelque part dans le document (la liste des langues en porte un par
   * entrée, et un `toContain` nu serait vert sans rien prouver).
   */
  it('déclare la langue du texte SERVI quand elle diffère de celle du document', () => {
    expect(documentDeLaStory(etat(lue({}, ['es'])))).toContain('<p class="texte" lang="es">');
    expect(documentDeLaStory(etat(lue({}, ['fr'])))).toContain('<p class="texte">');
    expect(documentDeLaStory(etat(lue({}, ['en'])))).toContain('<p class="texte" lang="en">');
  });

  /**
   * L'ANNONCE A UN EFFET, sinon elle ment (cycle 123). « Voir l'original » est
   * un LIEN vers la variante explicite, pas une mention.
   */
  it('annonce la traduction ET donne le retour à l’original', () => {
    const html = documentDeLaStory(etat(lue()));
    expect(html).toContain(STORY.traduitDe('English'));
    expect(html).toContain('href="/stories/s1?lang=en"');
  });

  it('n’annonce rien quand l’original est servi', () => {
    const html = documentDeLaStory(etat(lue({}, ['en'])));
    expect(html).not.toContain(STORY.original);
  });

  it('offre une langue par traduction servie, et marque celle qui est lue', () => {
    const html = documentDeLaStory(etat(lue()));
    expect(html).toContain('href="/stories/s1?lang=es"');
    expect(html).toContain('href="/stories/s1?lang=fr" aria-current="true"');
  });

  it('ne rend AUCUN tap tant qu’il n’y a nulle part où aller (charte règle 7)', () => {
    expect(documentDeLaStory(etat(lue()))).not.toContain('class="tap');
  });

  it('rend les deux taps NOMMÉS quand le voisinage en porte', () => {
    const html = documentDeLaStory(
      etat(lue(), { voisinage: voisinage({ story: lue(), visibles: [voisine('s0', 300), voisine('s1', 180), voisine('s2', 10)] }) }),
    );
    expect(html).toContain('href="/stories/s0"');
    expect(html).toContain('href="/stories/s2"');
    expect(html).toContain(STORY.precedente);
    expect(html).toContain(STORY.suivante);
  });

  it('dit si la story est déjà aimée — un bouton qui sait son état', () => {
    expect(documentDeLaStory(etat(lue({ isLikedByMe: true })))).toContain('aria-pressed="true"');
    expect(documentDeLaStory(etat(lue()))).toContain('aria-pressed="false"');
  });

  it('confirme la réponse envoyée, et peint le refus avec le brouillon', () => {
    expect(documentDeLaStory(etat(lue(), { confirmation: true }))).toContain(STORY.repondu);
    const refuse = documentDeLaStory(etat(lue(), { erreur: 'Trop long', brouillon: 'Bravo' }));
    expect(refuse).toContain('Trop long');
    expect(refuse).toContain('Bravo');
  });
});

describe('l’invitation servie au visiteur sans session', () => {
  const html = documentDeLInvitation({ id: 's1' });

  it('garde l’adresse demandée pour y revenir', () => {
    expect(html).toContain('href="/login?returnUrl=%2Fstories%2Fs1"');
    expect(html).toContain('href="/signup?returnUrl=%2Fstories%2Fs1"');
  });

  it('n’invente aucune métadonnée : la passerelle n’a rien servi sans créance', () => {
    expect(html).toContain(`<title>${STORY.invitation.titre} — Meeshy</title>`);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>');
  });
});

// --- la porte ---------------------------------------------------------------

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const AVEC_JETON = `${COOKIE_DE_SESSION}=ouverte; ${COOKIE_DE_JETON}=JWT.xyz`;

const requete = (chemin: string, cookie?: string): Request =>
  new Request(`https://meeshy.me${chemin}`, cookie === undefined ? {} : { headers: { cookie } });

const soumission = (chemin: string, champs: Readonly<Record<string, string>>, entetes: Readonly<Record<string, string>> = {}): Request => {
  const corps = new URLSearchParams(champs);
  return new Request(`https://meeshy.me${chemin}`, {
    method: 'POST',
    headers: { cookie: AVEC_JETON, 'content-type': 'application/x-www-form-urlencoded', ...entetes },
    body: corps.toString(),
  });
};

type Appel = { readonly methode: string; readonly chemin: string; readonly corps: string };

const passerelle = (parChemin: Readonly<Record<string, () => Response>>) => {
  const appels: Appel[] = [];
  const recuperer = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const adresse = new URL(url);
    appels.push({
      methode: options.method ?? 'GET',
      chemin: `${adresse.pathname}${adresse.search}`,
      corps: typeof options.body === 'string' ? options.body : '',
    });
    const reponse = parChemin[adresse.pathname];
    if (reponse === undefined) throw new Error(`chemin non simulé : ${adresse.pathname}`);
    return reponse();
  };
  return { appels, recuperer };
};

const MONDE = {
  '/api/v1/auth/me': () => json({ success: true, data: { id: 'u1', displayName: 'Amina', systemLanguage: 'fr' } }),
  '/api/v1/posts/s1': () => json({ success: true, data: brute() }),
  '/api/v1/social/posts': () => json({ success: true, data: [brute()] }),
};

describe('la porte de la story', () => {
  it('sert l’INVITATION sans un seul appel à la passerelle quand aucun jeton n’accompagne la demande', async () => {
    const jamais = passerelle({});
    const reponse = await lisLaStory({ requete: requete('/stories/s1'), id: 's1', recuperer: jamais.recuperer });

    expect(reponse.status).toBe(200);
    expect(jamais.appels).toEqual([]);
    expect(await reponse.text()).toContain('/login?returnUrl=%2Fstories%2Fs1');
  });

  it('sert l’INVITATION — jamais une erreur — quand la passerelle refuse le jeton', async () => {
    const monde = passerelle({ ...MONDE, '/api/v1/posts/s1': () => json({}, 401) });
    const reponse = await lisLaStory({ requete: requete('/stories/s1', AVEC_JETON), id: 's1', recuperer: monde.recuperer });

    expect(reponse.status).toBe(200);
    expect(await reponse.text()).toContain('/login?returnUrl=%2Fstories%2Fs1');
  });

  it('sert la story au lecteur connecté, dans sa langue', async () => {
    const monde = passerelle(MONDE);
    const reponse = await lisLaStory({
      requete: requete('/stories/s1', AVEC_JETON),
      id: 's1',
      recuperer: monde.recuperer,
      maintenant: MAINTENANT,
    });

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await reponse.text()).toContain('Trois graphiques');
  });

  /**
   * LE 404 EST INDISTINGUABLE (§ 5.1) : absente, supprimée, échue ou hors
   * audience rendent la MÊME réponse. Un 403 confirmerait l'existence.
   */
  it('rend la même réponse à une story absente et à une story échue', async () => {
    const absente = passerelle({ ...MONDE, '/api/v1/posts/s1': () => json({ success: false, error: 'Post not found' }, 404) });
    const echue = passerelle({ ...MONDE, '/api/v1/posts/s1': () => json({ success: true, data: brute({ expiresAt: '2026-01-01T00:00:00.000Z' }) }) });

    const premiere = await lisLaStory({ requete: requete('/stories/s1', AVEC_JETON), id: 's1', recuperer: absente.recuperer });
    const seconde = await lisLaStory({ requete: requete('/stories/s1', AVEC_JETON), id: 's1', recuperer: echue.recuperer });

    expect(premiere.status).toBe(404);
    expect(seconde.status).toBe(404);
    expect(await premiere.text()).toBe(await seconde.text());
    expect(documentIndisponible()).toContain(STORY.indisponible.titre);
  });

  it('dessine la panne quand la passerelle ne répond pas', async () => {
    const muette = {
      appels: [],
      recuperer: async (): Promise<Response> => {
        throw new Error('réseau');
      },
    };
    const reponse = await lisLaStory({ requete: requete('/stories/s1', AVEC_JETON), id: 's1', recuperer: muette.recuperer });
    expect(reponse.status).toBe(503);
  });

  it('demande la story ET le voisinage en UN aller-retour, jamais en deux', async () => {
    const monde = passerelle(MONDE);
    await lisLaStory({ requete: requete('/stories/s1', AVEC_JETON), id: 's1', recuperer: monde.recuperer });

    expect(monde.appels.map((appel) => appel.chemin).sort()).toEqual([
      '/api/v1/auth/me',
      '/api/v1/posts/s1',
      '/api/v1/social/posts?scope=stories&limit=50',
    ]);
  });
});

describe('ce qu’un formulaire de la story fait', () => {
  it('poste la réponse en COMMENTAIRE et revient par une redirection (Post/Redirect/Get)', async () => {
    const monde = passerelle({ ...MONDE, '/api/v1/posts/s1/comments': () => json({ success: true, data: { id: 'c1' } }, 201) });
    const reponse = await soumetsALaStory({
      requete: soumission('/stories/s1', { reponse: 'Hâte de voir ça.' }),
      id: 's1',
      recuperer: monde.recuperer,
    });

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/stories/s1?repondu=1');
    expect(monde.appels.at(-1)).toEqual({ methode: 'POST', chemin: '/api/v1/posts/s1/comments', corps: JSON.stringify({ content: 'Hâte de voir ça.' }) });
  });

  it('bascule l’aime par les DEUX routes que la passerelle expose', async () => {
    const pose = passerelle({ ...MONDE, '/api/v1/posts/s1/like': () => json({ success: true, data: {} }) });
    await soumetsALaStory({ requete: soumission('/stories/s1', { aime: '1' }), id: 's1', recuperer: pose.recuperer });
    expect(pose.appels.at(-1)?.methode).toBe('POST');

    const retire = passerelle({ ...MONDE, '/api/v1/posts/s1/like': () => json({ success: true, data: {} }) });
    await soumetsALaStory({ requete: soumission('/stories/s1', { aime: '0' }), id: 's1', recuperer: retire.recuperer });
    expect(retire.appels.at(-1)?.methode).toBe('DELETE');
  });

  it('refuse un formulaire venu d’un autre site, sans rien poster', async () => {
    const monde = passerelle(MONDE);
    const reponse = await soumetsALaStory({
      requete: soumission('/stories/s1', { reponse: 'Bonjour' }, { 'sec-fetch-site': 'cross-site' }),
      id: 's1',
      recuperer: monde.recuperer,
    });

    expect(monde.appels).toEqual([]);
    expect(await reponse.text()).toContain('Ce formulaire ne vient pas de Meeshy');
  });

  it('peint le refus de la passerelle avec le texte saisi, jamais perdu', async () => {
    const monde = passerelle({
      ...MONDE,
      '/api/v1/posts/s1/comments': () => json({ success: false, error: 'Invalid request' }, 400),
    });
    const reponse = await soumetsALaStory({
      requete: soumission('/stories/s1', { reponse: 'Bravo' }),
      id: 's1',
      recuperer: monde.recuperer,
      maintenant: MAINTENANT,
    });

    expect(reponse.status).toBe(400);
    const html = await reponse.text();
    expect(html).toContain('Bravo');
    expect(html).toContain(STORY.refuse);
  });

  it('renvoie à l’invitation quand la session a expiré entre la lecture et l’envoi', async () => {
    const monde = passerelle({ ...MONDE, '/api/v1/posts/s1/comments': () => json({}, 401) });
    const reponse = await soumetsALaStory({
      requete: soumission('/stories/s1', { reponse: 'Bravo' }),
      id: 's1',
      recuperer: monde.recuperer,
    });

    expect(await reponse.text()).toContain('/login?returnUrl=%2Fstories%2Fs1');
  });
});
