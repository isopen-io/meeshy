/**
 * @jest-environment node
 */

import { GET, POST } from '@/app/chats/[cle]/route';
import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { adresseDeLaFeuilleDeLien, adresseDuLienCree } from '@/lib/api/adresses-du-fil';
import { feuilleDeLienDemandee, lienCreeDemande } from '@/app/connecte/fil-porte';
import { saisieDuFil } from '@/app/connecte/nouveau-lien-vue';
import { NOUVEAU_LIEN } from '@/lib/contenu/liens';

/**
 * `sheet:link` DEPUIS LE FIL (#5034) — la même feuille que `/links`
 * (`nouveau-lien.test.ts`), la conversation déjà choisie. Ces témoins
 * éprouvent les trois décisions du critère de fin :
 *
 *   • le champ « conversation » est PRÉREMPLI et NON MODIFIABLE — un `<input
 *     type="hidden">`, jamais l'`<input id="l-conversation">` éditable ;
 *   • la porte poste `conversationId=<cle>` — CELLE DES PARAMS, jamais
 *     `newConversation` ni le contenu d'un champ caché forgé à la main ;
 *   • un refus RE-SERT LE FIL avec la saisie tenue, jamais une redirection.
 */

const CLE = '68f2a81417a557e8ce4ddfbb';
const TITRE = 'Équipe Lagos';

const FIL: EtatDuFil['fil'] = {
  id: CLE,
  titre: TITRE,
  membres: 4,
  presence: { participants: [], presents: [] },
  messages: [],
  plusAncien: null,
};

const TEMPS_REEL: EtatDuFil['tempsReel'] = {
  passerelle: 'https://gate.test',
  actifs: {
    participate: { nom: 'participate.abc.js', url: '/__v3/rt/participate.abc.js', corps: '' },
    liste: { nom: 'liste.abc.js', url: '/__v3/rt/liste.abc.js', corps: '' },
    feed: { nom: 'feed.abc.js', url: '/__v3/rt/feed.abc.js', corps: '' },
    notifs: { nom: 'notifs.f.js', url: '/__v3/rt/notifs.f.js', corps: '' },
    contacts: { nom: 'contacts.f.js', url: '/__v3/rt/contacts.f.js', corps: '' },
    recherche: { nom: 'recherche.f.js', url: '/__v3/rt/recherche.f.js', corps: '' },
    liens: { nom: 'liens.f.js', url: '/__v3/rt/liens.f.js', corps: '' },
    commentaires: { nom: 'commentaires.f.js', url: '/__v3/rt/commentaires.f.js', corps: '' },
    plein: { nom: 'plein.f.js', url: '/__v3/rt/plein.f.js', corps: '' },
    navigateur: { nom: 'navigateur.f.js', url: '/__v3/rt/navigateur.f.js', corps: '' },
    composer: { nom: 'composer.f.js', url: '/__v3/rt/composer.f.js', corps: '' },
    socket: { nom: 'socket.io.def.js', url: '/__v3/rt/socket.io.def.js', corps: '' },
  },
};

const ETAT = (attributs: Partial<EtatDuFil> = {}): EtatDuFil => ({
  porte: { genre: 'membre', cle: CLE },
  fil: FIL,
  lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
  erreur: null,
  brouillon: '',
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  composeur: { genre: 'ouvert' },
  tempsReel: null,
  contexte: null,
  plein: null,
  profil: null,
  ...attributs,
});

const PORTE_INVITEE: EtatDuFil['porte'] = {
  genre: 'invite',
  lien: 'mshy_lagos' as never,
  segment: 'lagos-q1',
  pseudo: 'Tolu',
  droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true },
  jonctionFraiche: false,
};

describe('la puce « Lien » de l’en-tête (§ 12.10.5, #5034)', () => {
  it('est rendue au membre, mène à l’état ?lien, avec son libellé', () => {
    const doc = documentDuFil(ETAT());
    expect(doc).toContain(`<a class="partager" href="/chats/${CLE}?lien" aria-label="${NOUVEAU_LIEN.depuisLeFil}"`);
  });

  it('n’est PAS rendue à l’invité', () => {
    const doc = documentDuFil(ETAT({ porte: PORTE_INVITEE, fil: { ...FIL, id: 'c-lien' } }));
    expect(doc).not.toContain('class="partager"');
  });
});

