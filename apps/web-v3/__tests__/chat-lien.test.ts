/**
 * @jest-environment node
 */

import { GET, POST } from '@/app/(public)/chat/[lien]/route';
import { champDuRefus, CHOIX, phraseDeRefus, REFUS, refusGardeLeFormulaire } from '@/app/(public)/chat/[lien]/choix-vue';
import { LIEN_INTROUVABLE } from '@/app/(public)/chat/[lien]/membre-vue';
import { langueDuVisiteur, langueProposee, languesOffertes } from '@/app/(public)/chat/[lien]/langue';
import { nomDuCookie } from '@/lib/api/guest-session';
import { RAISONS_DE_FERMETURE } from '@/lib/api/invite';
import { REFUS_DU_MEMBRE } from '@/lib/contenu/fil';

import {
  apercu,
  APERCU,
  APERCU_DE_TEST,
  avecPasserelle,
  BATTEMENT,
  BATTEMENT_VALIDE,
  chemins,
  contexte,
  CONVERSATION,
  DETAIL,
  document,
  JETON_MORT,
  JONCTION,
  jonctionDe,
  json,
  LECTEUR,
  LIEN,
  MOI,
  NAVIGATION_D_AILLEURS,
  NAVIGATION_DE_MEESHY,
  NAVIGATION_DU_LECTEUR,
  lienDeTest,
  mauvaiseRequete,
  MESSAGE_LU,
  MESSAGES,
  passerelleCouplee,
  RECONNAISSANCE,
  refus,
  requete,
  type Appel,
} from './lib/porte-du-lien';

/**
 * `/chat/:lien` — LA MACHINE À TROIS ÉTATS, décidés par le SERVEUR d'après ce
 * que le lecteur DÉTIENT (conception § 12.3). Ces témoins jouent la route
 * contre une passerelle simulée, requête par requête, et gardent d'abord ce
 * qui NE PART PAS : aucun message n'est demandé avant le choix.
 *
 * LES REFUS SONT CEUX QUE LA PORTE CANONIQUE ÉMET — et aucun autre. Un témoin
 * écrit contre `403 REQUIRES_ACCOUNT` ou `429 MAX_CONCURRENT_USERS` était vert
 * contre un code que `POST /links/:key/members` n'émet jamais (leçon 422) :
 * la loi d'admission nomme SIX codes (`services/conversations/linkAdmission.ts:
 * 112-118`), la validation de forme deux de plus (`routes/conversations/
 * link-admission.ts:625-641`), et un 400 n'a pas de code — sa phrase voyage
 * dans `error` (`utils/response.ts:118-124`).
 */

