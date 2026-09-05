/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '@/app/authentification/remise';
import { appliqueLeGeste, GESTE_SUR_UNE_LIGNE, soumissionDuGeste } from '@/app/connecte/liste-porte';
import { documentDesChats } from '@/app/connecte/liste-vue';
import { ACTIONS, CHATS, CONFIRMATIONS, NOUVELLE_CONVERSATION, vedetteDe } from '@/lib/contenu/liste';
import type { Conversation } from '@/lib/api/compte';

/**
 * `/chats` — LE DOCUMENT SERVI ET SES TROIS GESTES.
 *
 * Ce que ces témoins gardent : la ligne porte son aperçu DESCENDU au prisme
 * ordonné, le compte de participants se tait à deux (§ 12.10.2), le menu de
 * chaque ligne est un formulaire RÉEL, et la porte l'applique sur la route que
 * la passerelle sert — jamais une route inventée.
 *
 * Les endpoints attaqués, avec leur source :
 *   • `PUT /api/v1/user-preferences/conversations/:id`
 *     (`services/gateway/src/routes/conversation-preferences.ts:407`) ;
 *   • `DELETE /api/v1/conversations/:id/delete-for-me`
 *     (`services/gateway/src/routes/conversations/delete-for-me.ts:253`).
 */

const CONVERSATION = (attributs: Partial<Conversation> = {}): Conversation => ({
  id: '68f2a81417a557e8ce4ddfbb',
  identifiant: 'lagos',
  titre: 'Équipe Lagos',
  genre: 'group',
  membres: 4,
  nonLus: 3,
  dernierMessageA: '2026-09-01T12:00:00.000Z',
  apercu: 'On se cale à 15 h pour la revue ?',
  apercuTraductions: null,
  apercuLangueOriginale: 'fr',
  sourdine: false,
  archivee: false,
  participantsInscrits: [],
  ...attributs,
});

const MAINTENANT = Date.parse('2026-09-01T12:30:00.000Z');

const document = (etat: Partial<Parameters<typeof documentDesChats>[0]> = {}): string =>
  documentDesChats({
    conversations: [CONVERSATION()],
    maintenant: MAINTENANT,
    langues: ['fr'],
    moi: 'u1',
    tempsReel: null,
    ...etat,
  });

describe('la ligne d’une conversation', () => {
  it('rend le nom, l’heure relative, l’aperçu et la pastille de non-lus', () => {
    const doc = document();

    expect(doc).toContain('Équipe Lagos');
    expect(doc).toContain('il y a 30 min');
    expect(doc).toContain('On se cale à 15 h pour la revue ?');
    expect(doc).toContain(`<span class="valeur">3</span><span class="hors-ecran"> ${CHATS.nonLus}</span>`);
  });

  it('mène au fil du membre, par l’identifiant de BASE', () => {
    expect(document()).toContain('href="/chats/68f2a81417a557e8ce4ddfbb"');
    expect(document()).not.toContain('href="/chats/lagos"');
  });

  /**
   * § 12.10.2 — « le nombre de participants ne s'affiche pas dans une
   * conversation à deux ». Le SEUIL est unique (`lib/contenu/fil.ts`) : la
   * liste et le fil ne peuvent pas diverger.
   */
  it('se tait à deux, et parle à partir de trois', () => {
    expect(document({ conversations: [CONVERSATION({ membres: 2 })] })).not.toContain(CHATS.participants);
    expect(document({ conversations: [CONVERSATION({ membres: 3 })] })).toContain(`3 ${CHATS.participants}`);
  });

  it('échappe le titre, qui vient du réseau — dans la ligne comme dans son menu', () => {
    const doc = document({ conversations: [CONVERSATION({ titre: '</a><img src=x onerror=alert(1)>' })] });
    const corps = doc.slice(doc.indexOf('<body>'));

    expect(corps).not.toContain('<img src=x');
    expect(corps).toContain('&lt;img src=x');
  });
});