describe('la feuille « nouveau lien » ouverte sur le fil', () => {
  const SAISIE = saisieDuFil(CLE, TITRE);

  it('s’ouvre dans l’état `lien`, ancrée sur l’adresse du fil, avec le sous-titre de la conversation', () => {
    const doc = documentDuFil(ETAT({ lien: { saisie: SAISIE, motif: null } }));
    expect(doc).toContain(`<dialog class="nouveau-lien" open aria-modal="true" aria-labelledby="titre-du-lien" data-retour="/chats/${CLE}">`);
    // Croix, voile, poignée : les trois chemins de fermeture mènent au fil.
    expect((doc.match(new RegExp(`href="/chats/${CLE}"`, 'g')) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(doc).toContain(`<form method="post" action="/chats/${CLE}">`);
    expect(doc).toContain(NOUVEAU_LIEN.pour(TITRE));
  });

  it('porte la conversation PRÉREMPLIE et NON MODIFIABLE — un champ caché, jamais le champ éditable', () => {
    const doc = documentDuFil(ETAT({ lien: { saisie: SAISIE, motif: null } }));
    expect(doc).toContain(`<input type="hidden" name="conversation" value="${CLE}">`);
    expect(doc).not.toContain('id="l-conversation"');
  });

  it('porte le marqueur qui identifie ce formulaire pour la porte du fil', () => {
    const doc = documentDuFil(ETAT({ lien: { saisie: SAISIE, motif: null } }));
    expect(doc).toContain('<input type="hidden" name="nouveau-lien" value="1">');
  });

  it('prérempli le nom du lien du titre de la conversation', () => {
    const doc = documentDuFil(ETAT({ lien: { saisie: SAISIE, motif: null } }));
    expect(doc).toContain(`id="l-nom" name="nom" type="text" value="${TITRE}"`);
  });

  it('ne sert la feuille (ni son style) que dans l’état demandé', () => {
    const doc = documentDuFil(ETAT());
    expect(doc).not.toContain('<dialog class="nouveau-lien"');
    expect(doc).not.toContain('nouveau-lien{');
  });

  it('rend le motif d’un refus en alerte, et REPOSE la saisie', () => {
    const saisie = { ...SAISIE, nom: 'Voisins', permissions: new Set(['allowViewHistory']) };
    const doc = documentDuFil(ETAT({ lien: { saisie, motif: 'Cette conversation est terminée' } }));
    expect(doc).toContain('role="alert"');
    expect(doc).toContain('Cette conversation est terminée');
    expect(doc).toContain('value="Voisins"');
    expect(doc).toMatch(/name="allowViewHistory"[^>]*checked/);
    expect(doc).not.toMatch(/name="allowAnonymousFiles"[^>]*checked/);
  });

  it('l’INVITÉ ne rend JAMAIS la feuille, même avec l’état posé (fail-closed dans la vue)', () => {
    const doc = documentDuFil(
      ETAT({ porte: PORTE_INVITEE, fil: { ...FIL, id: 'c-lien' }, lien: { saisie: SAISIE, motif: null } }),
    );
    expect(doc).not.toContain('<dialog class="nouveau-lien"');
  });
});

describe('une seule surimpression à la fois — profil > lien > plein écran', () => {
  const PROFIL = { handle: 'p2', servi: { genre: 'introuvable' as const }, confirmerBlocage: false };

  it('profil ET lien à la fois ⇒ seul le profil est rendu', () => {
    const doc = documentDuFil(ETAT({ profil: PROFIL, lien: { saisie: saisieDuFil(CLE, TITRE), motif: null } }));
    expect(doc).not.toContain('<dialog class="nouveau-lien"');
    expect(doc).toContain('class="profil"');
  });
});

describe('l’avis « lien créé »', () => {
  it('sert l’adresse quand un lien vient d’être créé, adressable et copiable', () => {
    const doc = documentDuFil(ETAT({ tempsReel: TEMPS_REEL, lienCree: 'mshy_x' }));
    expect(doc).toContain('<p class="avis lien-cree" id="lien-cree" role="status">');
    expect(doc).toContain(NOUVEAU_LIEN.cree);
    expect(doc).toContain('<span class="adresse">');
  });

  it('sert une fente MUETTE quand le temps réel est armé mais qu’aucun lien n’a encore été créé', () => {
    const doc = documentDuFil(ETAT({ tempsReel: TEMPS_REEL }));
    expect(doc).toContain('<p class="avis lien-cree" id="lien-cree" role="status" hidden></p>');
  });

  it('est ABSENTE sur une lecture pure, sans module pour jamais y écrire', () => {
    const doc = documentDuFil(ETAT());
    expect(doc).not.toContain('id="lien-cree"');
  });
});

describe('les adresses de la feuille (lib/api/adresses-du-fil.ts)', () => {
  it('ouvre la feuille par ?lien, et lit son état', () => {
    expect(adresseDeLaFeuilleDeLien(`/chats/${CLE}`)).toBe(`/chats/${CLE}?lien`);
    expect(feuilleDeLienDemandee(new Request(`https://meeshy.test/chats/${CLE}?lien`))).toBe(true);
    expect(feuilleDeLienDemandee(new Request(`https://meeshy.test/chats/${CLE}`))).toBe(false);
  });

  it('porte le lien créé par ?cree=<identifiant>, et le lit', () => {
    expect(adresseDuLienCree(`/chats/${CLE}`, 'mshy_x')).toBe(`/chats/${CLE}?cree=mshy_x`);
    expect(lienCreeDemande(new Request(`https://meeshy.test/chats/${CLE}?cree=mshy_x`))).toBe('mshy_x');
    expect(lienCreeDemande(new Request(`https://meeshy.test/chats/${CLE}`))).toBeNull();
  });
});

/**
 * LA PORTE DU FIL — POST `/chats/:cle` reconnaissant le formulaire de la
 * feuille (`nouveau-lien=1`). Harnais calqué sur `fil.test.ts` § « l'envoi
 * d'un message » : `GET`/`POST` n'acceptent aucun `recuperer`, ils lisent
 * `globalThis.fetch` — bouchonné ici par CHEMIN.
 */
describe('la porte du fil — créer un lien de partage (§ 12.10.5, #5034)', () => {
  const contexte = { params: Promise.resolve({ cle: CLE }) };
  const COOKIE = 'meeshy_auth=JWT';

  const conversationServie = { success: true, data: { id: CLE, title: TITRE, memberCount: 4, participants: [] } };
  const messagesServis = { success: true, data: [], cursorPagination: { hasMore: false, nextCursor: null } };
  const moiServi = { success: true, data: { id: 'u1', displayName: 'Amina' } };

  /** Le dispatcheur générique : chaque test ne fournit que ce qui le distingue (la réponse POST /links). */
  const bouchon = (reponseDesLiens: (init: RequestInit) => Response) => {
    const vus: { readonly url: string; readonly methode: string; readonly corps: string | null }[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
      const cible = String(url);
      vus.push({ url: cible, methode: String(init.method ?? 'GET'), corps: typeof init.body === 'string' ? init.body : null });
      if (cible.includes('/api/v1/links')) return reponseDesLiens(init);
      if (cible.includes('/auth/me')) return new Response(JSON.stringify(moiServi));
      if (cible.includes('/messages')) return new Response(JSON.stringify(messagesServis));
      if (cible.includes('/api/v1/conversations/')) return new Response(JSON.stringify(conversationServie));
      throw new Error(`route non bouchonnée : ${cible}`);
    }) as typeof fetch;
    return vus;
  };

  const posteLaFeuille = (champs: Readonly<Record<string, string>> = {}) =>
    new Request(`https://meeshy.me/chats/${CLE}`, {
      method: 'POST',
      body: new URLSearchParams({ 'nouveau-lien': '1', conversation: CLE, nom: TITRE, echeance: 'semaine', allowAnonymousMessages: '1', ...champs }),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: COOKIE },
    });

  const corpsSoumis = (vus: readonly { corps: string | null; methode: string; url: string }[]): Record<string, unknown> => {
    const appel = vus.find(({ url, methode }) => url.includes('/api/v1/links') && methode === 'POST');
    return JSON.parse(appel?.corps ?? '{}') as Record<string, unknown>;
  };

  afterEach(() => {
    // @ts-expect-error — nettoyage entre témoins, le harnais suivant repose le sien.
    delete globalThis.fetch;
  });

  it('poste conversationId=<cle DES PARAMS>, jamais newConversation, jamais le champ caché', async () => {
    const vus = bouchon(() => new Response(JSON.stringify({ success: true, data: { linkId: 'mshy_x', conversationId: CLE } }), { status: 201 }));

    await POST(posteLaFeuille({ conversation: 'un-autre-id-force-a-la-main' }), contexte);

    const corps = corpsSoumis(vus);
    expect(corps.conversationId).toBe(CLE);
    expect(corps.newConversation).toBeUndefined();
  });

  it('envoie l’échéance calculée et les droits anonymes tels que cochés, aucun champ décoratif', async () => {
    const vus = bouchon(() => new Response(JSON.stringify({ success: true, data: { linkId: 'mshy_x', conversationId: CLE } }), { status: 201 }));

    await POST(posteLaFeuille({ nom: 'Voisins', allowViewHistory: '1' }), contexte);

    const corps = corpsSoumis(vus);
    expect(Object.keys(corps).sort()).toEqual([
      'allowAnonymousFiles',
      'allowAnonymousImages',
      'allowAnonymousMessages',
      'allowViewHistory',
      'conversationId',
      'expiresAt',
      'name',
      'requireNickname',
    ]);
    expect(corps.allowAnonymousMessages).toBe(true);
    expect(corps.allowAnonymousFiles).toBe(false);
    expect(corps.allowViewHistory).toBe(true);
    expect(corps.requireNickname).toBe(false);
  });

  it('succès ⇒ 303 vers /chats/:cle?cree=<identifiant>, sans GET /api/v1/links', async () => {
    const vus = bouchon(() => new Response(JSON.stringify({ success: true, data: { linkId: 'mshy_x', conversationId: CLE } }), { status: 201 }));

    const reponse = await POST(posteLaFeuille(), contexte);

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe(`/chats/${CLE}?cree=mshy_x`);
    expect(vus.some((v) => v.url.includes('/api/v1/links') && v.methode === 'GET')).toBe(false);
  });

  it('refus 400 du bouchon ⇒ 422, feuille RE-SERVIE SUR LE FIL, saisie tenue — jamais une redirection', async () => {
    const vus = bouchon(() => new Response(JSON.stringify({ success: false, error: { message: 'Cette conversation est terminée' } }), { status: 400 }));

    const reponse = await POST(posteLaFeuille({ nom: 'Voisins', allowViewHistory: '1' }), contexte);
    const html = await reponse.text();

    expect(reponse.status).toBe(422);
    expect(html).toContain('class="fil-ecran"');
    expect(html).toContain('<dialog class="nouveau-lien"');
    expect(html).toContain('Cette conversation est terminée');
    expect(html).toContain('value="Voisins"');
    expect(html).toMatch(/name="allowViewHistory"[^>]*checked/);
    expect(vus.filter((v) => v.url.includes('/api/v1/links')).length).toBe(1);
  });

  it('panne (fetch en échec) ⇒ 503, feuille re-servie', async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes('/api/v1/links')) throw new Error('ECONNRESET');
      if (String(url).includes('/auth/me')) return new Response(JSON.stringify(moiServi));
      if (String(url).includes('/messages')) return new Response(JSON.stringify(messagesServis));
      return new Response(JSON.stringify(conversationServie));
    }) as typeof fetch;

    const reponse = await POST(posteLaFeuille(), contexte);
    expect(reponse.status).toBe(503);
    expect(await reponse.text()).toContain('<dialog class="nouveau-lien"');
  });

  it('401 de la passerelle ⇒ session expirée, retour à la connexion', async () => {
    bouchon(() => new Response(JSON.stringify({ success: false, error: 'Invalid JWT' }), { status: 401 }));

    const reponse = await POST(posteLaFeuille(), contexte);
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe(`/login?returnUrl=${encodeURIComponent(`/chats/${CLE}`)}`);
  });

  it('origine étrangère ⇒ 403 AVANT tout appel', async () => {
    const vus = bouchon(() => new Response(JSON.stringify({ success: true, data: { linkId: 'mshy_x', conversationId: CLE } }), { status: 201 }));

    const reponse = await POST(
      new Request(`https://meeshy.me/chats/${CLE}`, {
        method: 'POST',
        body: new URLSearchParams({ 'nouveau-lien': '1', conversation: CLE }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: COOKIE, 'sec-fetch-site': 'cross-site' },
      }),
      contexte,
    );

    expect(reponse.status).toBe(403);
    expect(vus).toEqual([]);
  });

  it('un formulaire du composeur (texte=…) n’est pas pris pour la feuille', async () => {
    const vus = bouchon(() => new Response(JSON.stringify({ success: true, data: { linkId: 'mshy_x', conversationId: CLE } }), { status: 201 }));

    await POST(
      new Request(`https://meeshy.me/chats/${CLE}`, {
        method: 'POST',
        body: new URLSearchParams({ texte: 'Bonjour' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: COOKIE },
      }),
      contexte,
    );

    expect(vus.some((v) => v.url.includes('/api/v1/links'))).toBe(false);
  });

  it('GET /chats/:cle?lien rend la feuille, sans requête de plus que /chats/:cle', async () => {
    const vusOrdinaire: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      const cible = String(url);
      vusOrdinaire.push(cible);
      if (cible.includes('/auth/me')) return new Response(JSON.stringify(moiServi));
      if (cible.includes('/messages')) return new Response(JSON.stringify(messagesServis));
      return new Response(JSON.stringify(conversationServie));
    }) as typeof fetch;

    const sansEtat = await GET(new Request(`https://meeshy.me/chats/${CLE}`, { headers: { cookie: COOKIE } }), contexte);
    await sansEtat.text();
    const requetesOrdinaire = vusOrdinaire.length;

    vusOrdinaire.length = 0;
    const avecEtat = await GET(new Request(`https://meeshy.me/chats/${CLE}?lien`, { headers: { cookie: COOKIE } }), contexte);
    const html = await avecEtat.text();

    expect(html).toContain('<dialog class="nouveau-lien"');
    expect(vusOrdinaire.length).toBe(requetesOrdinaire);
  });
});