describe('état CHOIX — aucune session pour ce lien', () => {
  it('rend le cadre inerte et flouté, la modale, et NE DEMANDE AUCUN MESSAGE', async () => {
    await avecPasserelle({ '/api/v1/anonymous/link/lagos-q1': APERCU }, async (appels) => {
      const reponse = await GET(requete({ 'accept-language': 'es-ES,es;q=0.9' }), contexte);
      const html = await reponse.text();

      expect(reponse.status).toBe(200);
      expect(html).toContain('<main id="main-content" class="fil-ecran" inert>');
      expect(html).toContain('<dialog class="feuille" open aria-labelledby="titre-du-choix" aria-describedby="question-du-choix">');
      expect(html).toContain(`<h2 id="titre-du-choix">Équipe Lagos</h2>`);
      expect(html).toContain(CHOIX.titre);
      expect(html).toContain('<form method="post" action="/chat/lagos-q1">');
      expect(html).toContain('href="/login?returnUrl=%2Fchat%2Flagos-q1"');
      expect(html).toContain('href="/signup?returnUrl=%2Fchat%2Flagos-q1"');
      expect(html).toContain(CHOIX.note);
      // La langue vient d'Accept-Language, jamais de 'fr' en dur.
      expect(html).toContain('<option value="es" selected>');
      // Rien de la conversation ne part : ni messages, ni identité du créateur.
      expect(appels.map((a) => a.chemin)).toEqual(['/api/v1/anonymous/link/lagos-q1']);
      expect(html).not.toContain('ibrahim-le-createur');
      expect(html).not.toContain('data-participation');
    });
  });

  it('pose l’ordre de la planche : invitation, nom, question, citation, droits, champs, actions, note', () => {
    const html = document();
    const rangs = [
      CHOIX.invite,
      'id="titre-du-choix"',
      'id="question-du-choix"',
      '<blockquote>',
      '<details class="droits">',
      'name="pseudo"',
      'name="langue"',
      CHOIX.continuer,
      CHOIX.ou,
      CHOIX.seConnecter,
      CHOIX.creerUnCompte,
      CHOIX.note,
    ].map((marque) => html.indexOf(marque));
    expect(rangs.every((rang) => rang >= 0)).toBe(true);
    expect([...rangs].sort((a, b) => a - b)).toEqual(rangs);
  });

  it('demande le courriel et la date de naissance QUAND le lien les exige — et jamais sinon', () => {
    const sans = document();
    expect(sans).not.toContain('name="courriel"');
    expect(sans).not.toContain('name="naissance"');
    expect(sans).toContain(CHOIX.pseudoRequis.titre);

    const avec = document({ apercu: { ...APERCU_DE_TEST, requireEmail: true, requireBirthday: true } });
    expect(avec).toContain('<input id="courriel" name="courriel" type="email" required autocomplete="email"');
    expect(avec).toContain('<input id="naissance" name="naissance" type="date" required autocomplete="bday"');
    expect(avec).toContain(CHOIX.pourEntrer('un pseudo, votre courriel et votre date de naissance'));
  });

  it('ne rend le pseudo obligatoire que si le lien l’exige — la passerelle en fabrique un sinon', () => {
    expect(document()).toContain('<input id="pseudo" name="pseudo" type="text" required autocomplete="nickname"');
    expect(document({ apercu: { ...APERCU_DE_TEST, requireNickname: false } })).toContain(
      '<input id="pseudo" name="pseudo" type="text" autocomplete="nickname"',
    );
  });

  /** La feuille réserve la hauteur de SA variante (`choix-feuille.ts`) : le serveur sait ce qu'il compose. */
  it('nomme la variante de la feuille — nominale, étendue quand un champ s’ajoute, brève sans formulaire', () => {
    expect(document()).toContain('<dialog class="feuille" open');
    expect(document({ apercu: { ...APERCU_DE_TEST, requireEmail: true } })).toContain('<dialog class="feuille etendue" open');
    expect(document({ apercu: { ...APERCU_DE_TEST, requireAccount: true } })).toContain('<dialog class="feuille breve" open');
    expect(document({ refus: { genre: 'refus', statut: 409, code: 'LINK_EXHAUSTED', message: null, suggestion: null } })).toContain('<dialog class="feuille breve" open');
  });

  /** Le bouton « reprendre ma place » (§ 6.3 état F) rapporte le pseudo : il se pré-remplit, jamais ne se soumet. */
  it('pré-remplit le pseudo que l’adresse rapporte, sans rien rejoindre', async () => {
    await avecPasserelle({ '/api/v1/anonymous/link/lagos-q1': APERCU }, async (appels) => {
      const reponse = await GET(new Request('https://meeshy.me/chat/lagos-q1?pseudo=Tolu%20%3C1%3E'), contexte);
      const html = await reponse.text();

      expect(reponse.status).toBe(200);
      expect(html).toContain('value="Tolu &lt;1&gt;"');
      expect(appels.map((a) => a.chemin)).toEqual(['/api/v1/anonymous/link/lagos-q1']);
    });
  });

  it('pré-remplit le pseudo LIBRE que la passerelle propose sur un 409 (`suggestedNickname` à la racine)', async () => {
    await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': APERCU,
        [JONCTION]: () => refus(409, 'USERNAME_TAKEN_IN_CONVERSATION', 'pris', { suggestedNickname: 'ibrahim2' }),
      },
      async () => {
        const reponse = await POST(jonctionDe('ibrahim'), contexte);
        const html = await reponse.text();
        expect(reponse.status).toBe(409);
        expect(html).toContain('value="ibrahim2"');
        expect(html).toContain('aria-invalid="true" aria-describedby="pseudo-refus"');
        expect(html).toContain(REFUS.USERNAME_TAKEN_IN_CONVERSATION);
        expect(html).toContain('<form method="post"');
      },
    );
  });

  it.each([
    ["Le nom d'utilisateur est obligatoire pour rejoindre cette conversation", 'pseudo'],
    ["L'email est obligatoire pour rejoindre cette conversation", 'courriel'],
    ['La date de naissance est obligatoire pour rejoindre cette conversation', 'naissance'],
  ])('peint un 400 « %s » sur SON champ, garde le formulaire et la saisie', async (phrase, champ) => {
    await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': apercu({ requireEmail: true, requireBirthday: true }),
        [JONCTION]: () => mauvaiseRequete(phrase),
      },
      async () => {
        const reponse = await POST(jonctionDe('Tolu', { courriel: 'tolu@example.com', naissance: '1990-05-12' }), contexte);
        const html = await reponse.text();
        expect(reponse.status).toBe(400);
        expect(html).toContain(`<p class="refus" id="${champ}-refus" role="alert">${phrase.replace(/'/g, '&#39;')}</p>`);
        expect(html).toContain(`id="${champ}" name="${champ}"`);
        expect(html).toContain('<form method="post"');
        expect(html).toContain('value="Tolu"');
        expect(html).toContain('value="tolu@example.com"');
        expect(html).toContain('value="1990-05-12"');
      },
    );
  });

  it('peint un 400 qui ne désigne aucun champ en bandeau, formulaire conservé', async () => {
    await avecPasserelle(
      { '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: () => mauvaiseRequete('Données invalides') },
      async () => {
        const reponse = await POST(jonctionDe('Tolu'), contexte);
        const html = await reponse.text();
        expect(reponse.status).toBe(400);
        expect(html).toContain('class="bandeau refus"');
        expect(html).toContain('Données invalides');
        expect(html).toContain('<form method="post"');
      },
    );
  });

  /**
   * Les refus DU LIEN, tels que la porte les émet : `linkAdmission.ts:112-118`
   * (410 `LINK_EXPIRED` / `CONVERSATION_CLOSED`, 409 `LINK_EXHAUSTED`, 403
   * `REGION_NOT_ALLOWED` / `ACCOUNT_REQUIRED` / `BANNED`) et `link-admission.ts:
   * 631` (403 `LANGUAGE_NOT_ALLOWED`). Chacun retire le formulaire et garde le
   * compte — `LINK_EXHAUSTED` compris, qui est un 409 comme le pseudo pris.
   */
  it.each([
    [403, 'ACCOUNT_REQUIRED'],
    [403, 'LANGUAGE_NOT_ALLOWED'],
    [403, 'REGION_NOT_ALLOWED'],
    [403, 'BANNED'],
    [409, 'LINK_EXHAUSTED'],
    [410, 'LINK_EXPIRED'],
    [410, 'CONVERSATION_CLOSED'],
  ])('peint un refus %s %s DANS la modale, retire le formulaire et garde le compte', async (statut, code) => {
    await avecPasserelle(
      { '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: () => refus(statut, code, 'refus') },
      async () => {
        const reponse = await POST(jonctionDe('tolu'), contexte);
        const html = await reponse.text();
        expect(reponse.status).toBe(statut);
        expect(html).toContain('<dialog');
        expect(html).toContain('class="bandeau refus"');
        expect(html).toContain(phraseDeRefus(code, null));
        expect(html).not.toContain('<form method="post"');
        expect(html).toContain('/login?returnUrl=');
        expect(html).toContain('/signup?returnUrl=');
      },
    );
  });

  it('dit un lien que personne ne connaît (404), sans modale ni panne', async () => {
    await avecPasserelle(
      { '/api/v1/anonymous/link/lagos-q1': () => refus(404, 'Lien de conversation introuvable', 'Lien de conversation introuvable') },
      async () => {
        const reponse = await GET(requete(), contexte);
        const html = await reponse.text();
        expect(reponse.status).toBe(404);
        expect(html).not.toContain('<dialog');
        expect(html).toContain(LIEN_INTROUVABLE.titre);
        expect(html).toContain('href="/"');
      },
    );
  });

  it('pose le cookie de la place, PORTÉ AU LIEN, et renvoie vers la même adresse — le bandeau des droits s’ouvrira', async () => {
    await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': APERCU,
        [JONCTION]: (appel) => {
          expect(JSON.parse(appel.corps)).toEqual({ nickname: 'Tolu', language: 'fr' });
          expect(appel.entetes.authorization).toBeUndefined();
          return json({ success: true, data: { sessionToken: 'S1', conversationId: CONVERSATION, participantId: 'p-tolu', entry: { outcome: 'new', canViewHistory: true, rights: { canSendMessages: true } } } }, 201);
        },
      },
      async () => {
        const reponse = await POST(jonctionDe('Tolu'), contexte);
        expect(reponse.status).toBe(303);
        expect(reponse.headers.get('location')).toBe('/chat/lagos-q1?bienvenue=1');
        expect(reponse.headers.get('set-cookie')).toBe(`${nomDuCookie(LIEN)}=S1; Path=/chat; SameSite=Lax; Secure`);
      },
    );
  });

  /**
   * `allowedIpRanges` est jugé par la porte sur `request.ip` (`linkAdmission.ts:
   * 200-204`). La v3 poste depuis son serveur : elle relaie l'adresse du
   * visiteur, sinon c'est la sienne que le lien jugerait.
   */
  it('relaie l’adresse du visiteur à la porte — X-Real-IP d’abord, sinon le premier maillon de X-Forwarded-For', async () => {
    const relayees: (string | undefined)[] = [];
    const jonction = (appel: Appel): Response => {
      relayees.push(appel.entetes['x-forwarded-for']);
      return json({ success: true, data: { sessionToken: 'S1', conversationId: CONVERSATION, participantId: 'p-tolu', entry: { outcome: 'new', rights: {} } } }, 201);
    };
    await avecPasserelle({ '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: jonction }, async () => {
      await POST(requete({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.2, 203.0.113.9' }, 'POST', new URLSearchParams({ pseudo: 'Tolu', langue: 'fr' })), contexte);
      await POST(requete({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }, 'POST', new URLSearchParams({ pseudo: 'Tolu', langue: 'fr' })), contexte);
      await POST(jonctionDe('Tolu'), contexte);
    });
    expect(relayees).toEqual(['203.0.113.9', '198.51.100.7', undefined]);
  });

  it('envoie le courriel et la date de naissance en ISO date-time, tels que la porte les lit (`link-admission.ts:576-578`)', async () => {
    await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': apercu({ requireEmail: true, requireBirthday: true }),
        [JONCTION]: (appel) => {
          expect(JSON.parse(appel.corps)).toEqual({ nickname: 'Tolu', email: 'tolu@example.com', birthday: '1990-05-12T00:00:00.000Z', language: 'fr' });
          return json({ success: true, data: { sessionToken: 'S1', conversationId: CONVERSATION, participantId: 'p-tolu', entry: { outcome: 'new', rights: {} } } }, 201);
        },
      },
      async () => {
        const reponse = await POST(jonctionDe('Tolu', { courriel: 'tolu@example.com', naissance: '1990-05-12' }), contexte);
        expect(reponse.status).toBe(303);
      },
    );
  });

  it('n’envoie pas de pseudo vide quand le lien n’en exige pas — la passerelle en fabrique un', async () => {
    await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': apercu({ requireNickname: false }),
        [JONCTION]: (appel) => {
          expect(JSON.parse(appel.corps)).toEqual({ language: 'yo' });
          return json({ success: true, data: { sessionToken: 'S1', conversationId: CONVERSATION, participantId: 'p-x', entry: { outcome: 'new', rights: {} } } }, 201);
        },
      },
      async () => {
        const reponse = await POST(requete({}, 'POST', new URLSearchParams({ pseudo: '', langue: 'yo' })), contexte);
        expect(reponse.status).toBe(303);
      },
    );
  });

  it('garde la langue CHOISIE quand la jonction est refusée', async () => {
    await avecPasserelle(
      { '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: () => refus(409, 'USERNAME_TAKEN_IN_CONVERSATION', 'pris', { suggestedNickname: 'tolu2' }) },
      async () => {
        const reponse = await POST(requete({ 'accept-language': 'fr' }, 'POST', new URLSearchParams({ pseudo: 'tolu', langue: 'yo' })), contexte);
        expect(await reponse.text()).toContain('<option value="yo" selected>');
      },
    );
  });
});

