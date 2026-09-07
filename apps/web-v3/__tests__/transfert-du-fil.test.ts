/**
 * @jest-environment node
 */

import { GET, POST } from '@/app/chats/[cle]/route';
import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import {
  ciblesDeTransfert,
  resoutLeTransfert,
  soumissionDuFil,
  transfertDemande,
  traiteLaSoumission,
} from '@/app/connecte/fil-porte';
import { adresseDeTransfert, PARAM_DU_TRANSFERT } from '@/lib/api/adresses-du-fil';
import { message, type Message } from '@/lib/api/fil';
import { peutTransferer } from '@/lib/api/fil-mutations';
import { FIL as COPIE } from '@/lib/contenu/fil';

/**
 * TRANSFÉRER UN MESSAGE VERS UNE AUTRE CONVERSATION (#5386).
 *
 * Le critère de fin : depuis le menu du message, choisir une conversation
 * cible et transférer — la provenance voyage comme en legacy
 * (`forward-message-modal.tsx`) ; le sélecteur est servi (chemin pauvre,
 * sans JavaScript) ; le Prisme s'applique à l'aperçu des conversations du
 * sélecteur.
 */

const ORIGINE = 'https://gate.test';

const rendu = (attributs: Record<string, unknown> = {}, moi = 'u1'): Message => {
  const resultat = message(
    {
      id: 'm1',
      content: 'On se voit demain ?',
      originalLanguage: 'fr',
      createdAt: '2026-09-01T12:00:00.000Z',
      senderId: 'u2',
      sender: { id: 'u2', displayName: 'Marta' },
      ...attributs,
    },
    moi,
    ['fr'],
    ORIGINE,
  );
  if (resultat === null) throw new Error('message non lu');
  return resultat;
};

describe('l’adresse de la feuille (lib/api/adresses-du-fil.ts)', () => {
  it('ouvre la feuille par ?transferer=<id>, et lit son état', () => {
    expect(adresseDeTransfert('/chats/c1', 'm1')).toBe('/chats/c1?transferer=m1');
    expect(transfertDemande(new Request('https://meeshy.test/chats/c1?transferer=m1'))).toBe('m1');
    expect(transfertDemande(new Request('https://meeshy.test/chats/c1'))).toBeNull();
  });

  it('PARAM_DU_TRANSFERT est le nom du paramètre — un état de plus de la même adresse', () => {
    expect(PARAM_DU_TRANSFERT).toBe('transferer');
  });
});

describe('peutTransferer (lib/api/fil-mutations.ts) — tout message lisible, jamais réservé à son auteur', () => {
  it('admet un message d’autrui, ancien, sans condition d’heure', () => {
    expect(peutTransferer({ systeme: false, supprime: false, protege: false })).toBe(true);
  });

  it.each([
    ['systeme', { systeme: true, supprime: false, protege: false }],
    ['supprime', { systeme: false, supprime: true, protege: false }],
    ['protege', { systeme: false, supprime: false, protege: true }],
  ])('refuse un message %s', (_nom, candidat) => {
    expect(peutTransferer(candidat)).toBe(false);
  });
});

describe('resoutLeTransfert (app/connecte/fil-porte.ts) — résolu contre ce qui est SERVI', () => {
  const FIL: EtatDuFil['fil'] = { id: 'c1', titre: 'T', membres: 2, presence: { participants: [], presents: [] }, messages: [rendu()], plusAncien: null };

  it('rend le message quand il est présent et transférable', () => {
    expect(resoutLeTransfert({ idTransfert: 'm1', fil: FIL, estInvite: false })).toEqual(rendu());
  });

  it('rend null quand aucun identifiant n’est demandé', () => {
    expect(resoutLeTransfert({ idTransfert: null, fil: FIL, estInvite: false })).toBeNull();
  });

  it('rend null pour un identifiant absent de la tranche — jamais un identifiant deviné', () => {
    expect(resoutLeTransfert({ idTransfert: 'introuvable', fil: FIL, estInvite: false })).toBeNull();
  });

  it('rend null pour un message protégé', () => {
    const filProtege: EtatDuFil['fil'] = { ...FIL, messages: [rendu({ isViewOnce: true, viewOnceViewedAt: null })] };
    expect(resoutLeTransfert({ idTransfert: 'm1', fil: filProtege, estInvite: false })).toBeNull();
  });

  it('rend null pour un INVITÉ — fail-closed, aucune liste de conversations où transférer', () => {
    expect(resoutLeTransfert({ idTransfert: 'm1', fil: FIL, estInvite: true })).toBeNull();
  });
});