describe('le Prisme d’une ligne', () => {
  const ANGLAIS = CONVERSATION({
    apercu: 'Hello everyone',
    apercuLangueOriginale: 'en',
    apercuTraductions: { fr: 'Bonjour à tous' },
  });

  /**
   * LE TÉMOIN SE POSE SUR UN RANG ≠ 1 (leçon 261). Prisme `['es', 'fr']` :
   * l'espagnol n'est pas servi, le français l'est — la descente ORDONNÉE rend
   * « Bonjour à tous ». Une règle qui court-circuiterait sur la langue d'origine
   * rendrait « Hello everyone », et au rang 1 les deux se ressemblent.
   */
  it('descend le prisme ordonné quand le rang 1 n’est pas servi', () => {
    const doc = document({ conversations: [ANGLAIS], langues: ['es', 'fr'] });

    expect(doc).toContain('Bonjour à tous');
    expect(doc).not.toContain('Hello everyone');
    // Le texte servi porte sa langue, puisqu'elle diffère de celle du document.
    expect(doc).toContain('lang="fr"');
  });

  it('annonce la langue d’ORIGINE sur la pastille, jamais celle qu’il sert', () => {
    const doc = document({ conversations: [ANGLAIS], langues: ['es', 'fr'] });

    expect(doc).toContain('<span class="code">en</span>');
  });

  it('sert l’original, sans pastille, quand la langue d’origine gagne à son rang', () => {
    const doc = document({ conversations: [ANGLAIS], langues: ['en', 'fr'] });

    expect(doc).toContain('Hello everyone');
    expect(doc).toContain('<span class="code"></span>');
  });
});

describe('le menu de chaque ligne', () => {
  const doc = document();

  /**
   * § 12.10.4 — « le geste n'est JAMAIS le seul chemin ». Le menu est un
   * `<details>` natif et un `<form method="post">` : il marche au clavier, au
   * lecteur d'écran, et sans un octet de JavaScript.
   */
  it('porte les trois gestes dans un formulaire réel, atteignable au clavier', () => {
    expect(doc).toContain('<details class="actions">');
    expect(doc).toContain('<form method="post" action="/chats">');
    expect(doc).toContain('name="geste" value="sourdine"');
    expect(doc).toContain('name="geste" value="archiver"');
    expect(doc).toContain('name="geste" value="supprimer"');
    expect(doc).toContain(ACTIONS.menu('Équipe Lagos'));
  });

  it('porte l’état d’AVANT, qui décide du sens de la bascule', () => {
    expect(doc).toContain('name="sourdine" value="0"');
    expect(document({ conversations: [CONVERSATION({ sourdine: true })] })).toContain('name="sourdine" value="1"');
  });

  it('dit « Réactiver le son » sur une ligne déjà en sourdine', () => {
    const muette = document({ conversations: [CONVERSATION({ sourdine: true })] });

    expect(muette).toContain(ACTIONS.sonner);
    expect(muette).toContain(CHATS.sourdine);
  });
});

describe('la lecture du formulaire', () => {
  const formulaire = (entrees: Readonly<Record<string, string>>): FormData => {
    const donnees = new FormData();
    Object.entries(entrees).forEach(([cle, valeur]) => donnees.set(cle, valeur));
    return donnees;
  };

  it('accepte les trois gestes du vocabulaire, et eux seuls', () => {
    expect(soumissionDuGeste(formulaire({ conversation: 'c1', geste: 'archiver' }))).toEqual({
      conversation: 'c1',
      geste: 'archiver',
      sourdine: false,
    });
    expect(soumissionDuGeste(formulaire({ conversation: 'c1', geste: 'bannir' }))).toBeNull();
    expect(soumissionDuGeste(formulaire({ geste: 'archiver' }))).toBeNull();
  });
});

