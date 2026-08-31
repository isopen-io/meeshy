/**
 * @jest-environment node
 */

import {
  apercuDadhesion,
  CAUSES_DE_REFUS,
  droitsDepuis,
  quitteLaPlace,
  rejoindreLeLien,
  revalideLaPlace,
  type CauseDeRefus,
} from '@/lib/api/adhesion';
import { identiteDuVisiteur } from '@/lib/api/passerelle';

/**
 * Ce que la passerelle DIT quand un visiteur sans compte se présente — et ce que
 * l'écran en fait. Un refus qui n'a pas de nom ici n'a pas d'état peint là-bas.
 */

const APERCU = {
  success: true,
  data: {
    id: '507f1f77bcf86cd799439011',
    linkId: 'mshy_lagos',
    name: 'Équipe Lagos',
    description: 'On prépare la revue de mars.',
    expiresAt: '2026-09-30T10:00:00.000Z',
    maxUses: 20,
    currentUses: 6,
    maxConcurrentUsers: null,
    currentConcurrentUsers: 3,
    requireAccount: false,
    requireNickname: true,
    requireEmail: false,
    requireBirthday: false,
    allowedLanguages: ['fr', 'en'],
    conversation: { id: 'c1', title: 'Équipe Lagos', description: null },
    creator: { id: 'u1', username: 'ibrahim', email: 'ibrahim@example.com' },
    stats: { totalParticipants: 9, spokenLanguages: ['en', 'fr', 'yo'] },
  },
} as const;

const reponse = (statut: number, corps: unknown): Response =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });

const journalise = (reponses: readonly Response[]) => {
  const appels: { url: string; options?: RequestInit }[] = [];
  let rang = 0;
  return {
    appels,
    recuperer: (url: string, options?: RequestInit): Promise<Response> => {
      appels.push({ url, options });
      const suivante = reponses[Math.min(rang, reponses.length - 1)];
      rang += 1;
      return Promise.resolve((suivante ?? reponse(200, {})).clone());
    },
  };
};

const BASE = 'http://passerelle.test';

describe("l'aperçu d'un lien d'invitation", () => {
  it('projette ce que l’écran rend, et RIEN du créateur', async () => {
    const { recuperer } = journalise([reponse(200, APERCU)]);

    const vu = await apercuDadhesion({ identifiant: 'lagos', base: BASE, recuperer });

    expect(vu).toEqual({
      etat: 'ouvert',
      lien: {
        cle: 'mshy_lagos',
        nom: 'Équipe Lagos',
        invitation: 'On prépare la revue de mars.',
        exigePseudo: true,
        exigeEmail: false,
        exigeNaissance: false,
        exigeCompte: false,
        echeance: Date.parse('2026-09-30T10:00:00.000Z'),
        placesRestantes: 14,
        languesDuLien: ['fr', 'en'],
        languesParlees: ['en', 'fr', 'yo'],
      },
    });
    expect(JSON.stringify(vu)).not.toContain('ibrahim');
  });

  it('rend l’aperçu par la porte anonyme, jamais par celle qui exige l’historique', async () => {
    const { appels, recuperer } = journalise([reponse(200, APERCU)]);

    await apercuDadhesion({ identifiant: 'lagos', base: BASE, recuperer });

    expect(appels[0]?.url).toBe(`${BASE}/api/v1/anonymous/link/lagos`);
  });

  it('retombe sur le titre de la conversation quand le lien n’est pas nommé', async () => {
    const anonyme = {
      ...APERCU,
      data: { ...APERCU.data, name: null, description: null },
    };
    const { recuperer } = journalise([reponse(200, anonyme)]);

    const vu = await apercuDadhesion({ identifiant: 'lagos', base: BASE, recuperer });

    expect(vu).toMatchObject({ etat: 'ouvert', lien: { nom: 'Équipe Lagos', invitation: null } });
  });

  it('ne compte aucune place restante quand le lien n’en plafonne aucune', async () => {
    const sansPlafond = { ...APERCU, data: { ...APERCU.data, maxUses: null } };
    const { recuperer } = journalise([reponse(200, sansPlafond)]);

    expect(await apercuDadhesion({ identifiant: 'lagos', base: BASE, recuperer })).toMatchObject({
      lien: { placesRestantes: null },
    });
  });

  it('nomme la cause quand la porte ferme (410)', async () => {
    const { recuperer } = journalise([reponse(410, { success: false, error: 'LINK_MAX_USES' })]);

    expect(await apercuDadhesion({ identifiant: 'lagos', base: BASE, recuperer })).toEqual({
      etat: 'refus',
      refus: { cause: 'lien-epuise', suggestion: null },
    });
  });

  it('ne distingue pas l’inconnu du disparu (404)', async () => {
    const { recuperer } = journalise([reponse(404, { success: false, error: 'NOT_FOUND' })]);

    expect(await apercuDadhesion({ identifiant: 'lagos', base: BASE, recuperer })).toEqual({
      etat: 'introuvable',
    });
  });

  it('dit « indisponible », jamais « fermé », quand la passerelle se tait', async () => {
    const recuperer = (): Promise<Response> => Promise.reject(new Error('ECONNREFUSED'));

    expect(await apercuDadhesion({ identifiant: 'lagos', base: BASE, recuperer })).toEqual({
      etat: 'indisponible',
    });
  });
});