describe('état INVITÉ — une session valide pour ce lien', () => {
  const cookie = `${nomDuCookie(LIEN)}=S1`;

  it('re-valide au montage, relit les droits, sert le fil par la MÊME vue, et greffe le temps réel', async () => {
    await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': APERCU,
        [BATTEMENT]: (appel) => {
          // Le jeton voyage en `X-Session-Token`, jamais dans un corps (`link-admission.ts:825`).
          expect(appel.methode).toBe('PATCH');
          expect(appel.entetes['x-session-token']).toBe('S1');
          expect(appel.corps).toBe('');
          return BATTEMENT_VALIDE();
        },
        [`/api/v1/conversations/${CONVERSATION}`]: (appel) => {
          expect(appel.entetes['x-session-token']).toBe('S1');
          return DETAIL();
        },
        [`/api/v1/conversations/${CONVERSATION}/messages`]: MESSAGES,
      },
      async (appels) => {
        const reponse = await GET(requete({ cookie }), contexte);
        const html = await reponse.text();
        expect(reponse.status).toBe(200);
        // Jamais la MODALE du choix ; la palette de réactions, elle, vit dans un `<template>` du gabarit.
        expect(html).not.toContain('<dialog class="feuille"');
        expect(appels.some((a) => a.chemin === '/api/v1/anonymous/refresh')).toBe(false);
        expect(html).toContain('data-participation="fil"');
        expect(html).toContain('data-porte="invite"');
        expect(html).toContain(`data-lien="${LIEN}"`);
        expect(html).toContain('data-moi="p-tolu"');
        expect(html).toContain('<details class="bandeau bien">');
        expect(html).toContain('Entré comme Tolu · anonyme');
        // Le trombone est servi CACHÉ (le lien n'admet aucune pièce, un module viendra) : l'`enctype` l'accompagne.
        expect(html).toContain('<form class="composeur" id="composeur" method="post" action="/chat/lagos-q1" enctype="multipart/form-data">');
        expect(html).toContain('<label class="joindre" for="champ-piece" hidden');
        // Jamais de re-jonction : la route n'appelle pas la porte des membres.
        expect(appels.some((a) => a.chemin.endsWith('/members'))).toBe(false);
      },
    );
  });

  it('ouvre le bandeau des droits juste après la jonction', async () => {
    await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': APERCU,
        [BATTEMENT]: BATTEMENT_VALIDE,
        [`/api/v1/conversations/${CONVERSATION}`]: DETAIL,
        [`/api/v1/conversations/${CONVERSATION}/messages`]: MESSAGES,
      },
      async () => {
        const reponse = await GET(new Request('https://meeshy.me/chat/lagos-q1?bienvenue=1', { headers: { cookie } }), contexte);
        expect(await reponse.text()).toContain('<details class="bandeau bien" open>');
      },
    );
  });

  /** État F : un 401 de battement — la place n'existe plus. Le cookie s'efface ; JAMAIS un re-join. */
  it('efface le cookie sur un 401 et rend le CHOIX, sans jamais rejoindre de lui-même', async () => {
    await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': APERCU,
        [BATTEMENT]: () => refus(401, 'UNAUTHORIZED', 'Session invalide ou expirée'),
      },
      async (appels) => {
        const reponse = await GET(requete({ cookie }), contexte);
        expect(reponse.status).toBe(200);
        expect(reponse.headers.get('set-cookie')).toContain(`${nomDuCookie(LIEN)}=; Max-Age=0`);
        expect(await reponse.text()).toContain('<dialog');
        expect(appels.some((a) => a.chemin.endsWith('/members'))).toBe(false);
      },
    );
  });

  /**
   * État G : la conversation est CLOSE pendant la lecture — le seul 410 de
   * battement que l'aperçu ne devance pas (il ne lit pas `closedAt`) : le
   * composeur se ferme AVEC SA RAISON, le cookie reste, aucune modale.
   */
  it('ferme le composeur avec sa raison sur un 410 CONVERSATION_CLOSED, sans effacer la place — la lecture reste, nommée par la reconnaissance, sans verdict fabriqué', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ conversationClose: true })), async (appels) => {
      const reponse = await GET(requete({ cookie }), contexte);
      const html = await reponse.text();
      expect(reponse.status).toBe(200);
      expect(reponse.headers.get('set-cookie')).toBeNull();
      // Jamais la MODALE du choix ; la palette de réactions, elle, vit dans un `<template>` du gabarit.
      expect(html).not.toContain('<dialog class="feuille"');
      expect(html).toContain('class="composeur ferme"');
      expect(html).toContain(RAISONS_DE_FERMETURE.CONVERSATION_CLOSED);
      expect(html).not.toContain('<textarea');
      // Le battement 410 n'a servi aucun droit : aucun verdict n'est rendu — et aucun pseudo vide.
      expect(html).not.toContain('data-droit=');
      expect(html).toContain('Entré comme Tolu · anonyme');
      expect(html).toContain(`id="m-${MESSAGE_LU.id}"`);
      // L'aperçu a répondu (la conversation close ne s'y voit pas) ; le battement ferme ; la place se NOMME
      // par la reconnaissance, puis la liste est lue avec la session.
      expect(chemins(appels)).toEqual([
        'GET /api/v1/anonymous/link/lagos-q1',
        `PATCH ${BATTEMENT}`,
        `GET ${RECONNAISSANCE}`,
        `GET /api/v1/conversations/${CONVERSATION}`,
        `GET /api/v1/conversations/${CONVERSATION}/messages`,
        // Ce qui est affiché est DIT (`accuseCeQuiEstServi`) — la lecture reste une lecture.
        `POST /api/v1/conversations/${CONVERSATION}/receipts`,
      ]);
    });
  });

  it('envoie par formulaire puis redirige (Post/Redirect/Get) — vers la LIGNE envoyée, jamais l’adresse nue', async () => {
    await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': APERCU,
        [BATTEMENT]: BATTEMENT_VALIDE,
        [`/api/v1/conversations/${CONVERSATION}/messages`]: (appel) => {
          expect(appel.methode).toBe('POST');
          expect(appel.entetes['x-session-token']).toBe('S1');
          expect(JSON.parse(appel.corps)).toEqual({ content: 'Ça me va.' });
          return json({ success: true, data: { id: 'm9' } });
        },
      },
      async () => {
        const reponse = await POST(requete({ cookie }, 'POST', new URLSearchParams({ texte: 'Ça me va.' })), contexte);
        expect(reponse.status).toBe(303);
        expect(reponse.headers.get('location')).toBe('/chat/lagos-q1#m-m9');
      },
    );
  });

  /**
   * Une PIÈCE JOINTE sans JavaScript : `POST /attachments/upload` (multipart,
   * `upload.ts:58`) puis le message avec ses `attachmentIds`
   * (`messages-send.ts:76`) — l'un après l'autre, sous la session de l'invité.
   */
  it('téléverse la pièce postée puis l’envoie avec son identifiant', async () => {
    await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': APERCU,
        [BATTEMENT]: BATTEMENT_VALIDE,
        '/api/v1/attachments/upload': (appel) => {
          expect(appel.methode).toBe('POST');
          expect(appel.entetes['x-session-token']).toBe('S1');
          expect(appel.fichiers).toEqual([{ champ: 'files', nom: 'photo.png', type: 'image/png' }]);
          return json({ success: true, data: { attachments: [{ id: 'a1', fileUrl: '/api/v1/attachments/file/a1.png' }] } });
        },
        [`/api/v1/conversations/${CONVERSATION}/messages`]: (appel) => {
          expect(JSON.parse(appel.corps)).toEqual({ content: 'La photo', attachmentIds: ['a1'] });
          return json({ success: true, data: { id: 'm10' } });
        },
      },
      async (appels) => {
        const corps = new FormData();
        corps.set('texte', 'La photo');
        corps.set('piece', new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'image/png' }));
        const reponse = await POST(new Request('https://meeshy.me/chat/lagos-q1', { method: 'POST', headers: { cookie }, body: corps }), contexte);
        expect(reponse.status).toBe(303);
        expect(reponse.headers.get('location')).toBe('/chat/lagos-q1#m-m10');
        expect(appels.map((a) => a.chemin).filter((c) => c.includes('/attachments/') || c.endsWith('/messages'))).toEqual([
          '/api/v1/attachments/upload',
          `/api/v1/conversations/${CONVERSATION}/messages`,
        ]);
      },
    );
  });

  /**
   * LA PASTILLE POSTÉE bascule par la route : `POST /reactions` — 201 quand
   * elle vient d'être posée ; 200 `unchanged` quand elle l'était déjà
   * (`routes/reactions.ts:188-194`), et c'est alors un RETRAIT que le geste
   * voulait (`DELETE /reactions/:id/:emoji`). Puis le fil, recadré sur la ligne.
   */
  it('bascule une réaction postée sans JavaScript, et recadre la ligne', async () => {
    const pose = await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': APERCU,
        [BATTEMENT]: BATTEMENT_VALIDE,
        '/api/v1/reactions': (appel) => {
          expect(appel.entetes['x-session-token']).toBe('S1');
          expect(JSON.parse(appel.corps)).toEqual({ messageId: 'm1', emoji: '👍' });
          return json({ success: true, data: { id: 'r1' } }, 201);
        },
      },
      async (appels) => {
        const reponse = await POST(requete({ cookie }, 'POST', new URLSearchParams({ reaction: '👍', message: 'm1' })), contexte);
        expect(reponse.headers.get('location')).toBe('/chat/lagos-q1#m-m1');
        return { statut: reponse.status, chemins: appels.map((a) => `${a.methode} ${a.chemin}`) };
      },
    );
    expect(pose.statut).toBe(303);
    expect(pose.chemins.filter((c) => c.includes('/reactions'))).toEqual(['POST /api/v1/reactions']);

    const retiree = await avecPasserelle(
      {
        '/api/v1/anonymous/link/lagos-q1': APERCU,
        [BATTEMENT]: BATTEMENT_VALIDE,
        '/api/v1/reactions': () => json({ success: true, data: { id: 'r1' } }, 200),
        '/api/v1/reactions/m1/%F0%9F%91%8D': (appel) => {
          expect(appel.methode).toBe('DELETE');
          return json({ success: true, data: { message: 'Reaction removed' } });
        },
      },
      async (appels) => {
        const reponse = await POST(requete({ cookie }, 'POST', new URLSearchParams({ reaction: '👍', message: 'm1' })), contexte);
        return { statut: reponse.status, chemins: appels.map((a) => `${a.methode} ${a.chemin}`) };
      },
    );
    expect(retiree.statut).toBe(303);
    expect(retiree.chemins.filter((c) => c.includes('/reactions'))).toEqual(['POST /api/v1/reactions', 'DELETE /api/v1/reactions/m1/%F0%9F%91%8D']);
  });
});

