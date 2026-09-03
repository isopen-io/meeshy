/**
 * @jest-environment node
 */

import { lisLePartage, soumetsAuPartage } from '@/app/(public)/partage-porte';
import {
  documentDeLInvitation,
  documentDeLaStory,
  documentDuPartage,
  documentIndisponible,
  type EtatDeLaStory,
} from '@/app/(public)/partage-vue';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '@/lib/api/cookies';
import { GENRE_HUMEUR, GENRE_REEL, GENRE_STORY, type GenreServi } from '@/lib/contenu/partage';
import { partageLu, voisinage, type Story, type Voisine } from '@/lib/api/publication';
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
  // UNE DATE RELATIVE, ET C'EST UN CORRECTIF. Cette échéance était écrite en
  // absolu — `2026-09-03T05:00:00Z` —, donc vraie le jour où le témoin a été
  // écrit et FAUSSE à partir de 05:00 UTC le lendemain : `lisLePartage` lit
  // l'horloge RÉELLE (`porte.ts:100`), et la story se mettait à échoir pour de
  // bon. Deux témoins verts la veille rendaient 404 le jour même, sans qu'une
  // ligne du dépôt ait changé.
  //
  // Ce que le témoin veut dire est « une story qui n'a PAS échu », pas « une
  // story qui échoit à cinq heures » : il le dit désormais. Les deux épreuves
  // qui veulent l'inverse passent leur propre date, absolue et PASSÉE — un
  // repère qui, lui, ne peut pas se périmer.
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
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
  const story = partageLu({ genre: 'STORY', brut: brute(attributs), langues, langueDemandee, maintenant: MAINTENANT, origine: ORIGINE });
  if (story === null) throw new Error('story non lue');
  return story;
};

const etat = (story: Story, attributs: Partial<EtatDeLaStory> = {}): EtatDeLaStory => ({
  genre: GENRE_STORY,
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
    // `langueServie` porte la langue du texte AFFICHÉ, l'original compris —
    // c'est ce qui permet de poser `lang="en"` sur de l'anglais servi dans un
    // document français. « Rien n'est annoncé » se lit désormais sur l'égalité
    // avec `langueOriginale`, pas sur un `null` qui confondait deux questions.
    expect(story.langueServie).toBe(story.langueOriginale);
  });

  it('sert l’original quand aucune traduction ne matche', () => {
    const sansTraduction = lue({}, ['yo']);
    expect(sansTraduction.langueServie).toBe(sansTraduction.langueOriginale);
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
    // C'EST LE CAS QUE LE SÉLECTEUR DE LANGUE PRODUIT : le lecteur demande la
    // langue d'ORIGINE, et l'original est servi. Il doit porter son `lang=` —
    // sans quoi un document français ferait lire l'anglais à voix française.
    expect(story.langueServie).toBe('en');
  });

  it('retombe sur le prisme quand aucune traduction ne la porte — jamais un refus', () => {
    expect(lue({}, ['fr'], 'yo').langueServie).toBe('fr');
  });
});

// --- ce qui n'a pas le DROIT d'être là (cycle 124, § 5.1) --------------------