describe("rejoindre en anonyme", () => {
  const admis = {
    success: true,
    data: {
      sessionToken: 'jeton-opaque',
      participant: {
        id: 'p1',
        username: 'tolu',
        displayName: 'tolu',
        canSendMessages: true,
        canSendFiles: false,
        canSendImages: true,
        language: 'yo',
      },
      conversation: { id: 'c1', title: 'Équipe Lagos', allowViewHistory: true },
      linkId: 'mshy_lagos',
      id: '507f1f77bcf86cd799439011',
    },
  };

  it('poste le pseudo et la langue sur la porte à police complète, et rend la place', async () => {
    const { appels, recuperer } = journalise([reponse(201, admis)]);

    const verdict = await rejoindreLeLien({
      identifiant: 'lagos',
      demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
      base: BASE,
      recuperer,
    });

    expect(verdict).toEqual({
      etat: 'admis',
      cle: 'mshy_lagos',
      session: {
        jeton: 'jeton-opaque',
        participantId: 'p1',
        pseudo: 'Tolu',
        langue: 'yo',
        nom: 'Équipe Lagos',
        conversationId: 'c1',
        droits: { ecrire: true, fichiers: false, images: true, historique: true },
      },
    });
    expect(appels[0]?.url).toBe(`${BASE}/api/v1/anonymous/join/lagos`);
    expect(JSON.parse(String(appels[0]?.options?.body))).toMatchObject({
      username: 'Tolu',
      language: 'fr',
    });
  });

  /**
   * L'aller-retour d'aperçu PRÉ-VOL a été retiré : la passerelle normalise elle-
   * même `linkId` / `identifier` / ObjectId (`resolveShareLinkId`), et c'est le
   * 201 qui NOMME la place. Le témoin compte les appels, parce que c'est la
   * seule chose que le visiteur paie — jusqu'à 2 500 ms de plus sur le chemin le
   * plus chaud du rôle premier.
   */
  it('ne paie AUCUN aller-retour de plus que le join lui-même', async () => {
    const { appels, recuperer } = journalise([reponse(201, admis)]);

    await rejoindreLeLien({
      identifiant: 'lagos',
      demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
      base: BASE,
      recuperer,
    });

    expect(appels).toHaveLength(1);
    expect(appels[0]?.options?.method).toBe('POST');
  });

  /**
   * Le segment d'URL vaut indifféremment `linkId`, `identifier` ou l'ObjectId :
   * il ADRESSE le POST, il ne NOMME pas la place. Le nom canonique vient du 201.
   */
  it("poste sur le SEGMENT et nomme la place avec ce que le 201 rend", async () => {
    const { appels, recuperer } = journalise([reponse(201, admis)]);

    const verdict = await rejoindreLeLien({
      identifiant: '507f1f77bcf86cd799439011',
      demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
      base: BASE,
      recuperer,
    });

    expect(appels[0]?.url).toContain('/anonymous/join/507f1f77bcf86cd799439011');
    expect(verdict).toMatchObject({ etat: 'admis', cle: 'mshy_lagos' });
  });

  it("n'admet personne quand le 201 ne NOMME pas la place", async () => {
    const sansCle = { success: true, data: { ...admis.data, linkId: null } };
    const { recuperer } = journalise([reponse(201, sansCle)]);

    expect(
      await rejoindreLeLien({
        identifiant: 'lagos',
        demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
        base: BASE,
        recuperer,
      }),
    ).toEqual({ etat: 'indetermine' });
  });

  it("n'envoie ni e-mail ni date quand le visiteur n'en donne pas", async () => {
    const { appels, recuperer } = journalise([reponse(201, admis)]);

    await rejoindreLeLien({
      identifiant: 'lagos',
      demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
      base: BASE,
      recuperer,
    });

    const corps = JSON.parse(String(appels[0]?.options?.body)) as Record<string, unknown>;
    expect(corps).not.toHaveProperty('email');
    expect(corps).not.toHaveProperty('birthday');
  });

  it('refuse sans appeler la passerelle quand le pseudo manque', async () => {
    const { appels, recuperer } = journalise([reponse(201, admis)]);

    const verdict = await rejoindreLeLien({
      identifiant: 'lagos',
      demande: { pseudo: '   ', langue: 'fr', email: '', naissance: '' },
      base: BASE,
      recuperer,
    });

    expect(verdict).toEqual({ etat: 'refus', refus: { cause: 'champ-requis', suggestion: null } });
    expect(appels).toHaveLength(0);
  });

  const refus: readonly (readonly [number, string, CauseDeRefus])[] = [
    [403, 'REQUIRES_ACCOUNT', 'compte-requis'],
    [403, 'ACCOUNT_REQUIRED', 'compte-requis'],
    [403, 'COUNTRY_NOT_ALLOWED', 'zone-refusee'],
    [403, 'REGION_NOT_ALLOWED', 'zone-refusee'],
    [403, 'IP_NOT_ALLOWED', 'zone-refusee'],
    [403, 'LANGUAGE_NOT_ALLOWED', 'langue-refusee'],
    [403, 'BANNED', 'banni'],
    [410, 'LINK_INACTIVE', 'lien-desactive'],
    [410, 'LINK_DEACTIVATED', 'lien-desactive'],
    [410, 'LINK_EXPIRED', 'lien-expire'],
    [410, 'CONVERSATION_CLOSED', 'conversation-terminee'],
    [410, 'LINK_MAX_USES', 'lien-epuise'],
    [409, 'LINK_EXHAUSTED', 'lien-epuise'],
    [429, 'MAX_CONCURRENT_USERS', 'lien-epuise'],
    [400, 'Donnees invalides', 'champ-requis'],
    [404, 'NOT_FOUND', 'introuvable'],
    [403, 'UN_CODE_QUE_PERSONNE_NE_CONNAIT', 'indetermine'],
  ];

  it.each(refus)('rend %s %s comme « %s »', async (statut, code, cause) => {
    const { recuperer } = journalise([
      reponse(statut, { success: false, error: code, message: 'refus' }),
    ]);

    expect(
      await rejoindreLeLien({
        identifiant: 'lagos',
        demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
        base: BASE,
        recuperer,
      }),
    ).toEqual(
      cause === 'introuvable'
        ? { etat: 'introuvable' }
        : { etat: 'refus', refus: { cause, suggestion: null } },
    );
  });

  it('rend le pseudo de rechange que la passerelle propose (409)', async () => {
    const { recuperer } = journalise([
      reponse(409, {
        success: false,
        error: 'USERNAME_TAKEN_IN_CONVERSATION',
        suggestedNickname: 'Tolu2',
      }),
    ]);

    expect(
      await rejoindreLeLien({
        identifiant: 'lagos',
        demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
        base: BASE,
        recuperer,
      }),
    ).toEqual({ etat: 'refus', refus: { cause: 'pseudo-pris', suggestion: 'Tolu2' } });
  });

  it("ne prend pas une PANNE de la passerelle (500) pour un refus", async () => {
    const { recuperer } = journalise([reponse(500, { success: false, error: 'INTERNAL' })]);

    expect(
      await rejoindreLeLien({
        identifiant: 'lagos',
        demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
        base: BASE,
        recuperer,
      }),
    ).toEqual({ etat: 'indisponible' });
  });

  it('ne prend pas une coupure de réseau pour un refus', async () => {
    const recuperer = (): Promise<Response> => Promise.reject(new Error('ECONNRESET'));

    expect(
      await rejoindreLeLien({
        identifiant: 'lagos',
        demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
        base: BASE,
        recuperer,
      }),
    ).toEqual({ etat: 'indisponible' });
  });

  it('n’admet personne sans jeton, même sur un 201', async () => {
    const { recuperer } = journalise([
      reponse(201, { success: true, data: { linkId: 'mshy_lagos', participant: { id: 'p1' } } }),
    ]);

    expect(
      await rejoindreLeLien({
        identifiant: 'lagos',
        demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
        base: BASE,
        recuperer,
      }),
    ).toEqual({ etat: 'indetermine' });
  });

  it('énumère TOUTES les causes que l’écran doit savoir peindre', () => {
    expect([...CAUSES_DE_REFUS].sort()).toEqual(
      [
        'banni',
        'champ-requis',
        'compte-requis',
        'conversation-terminee',
        'indetermine',
        'introuvable',
        'langue-refusee',
        'lien-desactive',
        'lien-epuise',
        'lien-expire',
        'pseudo-pris',
        'zone-refusee',
      ].sort(),
    );
  });
});