describe('ciblesDeTransfert (app/connecte/fil-porte.ts)', () => {
  it('écarte la conversation qu’on quitte et les conversations archivées, applique la limite', async () => {
    const cibles = await ciblesDeTransfert({
      jeton: 'J',
      depuis: 'c1',
      recuperer: async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: [
              { id: 'c1', title: 'Celle qu’on quitte' },
              { id: 'c2', title: 'Équipe Lagos' },
              { id: 'c3', title: 'Archivée', userPreferences: [{ isArchived: true }] },
            ],
          }),
        ),
    });
    expect(cibles.map((c) => c.id)).toEqual(['c2']);
  });

  it('rend une liste vide sur une session expirée ou une panne', async () => {
    const cibles = await ciblesDeTransfert({ jeton: 'J', depuis: 'c1', recuperer: async () => new Response('{}', { status: 401 }) });
    expect(cibles).toEqual([]);
  });
});

describe('soumissionDuFil — le genre `transfert` (app/connecte/fil-porte.ts)', () => {
  const formulaire = (champs: Record<string, string>): FormData => {
    const f = new FormData();
    for (const [nom, valeur] of Object.entries(champs)) f.set(nom, valeur);
    return f;
  };

  it('reconnaît transferer + vers, avec texte et langue', () => {
    const soumission = soumissionDuFil(formulaire({ transferer: 'm1', vers: 'c2', texte: 'On se voit demain ?', langue: 'fr' }));
    expect(soumission).toEqual({ genre: 'transfert', messageId: 'm1', versConversation: 'c2', texte: 'On se voit demain ?', langue: 'fr' });
  });

  it('langue absente ⇒ null, jamais une chaîne vide', () => {
    const soumission = soumissionDuFil(formulaire({ transferer: 'm1', vers: 'c2', texte: 'Salut' }));
    expect(soumission).toEqual({ genre: 'transfert', messageId: 'm1', versConversation: 'c2', texte: 'Salut', langue: null });
  });

  it('transferer SANS vers ne se lit pas comme un transfert — retombe sur le message générique', () => {
    const soumission = soumissionDuFil(formulaire({ transferer: 'm1' }));
    expect(soumission.genre).not.toBe('transfert');
  });

  it('priorité au-dessus de modifier/reponse — un formulaire ne porte qu’UN genre à la fois', () => {
    const soumission = soumissionDuFil(formulaire({ transferer: 'm1', vers: 'c2', texte: 'x', modifie: 'm1' }));
    expect(soumission.genre).toBe('transfert');
  });
});