describe('les trois gestes, sur les routes de la passerelle', () => {
  const appels: { url: string; methode: string; corps: string }[] = [];
  const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
    appels.push({ url, methode: options.method ?? 'GET', corps: String(options.body ?? '') });
    return new Response('{"success":true}', { status: 200 });
  };

  beforeEach(() => {
    appels.length = 0;
  });

  it('met en sourdine par la route des préférences, en mise à jour PARTIELLE', async () => {
    const issue = await appliqueLeGeste({
      soumission: { conversation: 'c1', geste: 'sourdine', sourdine: false },
      jeton: 'JWT',
      recuperer,
    });

    expect(issue).toEqual({ genre: 'fait' });
    expect(appels[0]?.methode).toBe('PUT');
    expect(appels[0]?.url).toContain('/api/v1/user-preferences/conversations/c1');
    // Seul `isMuted` voyage : envoyer `isArchived` écraserait l'archivage du
    // lecteur avec une valeur que ce document tenait peut-être d'hier.
    expect(JSON.parse(appels[0]?.corps ?? '{}')).toEqual({ isMuted: true });
  });

  it('rend le son quand la ligne était déjà en sourdine', async () => {
    await appliqueLeGeste({ soumission: { conversation: 'c1', geste: 'sourdine', sourdine: true }, jeton: 'JWT', recuperer });

    expect(JSON.parse(appels[0]?.corps ?? '{}')).toEqual({ isMuted: false });
  });

  it('supprime par `delete-for-me`, jamais par une route de suppression globale', async () => {
    await appliqueLeGeste({ soumission: { conversation: 'c1', geste: 'supprimer', sourdine: false }, jeton: 'JWT', recuperer });

    expect(appels[0]?.methode).toBe('DELETE');
    expect(appels[0]?.url).toContain('/api/v1/conversations/c1/delete-for-me');
  });

  it('lit un 401 comme une session expirée, jamais comme un refus', async () => {
    const issue = await appliqueLeGeste({
      soumission: { conversation: 'c1', geste: 'archiver', sourdine: false },
      jeton: 'JWT',
      recuperer: async () => new Response('{}', { status: 401 }),
    });

    expect(issue).toEqual({ genre: 'session-expiree' });
  });

  /** Un 5xx n'est pas un refus : la passerelle n'a pas tenu son contrat, le geste reste à retenter. */
  it('sépare le refus (4xx) de la panne (5xx)', async () => {
    const refus = await appliqueLeGeste({
      soumission: { conversation: 'c1', geste: 'archiver', sourdine: false },
      jeton: 'JWT',
      recuperer: async () => new Response('{}', { status: 403 }),
    });
    const panne = await appliqueLeGeste({
      soumission: { conversation: 'c1', geste: 'archiver', sourdine: false },
      jeton: 'JWT',
      recuperer: async () => new Response('{}', { status: 502 }),
    });

    expect(refus).toEqual({ genre: 'refus', statut: 403 });
    expect(panne).toEqual({ genre: 'panne' });
  });
});

describe('la porte du POST', () => {
  const poste = (entetes: Readonly<Record<string, string>> = {}): Request =>
    new Request('https://meeshy.me/chats', {
      method: 'POST',
      headers: { cookie: `${COOKIE_DE_SESSION}=abc; ${COOKIE_DE_JETON}=JWT.xyz`, 'content-type': 'application/x-www-form-urlencoded', ...entetes },
      body: 'conversation=c1&geste=archiver&sourdine=0',
    });

  /**
   * Un formulaire auto-soumis par un site tiers ne doit pas pouvoir archiver les
   * conversations d'un lecteur connecté. `Sec-Fetch-Site` tranche, et le refus
   * est un état DESSINÉ, jamais un 403 nu.
   */
  it('refuse un formulaire venu d’un autre site', async () => {
    const reponse = await GESTE_SUR_UNE_LIGNE(poste({ 'sec-fetch-site': 'cross-site' }));

    expect(reponse.status).toBe(403);
    expect(await reponse.text()).toContain('Ce formulaire ne vient pas de Meeshy');
  });

  it('renvoie se connecter sans jeton', async () => {
    const reponse = await GESTE_SUR_UNE_LIGNE(
      new Request('https://meeshy.me/chats', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body: '' }),
    );

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fchats');
  });
});