/**
 * L'IDENTITÉ RÉSEAU DU VISITEUR — le témoin que le lot précédent n'avait pas.
 *
 * L'appel part SERVEUR-À-SERVEUR : sans transfert explicite, la passerelle voit
 * l'adresse du conteneur `meeshy-frontend-v3`, la MÊME pour tous les visiteurs.
 * `admitLinkEntry` évalue alors `allowedIpRanges` sur une constante — ou bien
 * tout le monde est refusé (`REGION_NOT_ALLOWED`, que l'écran peint en
 * non-réessayable : un cul-de-sac), ou bien tout le monde passe pendant que
 * l'hôte du lien croit filtrer. Et `anonymousSession.ipAddress`, persisté à
 * chaque entrée, devient la même valeur pour tout invité de la v3.
 *
 * Le bouchon ci-dessous REFUSE quand l'en-tête ne porte pas l'adresse attendue :
 * un témoin qui se contenterait de lire les en-têtes envoyés attesterait leur
 * présence, pas leur effet.
 */
describe("l'identité réseau du visiteur", () => {
  const entetes = (paires: Readonly<Record<string, string>>) => ({
    get: (nom: string): string | null => paires[nom.toLowerCase()] ?? null,
  });

  const VISITEUR = '102.89.34.7';

  /** La passerelle de bouchon : elle n'admet que l'adresse qu'elle attend. */
  const passerelleQuiFiltre = (attendue: string) => {
    const recuperer = (_url: string, options?: RequestInit): Promise<Response> => {
      const envoyes = (options?.headers ?? {}) as Record<string, string>;
      const chaine = envoyes['x-forwarded-for'] ?? '';
      const vue = chaine.split(',').map((part) => part.trim()).at(-1) ?? '';

      return Promise.resolve(
        vue === attendue
          ? reponse(201, {
              success: true,
              data: {
                sessionToken: 'jeton-opaque',
                participant: { id: 'p1' },
                linkId: 'mshy_lagos',
              },
            })
          : reponse(403, { success: false, error: 'REGION_NOT_ALLOWED' }),
      );
    };
    return recuperer;
  };

  const rejoint = (identite?: Parameters<typeof rejoindreLeLien>[0]['identite']) =>
    rejoindreLeLien({
      identifiant: 'lagos',
      demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
      identite,
      base: BASE,
      recuperer: passerelleQuiFiltre(VISITEUR),
    });

  it("laisse entrer un visiteur dont l'adresse est admise par le lien", async () => {
    const identite = identiteDuVisiteur(entetes({ 'x-forwarded-for': VISITEUR }));

    expect(await rejoint(identite)).toMatchObject({ etat: 'admis' });
  });

  it("refuse le même visiteur quand l'identité ne voyage PAS — le défaut mesuré", async () => {
    expect(await rejoint(undefined)).toEqual({
      etat: 'refus',
      refus: { cause: 'zone-refusee', suggestion: null },
    });
  });

  /**
   * La chaîne part VERBATIM : Traefik APPEND l'adresse du pair, donc ce qu'un
   * client écrit lui-même reste à GAUCHE et la passerelle, qui fait confiance
   * aux `TRUST_PROXY_HOPS` derniers maillons, lit toujours le nôtre. La
   * nettoyer casserait cet invariant.
   */
  it('recopie la chaîne de transfert telle quelle, sans la tronquer', async () => {
    const identite = identiteDuVisiteur(
      entetes({ 'x-forwarded-for': `1.2.3.4, ${VISITEUR}` }),
    );

    expect(await rejoint(identite)).toMatchObject({ etat: 'admis' });
  });

  /** La passerelle n'établit `request.ip` que depuis `x-forwarded-for` : se taire y vaudrait le conteneur. */
  it('synthétise la chaîne depuis `x-real-ip` quand le mandataire n’a posé que celui-là', async () => {
    const identite = identiteDuVisiteur(entetes({ 'x-real-ip': VISITEUR }));

    expect(await rejoint(identite)).toMatchObject({ etat: 'admis' });
  });

  it("n'invente aucune adresse quand la requête n'en porte aucune", async () => {
    const appels: RequestInit[] = [];
    const recuperer = (_url: string, options?: RequestInit): Promise<Response> => {
      appels.push(options ?? {});
      return Promise.resolve(reponse(200, APERCU));
    };

    await apercuDadhesion({
      identifiant: 'lagos',
      identite: identiteDuVisiteur(entetes({})),
      base: BASE,
      recuperer,
    });

    const envoyes = (appels[0]?.headers ?? {}) as Record<string, string>;
    expect(envoyes).not.toHaveProperty('x-forwarded-for');
    expect(envoyes).not.toHaveProperty('x-real-ip');
  });

  /**
   * Répandre les en-têtes entrants ferait partir la session d'un lecteur
   * CONNECTÉ de la zone legacy vers une porte anonyme. Deux en-têtes NOMMÉS, et
   * rien d'autre.
   */
  it('ne fait voyager NI cookie NI authorization', async () => {
    const appels: RequestInit[] = [];
    const recuperer = (_url: string, options?: RequestInit): Promise<Response> => {
      appels.push(options ?? {});
      return Promise.resolve(reponse(200, APERCU));
    };

    await apercuDadhesion({
      identifiant: 'lagos',
      identite: identiteDuVisiteur(
        entetes({
          'x-forwarded-for': VISITEUR,
          cookie: 'meeshy.session=secret',
          authorization: 'Bearer secret',
        }),
      ),
      base: BASE,
      recuperer,
    });

    const envoyes = (appels[0]?.headers ?? {}) as Record<string, string>;
    expect(envoyes['x-forwarded-for']).toBe(VISITEUR);
    expect(JSON.stringify(envoyes)).not.toContain('secret');
  });

  it("transporte aussi l'identité sur l'APERÇU — le limiteur de débit clé sur la même adresse", async () => {
    const appels: RequestInit[] = [];
    const recuperer = (_url: string, options?: RequestInit): Promise<Response> => {
      appels.push(options ?? {});
      return Promise.resolve(reponse(200, APERCU));
    };

    await apercuDadhesion({
      identifiant: 'lagos',
      identite: identiteDuVisiteur(entetes({ 'x-forwarded-for': VISITEUR })),
      base: BASE,
      recuperer,
    });

    expect((appels[0]?.headers ?? {}) as Record<string, string>).toMatchObject({
      'x-forwarded-for': VISITEUR,
    });
  });
});