describe('traiteLaSoumission — transférer refuse l’invité (fail-closed, #5386)', () => {
  it('un invité ne transfère jamais, même avec un formulaire valide — aucune requête ne part', async () => {
    const original = globalThis.fetch;
    const appels: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      appels.push(String(url));
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    try {
      const issue = await traiteLaSoumission({
        soumission: { genre: 'transfert', messageId: 'm1', versConversation: 'c2', texte: 'x', langue: null },
        creance: { genre: 'invite', jeton: 'J' },
        conversation: 'c1',
        adresse: '/chats/c1',
      });
      expect(issue).toEqual({ genre: 'erreur', message: COPIE.refuse, brouillon: '', statut: 403 });
      expect(appels).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('le menu d’une ligne — « Transférer » (fil-lignes.ts, via documentDuFil)', () => {
  const FIL_MEMBRE: EtatDuFil['fil'] = { id: 'c1', titre: 'T', membres: 2, presence: { participants: [], presents: [] }, messages: [rendu()], plusAncien: null };

  const etat = (attributs: Partial<EtatDuFil> = {}): EtatDuFil => ({
    porte: { genre: 'membre', cle: 'c1' },
    fil: FIL_MEMBRE,
    lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
    erreur: null,
    brouillon: '',
    maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
    composeur: { genre: 'ouvert' },
    contexte: null,
    tempsReel: null,
    plein: null,
    profil: null,
    ...attributs,
  });

  it('ouvre ?transferer=<id>, avec son libellé', () => {
    const doc = documentDuFil(etat());
    expect(doc).toContain(`name="transferer" value="m1"`);
    expect(doc).toContain(COPIE.transferer);
  });

  it('se rend sur un message d’AUTRUI (pas seulement les siens)', () => {
    const filAutrui: EtatDuFil['fil'] = { ...FIL_MEMBRE, messages: [rendu({}, 'quelqu-autre')] };
    const doc = documentDuFil(etat({ fil: filAutrui }));
    expect(doc).toContain('name="transferer" value="m1"');
  });

  it('ne se rend pas sur un message système, supprimé ou protégé', () => {
    const supprime = rendu({ deletedAt: '2026-09-01T13:00:00.000Z' });
    const doc = documentDuFil(etat({ fil: { ...FIL_MEMBRE, messages: [supprime] } }));
    // Le gabarit cloné par le module porte `value=""` en permanence — seule
    // une VALEUR non vide dirait qu'une ligne SERVIE offre le geste.
    expect(doc).not.toContain('name="transferer" value="m1"');
  });
});

describe('la feuille « transférer le message » ouverte sur le fil', () => {
  const FIL_MEMBRE: EtatDuFil['fil'] = { id: 'c1', titre: 'T', membres: 2, presence: { participants: [], presents: [] }, messages: [rendu()], plusAncien: null };
  const CIBLE = { id: 'c2', identifiant: null, titre: 'Équipe Lagos', genre: 'group', membres: 4, nonLus: 0, dernierMessageA: null, apercu: null, apercuTraductions: null, apercuLangueOriginale: null, sourdine: false, archivee: false, participantsInscrits: [] };

  const etat = (attributs: Partial<EtatDuFil> = {}): EtatDuFil => ({
    porte: { genre: 'membre', cle: 'c1' },
    fil: FIL_MEMBRE,
    lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
    erreur: null,
    brouillon: '',
    maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
    composeur: { genre: 'ouvert' },
    contexte: null,
    tempsReel: null,
    plein: null,
    profil: null,
    ...attributs,
  });

  it('s’ouvre dans l’état `transfert`, ancrée sur l’adresse du fil', () => {
    const doc = documentDuFil(etat({ transfert: { message: rendu(), conversations: [CIBLE], motif: null } }));
    expect(doc).toContain('<dialog class="transfert" open aria-modal="true" aria-labelledby="titre-du-transfert" data-retour="/chats/c1">');
    expect(doc).toContain(`<form method="post" action="/chats/c1">`);
    expect((doc.match(/href="\/chats\/c1"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('porte le message à transférer en champs cachés, un SEUL exemplaire quel que soit le nombre de cibles', () => {
    const doc = documentDuFil(etat({ transfert: { message: rendu(), conversations: [CIBLE, { ...CIBLE, id: 'c3', titre: 'Voisins' }], motif: null } }));
    expect((doc.match(/name="texte" value="On se voit demain \?"/g) ?? []).length).toBe(1);
    expect(doc).toContain('name="transferer" value="m1"');
    expect(doc).toContain('name="langue" value="fr"');
  });

  it('un bouton par cible, nommé "vers", avec le nom de la conversation', () => {
    const doc = documentDuFil(etat({ transfert: { message: rendu(), conversations: [CIBLE], motif: null } }));
    expect(doc).toContain('name="vers" value="c2"');
    expect(doc).toContain('Équipe Lagos');
  });

  it('le Prisme s’applique à l’aperçu de chaque cible', () => {
    const cibleTraduite = {
      ...CIBLE,
      apercu: 'Thanks, see you then',
      apercuTraductions: { fr: 'Merci, à demain' },
      apercuLangueOriginale: 'en',
    };
    const doc = documentDuFil(etat({ transfert: { message: rendu(), conversations: [cibleTraduite], motif: null } }));
    expect(doc).toContain('Merci, à demain');
    expect(doc).not.toContain('Thanks, see you then');
  });

  it('aucune conversation cible ⇒ un état vide, jamais un formulaire sans bouton', () => {
    const doc = documentDuFil(etat({ transfert: { message: rendu(), conversations: [], motif: null } }));
    expect(doc).toContain(COPIE.aucuneAutreConversation);
    expect(doc).not.toContain('class="cibles"');
  });

  it('rend le motif d’un refus déjà servi', () => {
    const doc = documentDuFil(etat({ transfert: { message: rendu(), conversations: [CIBLE], motif: 'Vous n’êtes plus membre de cette conversation' } }));
    expect(doc).toContain('role="alert"');
    expect(doc).toContain('Vous n’êtes plus membre de cette conversation');
  });

  it('ne sert la feuille (ni son style) que dans l’état demandé', () => {
    const doc = documentDuFil(etat());
    expect(doc).not.toContain('<dialog class="transfert"');
    expect(doc).not.toContain('dialog.transfert{');
  });

  it('l’INVITÉ ne rend JAMAIS la feuille, même avec l’état posé (fail-closed dans la vue)', () => {
    const porteInvitee: EtatDuFil['porte'] = {
      genre: 'invite',
      lien: 'mshy_lagos' as never,
      segment: 'lagos-q1',
      pseudo: 'Tolu',
      droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true },
      jonctionFraiche: false,
    };
    const doc = documentDuFil(etat({ porte: porteInvitee, fil: { ...FIL_MEMBRE, id: 'c-lien' }, transfert: { message: rendu(), conversations: [CIBLE], motif: null } }));
    expect(doc).not.toContain('<dialog class="transfert"');
  });

  it('une seule surimpression à la fois — lien et transfert ⇒ seul le lien est rendu', () => {
    const doc = documentDuFil(
      etat({
        fil: { ...FIL_MEMBRE, type: 'group', rang: 'moderator' },
        lien: { saisie: { conversation: 'c1', nom: 'T', echeance: 'semaine', capacite: '', permissions: new Set() }, motif: null },
        transfert: { message: rendu(), conversations: [CIBLE], motif: null },
      }),
    );
    expect(doc).toContain('<dialog class="nouveau-lien"');
    expect(doc).not.toContain('<dialog class="transfert"');
  });
});

/**
 * LA PORTE DU FIL — GET/POST `/chats/:cle`, harnais calqué sur
 * `nouveau-lien-depuis-le-fil.test.ts` : `globalThis.fetch` bouchonné, la
 * SEULE surface que `moi()`/`fil()`/`ciblesDeTransfert()` traversent.
 */
describe('la porte du fil — transférer un message (#5386)', () => {
  const CLE = 'c1';
  const contexte = { params: Promise.resolve({ cle: CLE }) };
  const COOKIE = 'meeshy_auth=JWT';

  const conversationServie = { success: true, data: { id: CLE, title: 'Source', memberCount: 2, participants: [] } };
  const messagesServis = {
    success: true,
    data: [{ id: 'm1', content: 'On se voit demain ?', originalLanguage: 'fr', createdAt: '2026-09-01T12:00:00.000Z', senderId: 'u2', sender: { id: 'u2', displayName: 'Marta' } }],
    cursorPagination: { hasMore: false, nextCursor: null },
  };
  const moiServi = { success: true, data: { id: 'u1', displayName: 'Amina' } };
  const conversationsServies = { success: true, data: [{ id: 'c2', title: 'Équipe Lagos' }] };

  const bouchon = (reponseDeLenvoi?: (init: RequestInit) => Response) => {
    const vus: { readonly url: string; readonly methode: string; readonly corps: string | null }[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
      const cible = String(url);
      vus.push({ url: cible, methode: String(init.method ?? 'GET'), corps: typeof init.body === 'string' ? init.body : null });
      if (cible.includes('/auth/me')) return new Response(JSON.stringify(moiServi));
      if (cible.includes('/messages') && (init.method ?? 'GET') === 'POST' && reponseDeLenvoi) return reponseDeLenvoi(init);
      if (cible.includes(`/conversations/${CLE}/messages`) && (init.method ?? 'GET') === 'GET') return new Response(JSON.stringify(messagesServis));
      if (cible.endsWith('/api/v1/conversations?limit=50')) return new Response(JSON.stringify(conversationsServies));
      if (cible.includes(`/api/v1/conversations/${CLE}`)) return new Response(JSON.stringify(conversationServie));
      throw new Error(`route non bouchonnée : ${cible}`);
    }) as typeof fetch;
    return vus;
  };

  afterEach(() => {
    // @ts-expect-error — nettoyage entre témoins.
    delete globalThis.fetch;
  });

  it('GET ?transferer=<id> rend la feuille, avec les cibles du Prisme, une seule requête de plus que le fil ordinaire', async () => {
    const vusOrdinaire = bouchon();
    await (await GET(new Request(`https://meeshy.me/chats/${CLE}`, { headers: { cookie: COOKIE } }), contexte)).text();
    const requetesOrdinaire = vusOrdinaire.length;

    const vusEtat = bouchon();
    const reponse = await GET(new Request(`https://meeshy.me/chats/${CLE}?transferer=m1`, { headers: { cookie: COOKIE } }), contexte);
    const html = await reponse.text();

    expect(html).toContain('<dialog class="transfert" open');
    expect(html).toContain('Équipe Lagos');
    expect(vusEtat.length).toBe(requetesOrdinaire + 1);
    expect(vusEtat.some((v) => v.url.endsWith('/api/v1/conversations?limit=50'))).toBe(true);
  });

  it('GET ?transferer=<id inconnu> ne rend pas la feuille, et ne fait pas de requête de plus', async () => {
    const vusOrdinaire = bouchon();
    await (await GET(new Request(`https://meeshy.me/chats/${CLE}`, { headers: { cookie: COOKIE } }), contexte)).text();
    const requetesOrdinaire = vusOrdinaire.length;

    const vusEtat = bouchon();
    const reponse = await GET(new Request(`https://meeshy.me/chats/${CLE}?transferer=introuvable`, { headers: { cookie: COOKIE } }), contexte);
    const html = await reponse.text();

    expect(html).not.toContain('<dialog class="transfert"');
    expect(vusEtat.length).toBe(requetesOrdinaire);
  });

  it('POST transferer=<id>&vers=<cible> envoie forwardedFromId/forwardedFromConversationId à la CIBLE, et redirige VERS elle', async () => {
    const vus = bouchon(() => new Response(JSON.stringify({ success: true, data: { id: 'm9' } }), { status: 201 }));

    const reponse = await POST(
      new Request(`https://meeshy.me/chats/${CLE}`, {
        method: 'POST',
        body: new URLSearchParams({ transferer: 'm1', vers: 'c2', texte: 'On se voit demain ?', langue: 'fr' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: COOKIE },
      }),
      contexte,
    );

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/chats/c2#m-m9');
    const envoi = vus.find((v) => v.url.includes('/conversations/c2/messages') && v.methode === 'POST');
    expect(envoi).toBeDefined();
    const corps = JSON.parse(envoi!.corps ?? '{}') as Record<string, unknown>;
    expect(corps).toEqual({ content: 'On se voit demain ?', originalLanguage: 'fr', forwardedFromId: 'm1', forwardedFromConversationId: 'c1' });
  });

  it('refus de la passerelle ⇒ la feuille est ROUVERTE sur sa cible, avec le motif — jamais une redirection', async () => {
    bouchon(() => new Response(JSON.stringify({ success: false, error: { message: 'Vous n’êtes plus membre de cette conversation' } }), { status: 403 }));

    const reponse = await POST(
      new Request(`https://meeshy.me/chats/${CLE}`, {
        method: 'POST',
        body: new URLSearchParams({ transferer: 'm1', vers: 'c2', texte: 'On se voit demain ?' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: COOKIE },
      }),
      contexte,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(403);
    expect(html).toContain('<dialog class="transfert" open');
    // Le motif se lit DANS la feuille (`transfert-vue.ts`), jamais dans la
    // bannière générale du fil : `<main>` est `inert` tant que la feuille
    // recouvre, une alerte posée là resterait invisible au lecteur.
    expect(html).toMatch(/<dialog class="transfert" open[^]*Vous n’êtes plus membre de cette conversation[^]*<\/dialog>/);
  });

  it('panne (fetch en échec) ⇒ 503 rendu comme un refus, feuille rouverte', async () => {
    globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
      const cible = String(url);
      if (cible.includes('/auth/me')) return new Response(JSON.stringify(moiServi));
      if (cible.includes(`/conversations/${CLE}/messages`) && (init.method ?? 'GET') === 'GET') return new Response(JSON.stringify(messagesServis));
      if (cible.endsWith('/api/v1/conversations?limit=50')) return new Response(JSON.stringify(conversationsServies));
      if (cible.includes('/conversations/c2/messages')) throw new Error('ECONNRESET');
      return new Response(JSON.stringify(conversationServie));
    }) as typeof fetch;

    const reponse = await POST(
      new Request(`https://meeshy.me/chats/${CLE}`, {
        method: 'POST',
        body: new URLSearchParams({ transferer: 'm1', vers: 'c2', texte: 'x' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: COOKIE },
      }),
      contexte,
    );
    expect(reponse.status).toBe(400);
    expect(await reponse.text()).toContain('<dialog class="transfert" open');
  });

  it('un formulaire du composeur (texte=… sans transferer) n’est pas pris pour un transfert', async () => {
    const vus = bouchon(() => new Response(JSON.stringify({ success: true, data: { id: 'm9' } }), { status: 201 }));

    await POST(
      new Request(`https://meeshy.me/chats/${CLE}`, {
        method: 'POST',
        body: new URLSearchParams({ texte: 'Bonjour' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: COOKIE },
      }),
      contexte,
    );

    expect(vus.some((v) => v.url.includes('/conversations/c2/messages'))).toBe(false);
  });
});