describe('état MEMBRE — un jeton de compte', () => {
  const cookieDuMembre = { cookie: 'meeshy_session=x; meeshy_auth=JWT' };
  const DEJA_MEMBRE = () =>
    json({ success: true, data: { conversationId: CONVERSATION, participantId: 'p-amina', entry: { outcome: 'already-member', canViewHistory: true } } });
  const PLACE_INVITEE = () =>
    json({ success: true, data: { sessionToken: 'S-fantome', conversationId: CONVERSATION, participantId: 'p-fantome', entry: { outcome: 'new', canViewHistory: true, rights: { canSendMessages: true } } } }, 201);

  it('prouve l’identité par /auth/me, joint par la porte canonique avec le jeton, puis renvoie vers l’interface connectée — sur une navigation qui est le geste du lecteur', async () => {
    await avecPasserelle(
      {
        [MOI]: LECTEUR,
        '/api/v1/anonymous/link/lagos-q1': APERCU,
        [JONCTION]: (appel) => {
          expect(appel.entetes.authorization).toBe('Bearer JWT');
          return DEJA_MEMBRE();
        },
      },
      async (appels) => {
        const reponse = await GET(requete({ ...cookieDuMembre, ...NAVIGATION_DU_LECTEUR }), contexte);
        expect(reponse.status).toBe(302);
        expect(reponse.headers.get('location')).toBe(`/chats/${CONVERSATION}`);
        expect(chemins(appels)).toEqual([`GET ${MOI}`, 'GET /api/v1/anonymous/link/lagos-q1', `POST ${JONCTION}`]);
      },
    );
  });

  it('joint aussi sur le retour de Meeshy lui-même (same-origin) — le retour de /login', async () => {
    await avecPasserelle({ [MOI]: LECTEUR, '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: DEJA_MEMBRE }, async () => {
      const reponse = await GET(requete({ ...cookieDuMembre, ...NAVIGATION_DE_MEESHY }), contexte);
      expect(reponse.status).toBe(302);
    });
  });

  /**
   * UN JETON PÉRIMÉ N'EST PAS UN MEMBRE — et la porte de jonction ne le dirait pas :
   * en `optionalAuth`, un `Bearer` illisible y vaut un VISITEUR (`middleware/auth.ts:
   * 770-780`, `link-admission.ts:101-108`), donc un invité fantôme au pseudo généré,
   * une place consommée, un `sessionToken` jeté. `/auth/me` tranche AVANT, et aucune
   * porte n'est poussée : le lecteur est ce qu'il détient d'autre — ici, rien.
   */
  it('n’engage AUCUNE jonction au nom d’un jeton mort : /auth/me le dit, le lecteur choisit comme tout visiteur', async () => {
    await avecPasserelle(
      { [MOI]: JETON_MORT, '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: PLACE_INVITEE },
      async (appels) => {
        const reponse = await GET(requete({ ...cookieDuMembre, ...NAVIGATION_DU_LECTEUR }), contexte);
        expect(reponse.status).toBe(200);
        expect(await reponse.text()).toContain('<dialog');
        expect(chemins(appels)).toEqual([`GET ${MOI}`, 'GET /api/v1/anonymous/link/lagos-q1']);
        expect(reponse.headers.get('set-cookie')).toBeNull();
      },
    );
  });

  it('rend, à un jeton mort qui tient une place invitée, cette place — jamais la modale, jamais une jonction', async () => {
    await avecPasserelle(
      { [MOI]: JETON_MORT, ...passerelleCouplee(lienDeTest()), [JONCTION]: PLACE_INVITEE },
      async (appels) => {
        const reponse = await GET(requete({ cookie: `meeshy_session=x; meeshy_auth=JWT; ${nomDuCookie(LIEN)}=S1`, ...NAVIGATION_DU_LECTEUR }), contexte);
        expect(reponse.status).toBe(200);
        // La modale se nomme par son titre, jamais par `<dialog>` : le FIL en porte un aussi —
        // la palette de réactions — et un témoin qui compte les balises appellerait « modale »
        // un écran qui n'en est pas une.
        const servi = await reponse.text();
        expect(servi).not.toContain('titre-du-choix');
        expect(servi).toContain('data-participation="fil"');
        expect(appels.some((a) => a.chemin.endsWith('/members'))).toBe(false);
      },
    );
  });

  /**
   * UNE NAVIGATION VENUE D'AILLEURS NE JOINT PAS. `meeshy_auth` est `SameSite=Lax`
   * et part avec toute navigation de premier niveau : sans cette garde, un site
   * tiers ferait adhérer un lecteur connecté d'un simple lien. Le membre lit un
   * document qui DEMANDE l'adhésion — un formulaire de 56 px vers la même adresse —
   * et rien n'a été poussé en son nom. Un agent qui ne dit pas d'où il vient est
   * traité de même : la porte ne suppose jamais le geste.
   */
  it.each([
    ['Sec-Fetch-Site: cross-site', NAVIGATION_D_AILLEURS],
    ['aucun en-tête Fetch Metadata', {}],
    ['une navigation qui n’est pas un document (iframe)', { ...NAVIGATION_DE_MEESHY, 'sec-fetch-dest': 'iframe' }],
  ])('demande l’adhésion par un formulaire au lieu de joindre (%s)', async (_, entetes) => {
    await avecPasserelle({ [MOI]: LECTEUR, '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: DEJA_MEMBRE }, async (appels) => {
      const reponse = await GET(requete({ ...cookieDuMembre, ...entetes }), contexte);
      const html = await reponse.text();
      expect(reponse.status).toBe(200);
      expect(html).toContain('<form method="post" action="/chat/lagos-q1">');
      expect(html).toContain('Rejoindre Équipe Lagos');
      expect(html).not.toContain('<dialog');
      expect(html).not.toContain('/login?returnUrl=');
      expect(appels.some((a) => a.chemin.endsWith('/members'))).toBe(false);
    });
  });

  it('joint sur le POST du formulaire d’adhésion, puis renvoie vers l’interface connectée', async () => {
    await avecPasserelle({ [MOI]: LECTEUR, '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: DEJA_MEMBRE }, async (appels) => {
      const reponse = await POST(requete({ ...cookieDuMembre, origin: 'https://meeshy.me', 'sec-fetch-site': 'same-origin' }, 'POST', new URLSearchParams({ rejoindre: '1' })), contexte);
      expect(reponse.status).toBe(302);
      expect(reponse.headers.get('location')).toBe(`/chats/${CONVERSATION}`);
      expect(appels.some((a) => a.chemin.endsWith('/members'))).toBe(true);
    });
  });

  /** Un membre qui POSTE ici — un formulaire posé avant sa connexion, un onglet oublié — est joint et renvoyé : il n'écrit jamais dans `/chat/`. */
  it('renvoie aussi un membre qui poste vers l’interface connectée, sans rien envoyer d’ici', async () => {
    await avecPasserelle(
      { [MOI]: LECTEUR, '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: DEJA_MEMBRE },
      async (appels) => {
        const reponse = await POST(requete(cookieDuMembre, 'POST', new URLSearchParams({ texte: 'Bonjour' })), contexte);
        expect(reponse.status).toBe(302);
        expect(reponse.headers.get('location')).toBe(`/chats/${CONVERSATION}`);
        expect(appels.some((a) => a.chemin.includes('/messages'))).toBe(false);
      },
    );
  });

  /**
   * LA PORTE A RENDU UNE PLACE INVITÉE À UN PORTEUR — le jeton est mort entre
   * `/auth/me` et la jonction : la passerelle a admis un visiteur. Ce qu'elle a
   * servi est honoré pour ce que c'est — le cookie de la place, l'état INVITÉ —,
   * jamais projeté sur le fil du membre, qui renverrait le lecteur à /login en
   * laissant un fantôme derrière lui.
   */
  it('honore une place invitée rendue à un porteur comme une place invitée — cookie et état INVITÉ, jamais le fil du membre', async () => {
    await avecPasserelle({ [MOI]: LECTEUR, '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: PLACE_INVITEE }, async () => {
      const reponse = await GET(requete({ ...cookieDuMembre, ...NAVIGATION_DU_LECTEUR }), contexte);
      expect(reponse.status).toBe(303);
      expect(reponse.headers.get('location')).toBe('/chat/lagos-q1?bienvenue=1');
      expect(reponse.headers.get('set-cookie')).toContain(`${nomDuCookie(LIEN)}=S-fantome`);
    });
  });

  /**
   * UN MEMBRE NE VOIT JAMAIS LA MODALE (conception § 12.3). Un lien clos avant
   * tout choix, ou une jonction refusée, lui est dit dans un document qui NOMME
   * la raison et le ramène à ses conversations — « Se connecter » et « Créer un
   * compte » n'ont aucun sens pour lui.
   */
  it('lit le refus d’un lien clos, jamais la modale', async () => {
    await avecPasserelle(
      { [MOI]: LECTEUR, '/api/v1/anonymous/link/lagos-q1': () => refus(410, 'LINK_EXPIRED', 'Ce lien a expire') },
      async (appels) => {
        const reponse = await GET(requete({ ...cookieDuMembre, ...NAVIGATION_DU_LECTEUR }), contexte);
        const html = await reponse.text();
        expect(reponse.status).toBe(410);
        expect(html).not.toContain('<dialog');
        expect(html).toContain(REFUS_DU_MEMBRE.titre);
        expect(html).toContain(RAISONS_DE_FERMETURE.LINK_EXPIRED);
        expect(html).toContain('href="/chats"');
        expect(html).not.toContain('/login?returnUrl=');
        expect(html).not.toContain('/signup?returnUrl=');
        expect(appels.some((a) => a.chemin.endsWith('/members'))).toBe(false);
      },
    );
  });

  it.each([
    [409, 'LINK_EXHAUSTED'],
    [403, 'ACCOUNT_REQUIRED'],
    [403, 'BANNED'],
    [410, 'CONVERSATION_CLOSED'],
  ])('lit un refus de jonction %s %s avec son statut, sans modale', async (statut, code) => {
    await avecPasserelle(
      { [MOI]: LECTEUR, '/api/v1/anonymous/link/lagos-q1': APERCU, [JONCTION]: () => refus(statut, code, 'refus') },
      async () => {
        const reponse = await GET(requete({ ...cookieDuMembre, ...NAVIGATION_DU_LECTEUR }), contexte);
        const html = await reponse.text();
        expect(reponse.status).toBe(statut);
        expect(html).not.toContain('<dialog');
        expect(html).toContain(REFUS_DU_MEMBRE.titre);
        expect(html).toContain(phraseDeRefus(code, null));
        expect(html).toContain('href="/chats"');
      },
    );
  });
});

/**
 * CE QUE LE LECTEUR DÉTIENT TRANCHE AVANT L'APERÇU (§ 6.3.B). L'aperçu refuse
 * 410 un lien inactif, échu ou PLEIN — et un lien plein l'est PAR son dernier
 * admis, dont la place est active. Chaque témoin règle l'ÉTAT du lien, et les
 * quatre portes en dérivent leurs réponses : c'est la seule façon de faire
 * rougir « l'aperçu court-circuite le cookie », qu'un bouchon par endpoint ne
 * pouvait pas voir.
 */

describe('ce qui laisse ressaisir, et ce qui ferme', () => {
  const unRefus = (statut: number, code: string, message: string | null = null) => ({ genre: 'refus' as const, statut, code, message, suggestion: null });

  it('laisse le formulaire sur un 400 et sur un pseudo pris — le CODE décide, pas le statut', () => {
    expect(refusGardeLeFormulaire(unRefus(409, 'USERNAME_TAKEN_IN_CONVERSATION'))).toBe(true);
    expect(refusGardeLeFormulaire(unRefus(400, "L'email est obligatoire"))).toBe(true);
    expect(refusGardeLeFormulaire(unRefus(409, 'LINK_EXHAUSTED'))).toBe(false);
    expect(refusGardeLeFormulaire(unRefus(403, 'ACCOUNT_REQUIRED'))).toBe(false);
  });

  it('désigne le champ d’un refus de saisie par la phrase de la passerelle', () => {
    expect(champDuRefus(unRefus(409, 'USERNAME_TAKEN_IN_CONVERSATION'))).toBe('pseudo');
    expect(champDuRefus(unRefus(400, "Le nom d'utilisateur est obligatoire pour rejoindre cette conversation"))).toBe('pseudo');
    expect(champDuRefus(unRefus(400, "L'email est obligatoire pour rejoindre cette conversation"))).toBe('courriel');
    expect(champDuRefus(unRefus(400, 'La date de naissance est obligatoire pour rejoindre cette conversation'))).toBe('naissance');
    expect(champDuRefus(unRefus(400, 'Données invalides'))).toBeNull();
    expect(champDuRefus(unRefus(409, 'LINK_EXHAUSTED'))).toBeNull();
  });

  it('prend la phrase d’un lien fermé à la table du composeur — jamais une copie', () => {
    expect(phraseDeRefus('LINK_EXPIRED', null)).toBe(RAISONS_DE_FERMETURE.LINK_EXPIRED);
    expect(phraseDeRefus('LINK_EXHAUSTED', null)).toBe(RAISONS_DE_FERMETURE.LINK_EXHAUSTED);
    expect(phraseDeRefus("L'email est obligatoire", "L'email est obligatoire")).toBe("L'email est obligatoire");
    expect(Object.keys(REFUS).some((code) => code in RAISONS_DE_FERMETURE)).toBe(false);
  });

  it('ne nomme aucun code que la porte n’émet pas', () => {
    expect(Object.keys(REFUS)).not.toContain('REQUIRES_ACCOUNT');
    expect(Object.keys(REFUS)).not.toContain('MAX_CONCURRENT_USERS');
  });
});

describe('la langue pré-remplie', () => {
  it('lit Accept-Language comme le navigateur l’écrit : le poids ordonne, l’écriture départage', () => {
    expect(langueDuVisiteur('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(langueDuVisiteur('fr;q=0.5, en')).toBe('en');
    expect(langueDuVisiteur('es;q=0, en;q=0.4, yo;q=0.6')).toBe('yo');
    expect(langueDuVisiteur('*')).toBe('fr');
    expect(langueDuVisiteur('es')).toBe('es');
    expect(langueDuVisiteur(null)).toBe('fr');
  });

  it('respecte les langues que le lien autorise', () => {
    expect(langueProposee('es', ['en', 'fr'])).toBe('en');
    expect(langueProposee('fr', ['en', 'fr'])).toBe('fr');
    expect(languesOffertes(['yo']).map((l) => l.code)).toEqual(['yo']);
    expect(languesOffertes([]).length).toBeGreaterThan(5);
  });
});

describe('la modale, échappée', () => {
  it('ne laisse pas passer un nom de lien qui porte du balisage', () => {
    const html = document({
      apercu: { ...APERCU_DE_TEST, nom: '<img src=x onerror=alert(1)>', description: null, participants: null },
      saisie: { pseudo: '"><script>', courriel: '', naissance: '' },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('"><script>');
  });

  /** Règle 23 — chaque glyphe de la modale a son tracé dans le sprite : un `<svg>` vide serait une ponctuation muette. */
  it('inline ses glyphes depuis le sprite, aucun vide', () => {
    const html = document({ apercu: { ...APERCU_DE_TEST, requireEmail: true, requireBirthday: true } });
    const modale = html.slice(html.indexOf('<dialog'), html.indexOf('</dialog>'));
    expect(modale).not.toContain('aria-hidden="true"></svg>');
    expect((modale.match(/<svg /g) ?? []).length).toBeGreaterThanOrEqual(8);
  });
});