/**
 * LES QUATRE DROITS D'UNE PLACE, lus sur la charge qui les sert (issue #4523).
 *
 * `droitsDepuis` est écrit pour une CHARGE, pas pour un appel : le 201 du join
 * et le 200 de `POST /anonymous/refresh` sont composés par le MÊME
 * `participantConversationPayload` côté passerelle, et le battement du § 6.3 B
 * relira les droits par cette fonction plutôt que par une jumelle.
 */
describe('ce que la place ouvre', () => {
  const charge = (
    participant: Readonly<Record<string, unknown>>,
    conversation: Readonly<Record<string, unknown>>,
  ) => ({ sessionToken: 'jeton', participant: { id: 'p1', ...participant }, conversation });

  it('lit les quatre booléens que la porte d’admission sert', () => {
    expect(
      droitsDepuis(
        charge(
          { canSendMessages: true, canSendFiles: false, canSendImages: true },
          { id: 'c1', allowViewHistory: false },
        ),
      ),
    ).toEqual({ ecrire: true, fichiers: false, images: true, historique: false });
  });

  it('sait dire « aucun droit », qui n’est pas la même chose que « je ne sais pas »', () => {
    expect(
      droitsDepuis(
        charge(
          { canSendMessages: false, canSendFiles: false, canSendImages: false },
          { id: 'c1', allowViewHistory: false },
        ),
      ),
    ).toEqual({ ecrire: false, fichiers: false, images: false, historique: false });
  });

  /**
   * Une charge PARTIELLE ne se complète pas : compléter par `false` retirerait
   * un droit accordé, compléter par `true` en promettrait un qui ne l'est pas.
   */
  it.each([
    ['sans conversation', { canSendMessages: true, canSendFiles: true, canSendImages: true }, null],
    [
      'sans allowViewHistory',
      { canSendMessages: true, canSendFiles: true, canSendImages: true },
      { id: 'c1' },
    ],
    ['sans canSendFiles', { canSendMessages: true, canSendImages: true }, { id: 'c1', allowViewHistory: true }],
    [
      'avec un droit non booléen',
      { canSendMessages: 'oui', canSendFiles: true, canSendImages: true },
      { id: 'c1', allowViewHistory: true },
    ],
  ])('ne conclut RIEN sur une charge %s', (_cas, participant, conversation) => {
    const donnee =
      conversation === null
        ? { sessionToken: 'jeton', participant: { id: 'p1', ...participant } }
        : charge(participant, conversation);

    expect(droitsDepuis(donnee)).toBeNull();
  });

  it('ouvre la place même quand la porte ne dit rien des droits', async () => {
    const { recuperer } = journalise([
      reponse(201, {
        success: true,
        data: {
          sessionToken: 'jeton-opaque',
          participant: { id: 'p1' },
          conversation: { id: 'c1' },
          linkId: 'mshy_lagos',
        },
      }),
    ]);

    const verdict = await rejoindreLeLien({
      identifiant: 'lagos',
      demande: { pseudo: 'Tolu', langue: 'fr', email: '', naissance: '' },
      base: BASE,
      recuperer,
    });

    expect(verdict).toMatchObject({ etat: 'admis' });
    expect(verdict).toHaveProperty('session.droits', null);
  });
});