describe('la confirmation servie après un geste', () => {
  it('ne rend une phrase que pour une clé du vocabulaire clos', () => {
    expect(document({ fait: 'archiver' })).toContain(CONFIRMATIONS.archiver);
    expect(document({ fait: null })).not.toContain(CONFIRMATIONS.archiver);
  });

  it('dit l’échec dans une alerte, jamais dans le silence', () => {
    expect(document({ echoue: true })).toContain(ACTIONS.echec);
  });

  /**
   * La région `aria-live` est SERVIE, même vide : créée après coup, elle n'est
   * annoncée par aucun lecteur d'écran — et c'est elle que le module remplit.
   */
  it('sert la région qui parlera, avant d’avoir quoi que ce soit à dire', () => {
    expect(document()).toContain('id="journal-des-gestes" role="status" aria-live="polite"');
  });
});

describe('la greffe du temps réel', () => {
  const TEMPS_REEL = {
    passerelle: 'https://gate.meeshy.me',
    actifs: {
      participate: { nom: 'participate.a.js', url: '/__v3/rt/participate.a.js', corps: '' },
      liste: { nom: 'liste.b.js', url: '/__v3/rt/liste.b.js', corps: '' },
      feed: { nom: 'feed.b.js', url: '/__v3/rt/feed.b.js', corps: '' },
      notifs: { nom: 'notifs.f.js', url: '/__v3/rt/notifs.f.js', corps: '' },
      contacts: { nom: 'contacts.f.js', url: '/__v3/rt/contacts.f.js', corps: '' },
      recherche: { nom: 'recherche.f.js', url: '/__v3/rt/recherche.f.js', corps: '' },
      liens: { nom: 'liens.f.js', url: '/__v3/rt/liens.f.js', corps: '' },
      commentaires: { nom: 'commentaires.f.js', url: '/__v3/rt/commentaires.f.js', corps: '' },
      plein: { nom: 'plein.f.js', url: '/__v3/rt/plein.f.js', corps: '' },
      navigateur: { nom: 'navigateur.f.js', url: '/__v3/rt/navigateur.f.js', corps: '' },
      composer: { nom: 'composer.f.js', url: '/__v3/rt/composer.f.js', corps: '' },
      prefs: { nom: 'prefs.f.js', url: '/__v3/rt/prefs.f.js', corps: '' },
      socket: { nom: 'socket.io.c.js', url: '/__v3/rt/socket.io.c.js', corps: '' },
    },
  };

  it('nomme SON module — jamais celui du fil', () => {
    const doc = document({ tempsReel: TEMPS_REEL });

    expect(doc).toContain('data-participation="liste"');
    expect(doc).toContain('data-module="/__v3/rt/liste.b.js"');
    expect(doc).not.toContain('/__v3/rt/participate.a.js');
  });

  /** Sans temps réel, AUCUN script applicatif ne part — le document reste ce qu'il est. */
  it('ne pose ni attribut ni chargeur quand le temps réel n’est pas servi', () => {
    const doc = document({ tempsReel: null });

    expect(doc).not.toContain('data-participation');
    expect(doc).not.toContain('type="module"');
  });
});

/**
 * LA DISPOSITION DE LA CIBLE (#5164, `cible/chats.png`) — l'en-tête, les deux
 * puces d'action, la puce du Prisme, et la conversation mise en avant.
 */