describe('une story que la v3 ne sert pas', () => {
  it('refuse une story ÉCHUE — le balayeur ne passe qu’après, le client filtre', () => {
    expect(
      partageLu({ genre: 'STORY',
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
      partageLu({ genre: 'STORY', brut: brute({ type: 'POST' }), langues: ['fr'], langueDemandee: null, maintenant: MAINTENANT, origine: ORIGINE }),
    ).toBeNull();
  });

  it('refuse une story supprimée', () => {
    expect(
      partageLu({ genre: 'STORY',
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

    // EN TOUTES LETTRES, ET EN FRANÇAIS. Ce témoin composait sa phrase depuis
    // `STORY.traduitDe('English')` — il suivait donc la source au lieu de la
    // juger, et serait resté vert sur « Traduit de English », qui n'est pas du
    // français. La langue se nomme dans la langue du document
    // (`lib/contenu/langues.ts`), et la phrase se décline.
    expect(html).toContain('Traduit de l’anglais');
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
  const html = documentDeLInvitation({ genre: GENRE_STORY, id: 's1' });

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

/**
 * **L'HORLOGE EST INJECTÉE, JAMAIS LUE.** Une story a une échéance : la porte
 * compare `expiresAt` à une horloge, et tant qu'elle lisait `Date.now()`, ces
 * témoins étaient datés — la suite a viré au rouge le 2026-09-03 à 05:00 UTC,
 * l'heure de la fixture, sur un code que personne n'avait touché.
 *
 * `MAINTENANT` est la MÊME horloge que celle des témoins de vue ci-dessus, si
 * bien que la fixture reste ABSOLUE des deux côtés. Rendre `expiresAt` relatif
 * (`Date.now() + 1 h`) aurait déplacé la pourriture d'un jour et fait dépendre
 * le verdict de l'ordre d'exécution : ce qu'on veut n'est pas une échéance qui
 * fuit devant l'horloge, c'est une horloge qui ne bouge pas.
 *
 * Les deux passe-plats existent pour qu'aucun site d'appel ne puisse l'oublier
 * — un témoin ajouté demain hériterait sinon du défaut d'aujourd'hui.
 */
const lisLa = (demande: Parameters<typeof lisLaStory>[0]): Promise<Response> =>
  lisLaStory({ maintenant: MAINTENANT, ...demande });

const soumetsA = (demande: Parameters<typeof soumetsALaStory>[0]): Promise<Response> =>
  soumetsALaStory({ maintenant: MAINTENANT, ...demande });

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
    const reponse = await lisLePartage({ genre: GENRE_STORY, requete: requete('/stories/s1'), id: 's1', recuperer: jamais.recuperer });

    expect(reponse.status).toBe(200);
    expect(jamais.appels).toEqual([]);
    expect(await reponse.text()).toContain('/login?returnUrl=%2Fstories%2Fs1');
  });

  it('sert l’INVITATION — jamais une erreur — quand la passerelle refuse le jeton', async () => {
    const monde = passerelle({ ...MONDE, '/api/v1/posts/s1': () => json({}, 401) });
    const reponse = await lisLePartage({ genre: GENRE_STORY, requete: requete('/stories/s1', AVEC_JETON), id: 's1', recuperer: monde.recuperer });

    expect(reponse.status).toBe(200);
    expect(await reponse.text()).toContain('/login?returnUrl=%2Fstories%2Fs1');
  });

  it('sert la story au lecteur connecté, dans sa langue', async () => {
    const monde = passerelle(MONDE);
    const reponse = await lisLePartage({
      genre: GENRE_STORY,
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

    const premiere = await lisLePartage({ genre: GENRE_STORY, requete: requete('/stories/s1', AVEC_JETON), id: 's1', recuperer: absente.recuperer });
    const seconde = await lisLePartage({ genre: GENRE_STORY, requete: requete('/stories/s1', AVEC_JETON), id: 's1', recuperer: echue.recuperer });

    expect(premiere.status).toBe(404);
    expect(seconde.status).toBe(404);
    expect(await premiere.text()).toBe(await seconde.text());
    expect(documentIndisponible(GENRE_STORY)).toContain(STORY.indisponible.titre);
  });

  /**
   * **L'ÉCHÉANCE SE MESURE À L'HORLOGE QU'ON DONNE À LA PORTE.** Une MÊME
   * fixture, deux horloges : vivante une minute avant, indisponible une minute
   * après. C'est le témoin qui ROUGIT si l'horloge redevient `Date.now()` —
   * celui de la story échue, lui, resterait vert (sa fixture est morte depuis
   * janvier, quelle que soit l'horloge).
   */
  it('lit l’échéance à l’horloge INJECTÉE, jamais à celle du jour où on la rejoue', async () => {
    const echeance = Date.parse('2026-09-03T05:00:00.000Z');
    // Fixture ABSOLUE et PROPRE à ce témoin — le `brute()` par défaut de `MONDE`
    // expire désormais un jour APRÈS l'instant réel du test (fixture relative,
    // § brute()), donc il ne peut plus servir à vérifier une échéance à une
    // date PRÉCISE : ce témoin fixe la sienne, comme le fait déjà « échue ».
    const monde = { ...MONDE, '/api/v1/posts/s1': () => json({ success: true, data: brute({ expiresAt: new Date(echeance).toISOString() }) }) };
    const avant = await lisLa({
      requete: requete('/stories/s1', AVEC_JETON),
      id: 's1',
      recuperer: passerelle(monde).recuperer,
      maintenant: echeance - 60_000,
    });
    const apres = await lisLa({
      requete: requete('/stories/s1', AVEC_JETON),
      id: 's1',
      recuperer: passerelle(monde).recuperer,
      maintenant: echeance + 60_000,
    });

    expect(avant.status).toBe(200);
    expect(apres.status).toBe(404);
  });

  it('dessine la panne quand la passerelle ne répond pas', async () => {
    const muette = {
      appels: [],
      recuperer: async (): Promise<Response> => {
        throw new Error('réseau');
      },
    };
    const reponse = await lisLePartage({ genre: GENRE_STORY, requete: requete('/stories/s1', AVEC_JETON), id: 's1', recuperer: muette.recuperer });
    expect(reponse.status).toBe(503);
  });

  it('demande la story ET le voisinage en UN aller-retour, jamais en deux', async () => {
    const monde = passerelle(MONDE);
    await lisLePartage({ genre: GENRE_STORY, requete: requete('/stories/s1', AVEC_JETON), id: 's1', recuperer: monde.recuperer });

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
    const reponse = await soumetsAuPartage({ genre: GENRE_STORY, requete: soumission('/stories/s1', { reponse: 'Hâte de voir ça.' }),
      id: 's1',
      recuperer: monde.recuperer,
    });

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/stories/s1?repondu=1');
    expect(monde.appels.at(-1)).toEqual({ methode: 'POST', chemin: '/api/v1/posts/s1/comments', corps: JSON.stringify({ content: 'Hâte de voir ça.' }) });
  });

  it('bascule l’aime par les DEUX routes que la passerelle expose', async () => {
    const pose = passerelle({ ...MONDE, '/api/v1/posts/s1/like': () => json({ success: true, data: {} }) });
    await soumetsAuPartage({ genre: GENRE_STORY, requete: soumission('/stories/s1', { aime: '1' }), id: 's1', recuperer: pose.recuperer });
    expect(pose.appels.at(-1)?.methode).toBe('POST');

    const retire = passerelle({ ...MONDE, '/api/v1/posts/s1/like': () => json({ success: true, data: {} }) });
    await soumetsAuPartage({ genre: GENRE_STORY, requete: soumission('/stories/s1', { aime: '0' }), id: 's1', recuperer: retire.recuperer });
    expect(retire.appels.at(-1)?.methode).toBe('DELETE');
  });

  it('refuse un formulaire venu d’un autre site, sans rien poster', async () => {
    const monde = passerelle(MONDE);
    const reponse = await soumetsAuPartage({ genre: GENRE_STORY, requete: soumission('/stories/s1', { reponse: 'Bonjour' }, { 'sec-fetch-site': 'cross-site' }),
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
    const reponse = await soumetsAuPartage({ genre: GENRE_STORY, requete: soumission('/stories/s1', { reponse: 'Bravo' }),
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
    const reponse = await soumetsAuPartage({ genre: GENRE_STORY, requete: soumission('/stories/s1', { reponse: 'Bravo' }),
      id: 's1',
      recuperer: monde.recuperer,
    });

    expect(await reponse.text()).toContain('/login?returnUrl=%2Fstories%2Fs1');
  });
});

/**
 * LES DEUX AUTRES GENRES — le réel et l'humeur, servis par le MÊME lecteur.
 *
 * Ces témoins ne rejouent PAS ce que la story prouve déjà : la descente du
 * Prisme, le `404` indistinguable, l'invitation sans appel sont éprouvés
 * au-dessus, sur un chemin de code qui est désormais littéralement le même.
 * Ce qu'ils gardent est ce que le partage du lecteur pourrait CASSER — et qui
 * ne se verrait nulle part ailleurs :
 *
 *   1. le genre est un VERROU, pas une étiquette : demander un réel sur
 *      l'adresse d'une humeur rend INTROUVABLE, sinon `/moods/:id` servirait
 *      n'importe quelle publication à qui en devine l'identifiant ;
 *   2. le vocabulaire suit le genre — un réel ne dit jamais « story » ;
 *   3. les adresses composées (`?lang=`, la cible du formulaire) portent la
 *      base du genre, sans quoi répondre à un réel posterait vers une story ;
 *   4. la barre de segments n'existe QUE là où l'on se déplace.
 */
describe('un réel et une humeur, servis par le lecteur de la story', () => {
  const luAvecGenre = (genre: GenreServi, type: string): Story | null =>
    partageLu({
      genre: genre.type,
      brut: brute({ type }),
      langues: ['fr'],
      langueDemandee: null,
      maintenant: MAINTENANT,
      origine: ORIGINE,
    });

  it.each([
    [GENRE_REEL, 'REEL'],
    [GENRE_HUMEUR, 'STATUS'],
  ])('lit le genre qu’on lui demande (%#)', (genre, type) => {
    expect(luAvecGenre(genre, type)).not.toBeNull();
  });

  it.each([
    [GENRE_REEL, 'STATUS'],
    [GENRE_HUMEUR, 'REEL'],
    [GENRE_REEL, 'STORY'],
    [GENRE_HUMEUR, 'POST'],
  ])('REFUSE tout autre genre — un verrou, pas une étiquette (%#)', (genre, type) => {
    expect(luAvecGenre(genre, type)).toBeNull();
  });

  it('dit « réel », jamais « story » — et compose ses adresses sur SA base', () => {
    const reel = luAvecGenre(GENRE_REEL, 'REEL');
    if (reel === null) throw new Error('le réel devait se lire');

    const html = documentDuPartage({ ...etat(reel), genre: GENRE_REEL });

    expect(html).toContain('Réel de Ibrahim');
    expect(html).toContain('href="/reels/s1?lang=en"');
    expect(html).toContain('action="/reels/s1"');
    // Le vocabulaire de la story n'a pas fui avec le lecteur.
    expect(html).not.toContain('Story de');
    expect(html).not.toContain('/stories/s1');
  });

  it('ne pose AUCUNE barre de segments — un réel et une humeur se lisent seuls', () => {
    const humeur = luAvecGenre(GENRE_HUMEUR, 'STATUS');
    if (humeur === null) throw new Error('l’humeur devait se lire');

    expect(documentDuPartage({ ...etat(humeur), genre: GENRE_HUMEUR })).not.toContain('class="segments"');
    // La story, elle, la garde : c'est le seul genre qui se PARCOURT.
    expect(documentDuPartage(etat(lue()))).toContain('class="segments"');
  });
});