/**
 * LA PORTE DE LA PLACE — `POST /anonymous/refresh` (§ 6.3 B, F, G).
 *
 * Ce que ces témoins gardent n'est pas « l'appel part » mais l'AUTORITÉ : une
 * place et un lien sont deux objets qui ne meurent pas ensemble, et c'est cette
 * porte-ci — celle qui prend le JETON — qui dit si une place vaut encore
 * quelque chose. Les quatre droits en reviennent RE-LUS : l'hôte a pu les
 * changer depuis l'entrée, et l'écran des droits est précisément celui qui
 * l'affirme.
 */
describe('l’état d’une place, demandé à la porte qui la connaît', () => {
  const relue = {
    success: true,
    data: {
      participant: {
        id: 'p1',
        username: 'tolu',
        language: 'yo',
        canSendMessages: false,
        canSendFiles: true,
        canSendImages: false,
      },
      conversation: { id: 'c1', title: 'Équipe Lagos', allowViewHistory: true },
    },
  };

  it('poste le JETON — jamais le lien — et rend les droits RE-LUS', async () => {
    const { appels, recuperer } = journalise([reponse(200, relue)]);

    const etat = await revalideLaPlace({ jeton: 'jeton-opaque', base: BASE, recuperer });

    expect(etat).toEqual({
      etat: 'valide',
      place: {
        droits: { ecrire: false, fichiers: true, images: false, historique: true },
        langue: 'yo',
        nom: 'Équipe Lagos',
        conversationId: 'c1',
      },
    });
    expect(appels[0]?.url).toBe(`${BASE}/api/v1/anonymous/refresh`);
    expect(JSON.parse(String(appels[0]?.options?.body))).toEqual({ sessionToken: 'jeton-opaque' });
  });

  /** L'état F : `isActive:false`. Cet appel EST le refresh de contrôle du § 6.3 F. */
  it('rend « close » sur un 401 — la seule cause réelle de perte de place', async () => {
    const { recuperer } = journalise([reponse(401, { success: false, error: 'UNAUTHORIZED' })]);

    expect(await revalideLaPlace({ jeton: 'jeton', base: BASE, recuperer })).toEqual({
      etat: 'close',
    });
  });

  /**
   * L'état G : le lien meurt, la place tient. La CAUSE est nommée — l'écran doit
   * dire « ce lien a expiré » et non « quelque chose s'est mal passé ».
   */
  it.each([
    ['LINK_EXPIRED', 'lien-expire'],
    ['LINK_DEACTIVATED', 'lien-desactive'],
    ['CONVERSATION_CLOSED', 'conversation-terminee'],
  ])('rend « lien-mort » et NOMME la cause sur un 410 %s', async (code, cause) => {
    const { recuperer } = journalise([reponse(410, { success: false, error: code })]);

    expect(await revalideLaPlace({ jeton: 'jeton', base: BASE, recuperer })).toEqual({
      etat: 'lien-mort',
      cause,
    });
  });

  /**
   * « Erreur réseau ≠ 401 » (§ 7). Une place ne se ferme JAMAIS sur un silence :
   * c'est le chemin par lequel une coupure de tunnel effacerait une session
   * parfaitement valide.
   */
  it.each<readonly [string, () => { readonly recuperer: (url: string) => Promise<Response> }]>([
    ['une coupure', () => ({ recuperer: () => Promise.reject(new TypeError('Failed to fetch')) })],
    ['un 500', () => journalise([reponse(500, { success: false })])],
    ['un statut qu’on ne sait pas lire', () => journalise([reponse(418, { success: false })])],
    ['une charge vide', () => journalise([reponse(200, { success: true })])],
  ])('ne ferme RIEN sur %s', async (_cas, fabrique) => {
    const { recuperer } = fabrique();

    expect(await revalideLaPlace({ jeton: 'jeton', base: BASE, recuperer })).toEqual({
      etat: 'indisponible',
    });
  });

  /**
   * Le DÉPART VOLONTAIRE. Il ne rend rien, et surtout il ne JETTE pas : le
   * refus de la passerelle (404 sur une session déjà close — c'est-à-dire
   * exactement l'état F, celui où le bouton sert le plus) ne doit pas retenir
   * le cookie du visiteur, sans quoi un jeton mort deviendrait ineffaçable.
   */
  it('quitte une place sans jamais se retourner contre le visiteur', async () => {
    const { appels, recuperer } = journalise([reponse(404, { success: false })]);

    await expect(
      quitteLaPlace({ jeton: 'jeton-opaque', base: BASE, recuperer }),
    ).resolves.toBeUndefined();

    expect(appels[0]?.url).toBe(`${BASE}/api/v1/anonymous/leave`);
    expect(JSON.parse(String(appels[0]?.options?.body))).toEqual({ sessionToken: 'jeton-opaque' });
  });

  it('ne jette pas non plus quand la passerelle est injoignable', async () => {
    await expect(
      quitteLaPlace({
        jeton: 'jeton',
        base: BASE,
        recuperer: () => Promise.reject(new TypeError('Failed to fetch')),
      }),
    ).resolves.toBeUndefined();
  });
});