describe('l’en-tête et les deux actions de la cible', () => {
  it('rend « Chats » et son sous-titre, jamais l’ancienne action primaire unique', () => {
    const doc = document();

    expect(doc).toContain(`<h1>${CHATS.titre}</h1>`);
    expect(doc).toContain(`<p>${CHATS.accroche}</p>`);
    expect(doc).toContain(`<title>${CHATS.titre} — Meeshy</title>`);
    // L'action primaire unique d'avant ce lot a disparu : deux puces la
    // remplacent, jamais un troisième contrôle qui ferait doublon.
    expect(doc).not.toContain('class="action primaire" href="/chats?nouvelle"');
  });

  it('porte deux puces contour de même rang, dans l’ordre de la cible', () => {
    const doc = document();
    const corps = doc.slice(doc.indexOf('<body>'));

    expect(corps).toContain('<nav class="actions-rapides" aria-label="Actions rapides">');
    expect(corps).toContain('<a class="action contour" href="/links?nouveau">');
    expect(corps).toContain(`href="/links?nouveau">`);
    expect(corps).toContain(CHATS.actionLien);
    expect(corps).toContain('<a class="action contour" href="/chats?nouvelle"');
    expect(corps).toContain(CHATS.actionConversation);
    // Le texte VISIBLE est raccourci ; le nom ACCESSIBLE porte le plein mot
    // (celui du titre de la feuille qu'elle ouvre) — jamais l'inverse.
    expect(corps).toContain(`aria-label="${NOUVELLE_CONVERSATION.ouvrir}"`);

    // L'ORDRE : le lien avant la conversation, comme la cible les dessine
    // côte à côte de gauche à droite.
    expect(corps.indexOf('/links?nouveau')).toBeLessThan(corps.indexOf('/chats?nouvelle'));
  });

  it('place les deux puces AVANT la puce du Prisme, elle-même AVANT la section de la liste', () => {
    const doc = document();
    const corps = doc.slice(doc.indexOf('<body>'));

    const actions = corps.indexOf('class="actions-rapides"');
    const prisme = corps.indexOf('class="puce prisme"');
    const liste = corps.indexOf('class="liste"');

    expect(actions).toBeGreaterThan(-1);
    expect(prisme).toBeGreaterThan(actions);
    expect(liste).toBeGreaterThan(prisme);
  });
});

describe('la puce Prisme de la liste', () => {
  it('dit « AUTO · <langue> », dans la langue de RANG 1 du prisme du lecteur', () => {
    const doc = document({ langues: ['es', 'fr'] });

    expect(doc).toContain('<p class="puce prisme"');
    expect(doc).toContain('espagnol');
    expect(doc).not.toContain('français<');
  });

  /** Aucun chevron, aucun contrôle : la feuille des langues n'est pas servie ici non plus (règle 7). */
  it('n’est ni un lien ni un bouton — elle n’ouvre rien', () => {
    const doc = document();
    const corps = doc.slice(doc.indexOf('<body>'));
    const debut = corps.indexOf('class="puce prisme"');
    const balise = corps.slice(Math.max(0, corps.lastIndexOf('<', debut)), debut);

    expect(balise.trim().startsWith('<p')).toBe(true);
  });
});

describe('la conversation mise en avant', () => {
  const A = CONVERSATION({ id: 'a', titre: 'A', nonLus: 0, dernierMessageA: '2026-09-01T12:00:00.000Z' });
  const B = CONVERSATION({ id: 'b', titre: 'B', nonLus: 3, dernierMessageA: '2026-09-01T11:00:00.000Z' });
  const C = CONVERSATION({ id: 'c', titre: 'C', nonLus: 5, dernierMessageA: '2026-09-01T10:00:00.000Z' });

  it('élit la PREMIÈRE non lue de l’ordre servi — pas la plus non lue, pas la première tout court', () => {
    const doc = document({ conversations: [A, B, C] });

    expect(doc).toContain('<li class="vedette" data-conversation="b"');
    expect(doc).not.toContain('<li class="vedette" data-conversation="a"');
    expect(doc).not.toContain('<li class="vedette" data-conversation="c"');
  });

  it('porte les mêmes fentes qu’une ligne plate — pistes, menu à trois gestes, compte', () => {
    const doc = document({ conversations: [A, B, C] });
    const ligneB = doc.slice(doc.indexOf('data-conversation="b"'), doc.indexOf('data-conversation="c"'));

    expect(ligneB).toContain('piste avant');
    expect(ligneB).toContain('piste apres');
    expect(ligneB).toContain('<details class="actions">');
    expect(ligneB.match(/name="geste" value="/g)?.length).toBe(3);
    expect(ligneB).toContain('<span class="compte">');
  });

  it('n’élit personne quand rien n’est non lu', () => {
    const doc = document({ conversations: [CONVERSATION({ id: 'a', nonLus: 0 }), CONVERSATION({ id: 'z', nonLus: 0 })] });

    expect(doc).not.toContain('class="vedette"');
  });

  it('garde `.langue` AVANT `.texte` dans l’aperçu, vedette comme ligne plate (règles 15/30)', () => {
    const doc = document({
      conversations: [
        B,
        CONVERSATION({ id: 'es', nonLus: 0, apercu: 'Gracias', apercuLangueOriginale: 'es', apercuTraductions: { fr: 'Merci' } }),
      ],
      langues: ['fr'],
    });
    const ligneVedette = doc.slice(doc.indexOf('data-conversation="b"'), doc.indexOf('data-conversation="es"'));
    const lignePlate = doc.slice(doc.indexOf('data-conversation="es"'));

    expect(ligneVedette.indexOf('class="langue"')).toBeLessThan(ligneVedette.indexOf('class="texte"'));
    expect(lignePlate.indexOf('class="langue"')).toBeLessThan(lignePlate.indexOf('class="texte"'));
  });

  it('tait le compte de participants à deux, même en vedette — et le dit à trois', () => {
    const doc2 = document({ conversations: [CONVERSATION({ id: 'b', nonLus: 3, membres: 2 })] });
    const doc3 = document({ conversations: [CONVERSATION({ id: 'b', nonLus: 3, membres: 3 })] });

    expect(doc2).not.toContain(CHATS.participants);
    expect(doc3).toContain(`3 ${CHATS.participants}`);
  });
});

describe('vedetteDe', () => {
  it('rend l’identifiant de la PREMIÈRE non lue, dans l’ordre du tableau', () => {
    expect(vedetteDe([{ id: 'a', nonLus: 0 }, { id: 'b', nonLus: 3 }, { id: 'c', nonLus: 5 }])).toBe('b');
  });

  it('rend `null` quand personne n’est non lu', () => {
    expect(vedetteDe([{ id: 'a', nonLus: 0 }, { id: 'b', nonLus: 0 }])).toBeNull();
  });

  it('rend `null` sur une liste vide', () => {
    expect(vedetteDe([])).toBeNull();
  });
});

/**
 * LE POIDS DU DOCUMENT — le même patron que `fil-plein.test.ts` et
 * `medias-plein.test.ts` : un RATCHET, sur une fixture FIXE, pour que le
 * chiffre suive le CODE et non les données. `documents_de_la_liste` NAÎT dans
 * ce commit — un poids non mesuré ne s'invente pas.
 */
describe('le poids du document de la liste', () => {
  const octets = (source: string): number => gzipSync(Buffer.from(source, 'utf8'), { level: 9 }).length;
  const mesures = JSON.parse(readFileSync(join(__dirname, '..', 'budgets-mesures.json'), 'utf8')) as {
    readonly documents_de_la_liste: { readonly liste_o: number };
  };

  const FIXE = [
    CONVERSATION({ id: 'a', titre: 'Équipe Lagos', nonLus: 3, membres: 4 }),
    CONVERSATION({
      id: 'b',
      titre: 'Marta Ruiz',
      nonLus: 0,
      membres: 2,
      apercu: 'Gracias, te envío el archivo',
      apercuLangueOriginale: 'es',
      apercuTraductions: { fr: 'Merci, je t’envoie le fichier' },
    }),
    CONVERSATION({ id: 'c', titre: 'Support produit', nonLus: 0, membres: 6, apercu: 'Appel audio manqué' }),
  ];

  it('ne laisse pas le document de la liste grossir en silence', () => {
    const poids = octets(document({ conversations: FIXE }));
    console.log(`[mesure] document de la liste ${poids} o gzip`);

    expect(poids).toBeLessThanOrEqual(mesures.documents_de_la_liste.liste_o);
  });
});
