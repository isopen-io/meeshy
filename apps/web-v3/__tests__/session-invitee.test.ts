/**
 * Le jeton invité et son rangement PAR LIEN — issue #4448.
 *
 * `lib/api/guest-session.ts` est l'UNIQUE détenteur du jeton invité
 * (conception § 6.3 état E). Ce fichier prouve son comportement observable ;
 * la garde de zone (« personne d'autre ne touche `meeshy.guest.…` ») est
 * prouvée, elle, par `zone-session-invitee.test.ts`, et l'absence de DOM par
 * `session-invitee-sans-dom.test.ts`.
 *
 * Quatre familles de témoins portent chacune un fait MESURÉ de la conception,
 * pas une préférence :
 *
 *   — **L'isolation par lien** (§ 6.1 point 7) : `apps/web` range le jeton sous
 *     UNE clé globale (`AUTH_STORAGE_KEYS.ANONYMOUS_SESSION`), si bien que
 *     rejoindre un second lien ÉCRASE le premier. Le témoin ne se contente pas
 *     de lire deux entrées : il vérifie qu'écrire sous B ne déplace, n'efface
 *     ni ne remplace rien sous A — c'est l'écriture, pas la lecture, qui
 *     produisait le défaut.
 *   — **L'absence de TTL** (§ 6.1 point 1) : le jeton n'a AUCUNE expiration
 *     temporelle — sa seule condition de validité est `Participant.isActive`,
 *     côté serveur. Le client de `apps/web` s'était fabriqué une horloge de 24 h
 *     absolues (§ 6.1 point 6) qui déconnectait des sessions parfaitement
 *     valides. Un témoin qui avance l'horloge de trente jours interdit son
 *     retour.
 *   — **Un jeton ne s'efface JAMAIS par accident** (§ 7, ligne « Erreur réseau
 *     ≠ 401 ») : ni une entrée illisible, ni une session invalide qu'on tente
 *     d'écrire par-dessus, ni un stockage indisponible ne détruisent une place
 *     valide. L'effacement est un acte NOMMÉ (`effaceSession`), déclenché par
 *     le seul 401 avéré de l'état F.
 *   — **La clé est une SOURCE UNIQUE** : `cleDuLien` produit ce que
 *     `lib/realtime/lifecycle.ts` reçoit en `cleDuJeton` — d'où il dérive le
 *     canal d'élection du battement, et sur quoi il filtre `storage`. Si les
 *     deux divergeaient, l'onglet d'un second lien ferait taire le premier,
 *     dont le bail (§ 6.4) ne serait plus renouvelé. Le témoin monte les deux
 *     ENSEMBLE, et sur une paire dont l'un est le PRÉFIXE de l'autre : sur une
 *     paire disjointe, la règle juste et le `startsWith` fautif rendent le même
 *     verdict, et le témoin ne peut pas tomber.
 *   — **Une place a UN nom** : le `linkKey` est le `linkId` que le SERVEUR
 *     rend, jamais le segment d'URL — que la passerelle accepte sous trois
 *     formes (`linkId`, `identifier`, ObjectId ; `resolveShareLinkId`,
 *     `services/gateway/src/routes/anonymous.ts:67-84`). Deux arrivées par deux
 *     formes rangeraient DEUX entrées pour une seule place, et le témoin le
 *     prouve sur les deux portes : le 201 du `join` et l'aperçu du lien.
 */
import { canalDuLien } from '../lib/realtime/lifecycle';
import {
  cleAttestee,
  cleDeLien,
  cleDuLien,
  effaceSession,
  estLaCleDu,
  lienDeLaCle,
  lireSession,
  poseSession,
  sessionDepuisLaValeur,
  type CleDeLien,
  type DroitsDeLaPlace,
  type SessionInvitee,
} from '../lib/api/guest-session';

/** La seule fabrique autorisée, dépliée pour la lisibilité des témoins. */
const lienDe = (linkId: string): CleDeLien => {
  const lien = cleDeLien({ linkId });
  if (lien === null) throw new Error(`linkId refusé par la fabrique : ${JSON.stringify(linkId)}`);
  return lien;
};

const LIEN_A = lienDe('mshy_AAA111');
const LIEN_B = lienDe('mshy_BBB222');

/** Une paire réelle du schéma : `mshy_support` est le PRÉFIXE de `mshy_support-link`. */
const LIEN_COURT = lienDe('mshy_support');
const LIEN_LONG = lienDe('mshy_support-link');

const DROITS: DroitsDeLaPlace = { ecrire: true, fichiers: false, images: true, historique: false };

const sessionDe = (suffixe: string): SessionInvitee => ({
  jeton: `jeton-${suffixe}`,
  participantId: `participant-${suffixe}`,
  pseudo: `Invite ${suffixe}`,
  langue: 'yo',
  nom: `Conversation ${suffixe}`,
  conversationId: `conversation-${suffixe}`,
  droits: DROITS,
});

const clesDuStockage = (): readonly string[] =>
  Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter(
    (cle): cle is string => cle !== null,
  );

beforeEach(() => {
  window.localStorage.clear();
});

describe('la clé du jeton invité', () => {
  it('range une entrée PAR LIEN, jamais une clé globale', () => {
    expect(cleDuLien(LIEN_A)).toBe(`meeshy.guest.${LIEN_A}`);
    expect(cleDuLien(LIEN_A)).not.toBe(cleDuLien(LIEN_B));
  });

  it('se relit dans les deux sens — le lien se retrouve depuis la clé', () => {
    expect(lienDeLaCle(cleDuLien(LIEN_A))).toBe(LIEN_A);
  });

  it("ne reconnaît ni une clé étrangère ni la racine seule, qui n'appartient à aucun lien", () => {
    expect(lienDeLaCle('meeshy-theme')).toBeNull();
    expect(lienDeLaCle('meeshy.guest.')).toBeNull();
    expect(lienDeLaCle('autre.meeshy.guest.mshy_AAA111')).toBeNull();
  });

  /**
   * Ce témoin dit que les deux portées sont DÉRIVÉES l'une de l'autre ; il ne
   * dit pas qu'elles ne peuvent pas diverger — une inégalité sur une paire
   * disjointe est vraie quelle que soit la règle d'appartenance. Ce qu'il
   * manquait est plus bas, sur une paire dont l'un préfixe l'autre.
   */
  it('donne au cycle de vie de quoi indexer SON canal par lien', () => {
    expect(canalDuLien(cleDuLien(LIEN_A))).not.toBe(canalDuLien(cleDuLien(LIEN_B)));
  });
});

/**
 * La paire qui exerce la RELATION DE PRÉFIXE, sur les deux portées.
 *
 * `mshy_AAA111` / `mshy_BBB222` sont disjoints : sur eux, `a !== b` est vrai
 * quelle que soit la règle d'appartenance, y compris la fautive. Le seul
 * témoin capable de tomber s'écrit sur une paire dont l'un préfixe l'autre —
 * et `identifier` étant CHOISI par l'hôte (`schema.prisma:577-579`), une telle
 * paire est un cas nominal, pas un cas tordu.
 */
describe('un lien qui en PRÉFIXE un autre reste un autre lien', () => {
  it('a bien la forme du piège — la clé longue commence par la courte', () => {
    expect(cleDuLien(LIEN_LONG).startsWith(cleDuLien(LIEN_COURT))).toBe(true);
    expect(cleDuLien(LIEN_LONG)).not.toBe(cleDuLien(LIEN_COURT));
  });

  it("n'appartient PAS au lien court — l'appartenance est une égalité", () => {
    expect(estLaCleDu(LIEN_COURT, cleDuLien(LIEN_LONG))).toBe(false);
    expect(estLaCleDu(LIEN_LONG, cleDuLien(LIEN_COURT))).toBe(false);
  });

  it('appartient à son propre lien, dans les deux sens', () => {
    expect(estLaCleDu(LIEN_COURT, cleDuLien(LIEN_COURT))).toBe(true);
    expect(estLaCleDu(LIEN_LONG, cleDuLien(LIEN_LONG))).toBe(true);
  });

  it("n'adopte rien d'un vidage complet du stockage, qui n'appartient à personne", () => {
    expect(estLaCleDu(LIEN_COURT, null)).toBe(false);
  });

  it('range DEUX entrées, et le court ne lit jamais la place du long', () => {
    poseSession(LIEN_COURT, sessionDe('court'));
    poseSession(LIEN_LONG, sessionDe('long'));

    expect(lireSession(LIEN_COURT)).toEqual(sessionDe('court'));
    expect(lireSession(LIEN_LONG)).toEqual(sessionDe('long'));
  });

  it("donne au cycle de vie DEUX canaux — l'onglet du long ne fait pas taire le court", () => {
    expect(canalDuLien(cleDuLien(LIEN_COURT))).not.toBe(canalDuLien(cleDuLien(LIEN_LONG)));
  });
});

/**
 * UN nom par place (§ 6.1 point 3).
 *
 * La passerelle accepte trois formes pour le même lien physique et les
 * normalise (`resolveShareLinkId`, `anonymous.ts:67-84` ; la note :193-194).
 * Côté client, rien ne normalisait : deux arrivées par deux formes rangeaient
 * deux entrées, `lireSession` rendait `null`, l'écran refaisait un `join` — et
 * la place se payait une seconde fois (ligne Participant neuve, paternité des
 * messages perdue, pseudo suffixé, +1 sur `currentUses`,
 * `currentConcurrentUsers` et `currentUniqueSessions`, 410 `LINK_MAX_USES` ou
 * 429 `MAX_CONCURRENT_USERS` au bout). Aucun témoin de comportement ne pouvait
 * l'attraper : les deux entrées « marchent ».
 */
describe('la clé de lien est celle que le SERVEUR sert', () => {
  const OBJECT_ID = '507f1f77bcf86cd799439011';
  const IDENTIFIER = 'mshy_support-lisible';
  const LINK_ID = 'mshy_kQ3p9Zx';

  /** Le 201 de `POST /anonymous/join/:linkId` (`anonymous.ts:254`). */
  const reponseDuJoin = { sessionToken: 'jeton', linkId: LINK_ID, id: OBJECT_ID };
  /** L'aperçu servi à l'état A (`anonymousLinkPreviewSelect`, `anonymous.ts:537-539`). */
  const apercuDuLien = { id: OBJECT_ID, linkId: LINK_ID, name: 'Support' };

  it('rend LA MÊME clé quelle que soit la porte d’arrivée — une place, une entrée', () => {
    expect(cleDeLien(reponseDuJoin)).toBe(cleDeLien(apercuDuLien));
  });

  it("ne range QU'UNE entrée quand le même lien est atteint par les deux portes", () => {
    const parLeJoin = cleDeLien(reponseDuJoin);
    const parLApercu = cleDeLien(apercuDuLien);
    if (parLeJoin === null || parLApercu === null) throw new Error('la fabrique a refusé une réponse du serveur');

    poseSession(parLeJoin, sessionDe('a'));

    expect(clesDuStockage()).toEqual([cleDuLien(parLeJoin)]);
    expect(lireSession(parLApercu)).toEqual(sessionDe('a'));
  });

  it("ne dérive JAMAIS la clé d'une autre forme du même lien", () => {
    expect(cleDeLien(reponseDuJoin)).not.toBe(OBJECT_ID);
    expect(cleDeLien(reponseDuJoin)).not.toBe(IDENTIFIER);
  });

  /**
   * Le témoin qui compte le plus, et il est de TYPE : le défaut se produisait
   * chez l'APPELANT, pas dans le détenteur. `tsc --noEmit` fait tomber ce bloc
   * si l'une de ces trois formes redevenait passable — chaque
   * `@ts-expect-error` est une erreur si l'erreur attendue disparaît.
   */
  it('interdit à la COMPILATION les trois formes qui ne sont pas la clé', () => {
    // @ts-expect-error — le segment d'URL `/chats/:lien` : trois formes pour une place.
    const parLUrl = (): unknown => cleDeLien(IDENTIFIER);
    // @ts-expect-error — l'`identifier` lisible, que le serveur normalise et que le client ne peut pas.
    const parLIdentifier = (): unknown => cleDeLien({ identifier: IDENTIFIER });
    // @ts-expect-error — l'ObjectId 24-hex, servi à côté du `linkId` dans la MÊME réponse.
    const parLObjectId = (): unknown => cleDeLien({ id: OBJECT_ID });

    expect([parLUrl, parLIdentifier, parLObjectId]).toHaveLength(3);
  });

  it("n'accepte pas davantage un `linkId` posé sur une CLÉ DE LIEN déjà marquée sans passer par elle", () => {
    const marquee: CleDeLien | null = cleDeLien({ linkId: LINK_ID });

    expect(marquee).toBe(LINK_ID);
    expect(lienDeLaCle(cleDuLien(lienDe(LINK_ID)))).toBe(LINK_ID);
  });

  it.each([
    ['un lien sans linkId — un aperçu incomplet ne fabrique pas de place', {}],
    ['un linkId vide', { linkId: '   ' }],
    ['un linkId non textuel', { linkId: 42 }],
    ['un linkId nul', { linkId: null }],
  ])('refuse %s', (_cas, servi) => {
    expect(cleDeLien(servi)).toBeNull();
  });

});

describe('poser, lire, effacer une session invitée', () => {
  it('rend null quand aucune session n’a été posée', () => {
    expect(lireSession(LIEN_A)).toBeNull();
  });

  it('rend la session posée', () => {
    poseSession(LIEN_A, sessionDe('a'));

    expect(lireSession(LIEN_A)).toEqual(sessionDe('a'));
  });

  it("n'écrit QUE la clé du lien — aucune entrée globale à côté", () => {
    poseSession(LIEN_A, sessionDe('a'));

    expect(clesDuStockage()).toEqual([cleDuLien(LIEN_A)]);
  });

  it('remplace la session du même lien', () => {
    poseSession(LIEN_A, sessionDe('a'));
    poseSession(LIEN_A, sessionDe('a-bis'));

    expect(lireSession(LIEN_A)).toEqual(sessionDe('a-bis'));
  });

  it('efface la session du lien', () => {
    poseSession(LIEN_A, sessionDe('a'));
    effaceSession(LIEN_A);

    expect(lireSession(LIEN_A)).toBeNull();
    expect(clesDuStockage()).toEqual([]);
  });

  it('efface sans bruit un lien qui n’a rien', () => {
    expect(() => effaceSession(LIEN_A)).not.toThrow();
  });

  /**
   * Le type marqué rend ce cas inatteignable par un site d'appel honnête ; il
   * ne le rend pas impossible — une assertion suffit. Sous la clé-racine,
   * l'écriture n'appartiendrait à aucun lien et l'effacement emporterait ce
   * qu'un autre onglet y aurait mis.
   */
  it("ignore un lien vide, même FORCÉ : sans lien, il n'y a pas de place à ranger", () => {
    const force = '' as unknown as CleDeLien;

    poseSession(force, sessionDe('a'));

    expect(clesDuStockage()).toEqual([]);
    expect(lireSession(force)).toBeNull();
  });
});

describe('deux liens ne se marchent jamais dessus (§ 6.1 point 7)', () => {
  it('rejoindre un second lien laisse le premier INTACT', () => {
    poseSession(LIEN_A, sessionDe('a'));
    poseSession(LIEN_B, sessionDe('b'));

    expect(lireSession(LIEN_A)).toEqual(sessionDe('a'));
    expect(lireSession(LIEN_B)).toEqual(sessionDe('b'));
    expect([...clesDuStockage()].sort()).toEqual([cleDuLien(LIEN_A), cleDuLien(LIEN_B)].sort());
  });

  it("écrire sous un lien ne fuit pas sous l'autre", () => {
    poseSession(LIEN_A, sessionDe('a'));

    expect(lireSession(LIEN_B)).toBeNull();
  });

  it('effacer un lien laisse la place de l’autre ouverte', () => {
    poseSession(LIEN_A, sessionDe('a'));
    poseSession(LIEN_B, sessionDe('b'));

    effaceSession(LIEN_A);

    expect(lireSession(LIEN_A)).toBeNull();
    expect(lireSession(LIEN_B)).toEqual(sessionDe('b'));
  });
});

describe("le jeton n'a AUCUNE expiration (§ 6.1 point 1)", () => {
  it('sert la même session trente jours plus tard', () => {
    poseSession(LIEN_A, sessionDe('a'));

    jest.useFakeTimers();
    try {
      jest.setSystemTime(Date.now() + 30 * 24 * 60 * 60 * 1000);
      expect(lireSession(LIEN_A)).toEqual(sessionDe('a'));
    } finally {
      jest.useRealTimers();
    }
  });

  it("n'écrit aucune horloge dans l'entrée — le contrat entre onglets ne porte pas de date", () => {
    poseSession(LIEN_A, sessionDe('a'));

    const brut: unknown = JSON.parse(window.localStorage.getItem(cleDuLien(LIEN_A)) ?? 'null');

    expect(Object.keys(brut as Record<string, unknown>).sort()).toEqual([
      'conversationId',
      'droits',
      'jeton',
      'langue',
      'nom',
      'participantId',
      'pseudo',
    ]);
  });
});

describe('une entrée qu’on ne comprend pas', () => {
  it('rend null sur du JSON illisible, sans détruire ce qu’une autre version a écrit', () => {
    window.localStorage.setItem(cleDuLien(LIEN_A), '{pas du json');

    expect(lireSession(LIEN_A)).toBeNull();
    expect(window.localStorage.getItem(cleDuLien(LIEN_A))).toBe('{pas du json');
  });

  it.each([
    ['sans jeton', JSON.stringify({ participantId: 'p', pseudo: 'x' })],
    ['au jeton vide', JSON.stringify({ jeton: '   ', participantId: 'p', pseudo: 'x' })],
    ['au jeton non textuel', JSON.stringify({ jeton: 42, participantId: 'p', pseudo: 'x' })],
    ['qui n’est pas un objet', JSON.stringify(['jeton'])],
    ['nulle', JSON.stringify(null)],
  ])('rend null pour une entrée %s', (_cas, valeur) => {
    window.localStorage.setItem(cleDuLien(LIEN_A), valeur);

    expect(lireSession(LIEN_A)).toBeNull();
  });

  it("ignore les champs qu'elle ne connaît pas — une version plus récente ne casse pas une plus ancienne", () => {
    window.localStorage.setItem(
      cleDuLien(LIEN_A),
      JSON.stringify({ ...sessionDe('a'), champDeDemain: { profond: true } }),
    );

    expect(lireSession(LIEN_A)).toEqual(sessionDe('a'));
  });
});

describe('un jeton valide ne s’efface jamais par accident (§ 7)', () => {
  it.each<readonly [string, SessionInvitee]>([
    ['au jeton vide', { jeton: '  ', participantId: 'p', pseudo: 'x', langue: null, nom: null, conversationId: null, droits: null }],
    ['sans participant', { jeton: 'jeton-a', participantId: '', pseudo: 'x', langue: null, nom: null, conversationId: null, droits: null }],
  ])('refuse d’écrire une session %s et garde la place en cours', (_cas, invalide) => {
    poseSession(LIEN_A, sessionDe('a'));

    poseSession(LIEN_A, invalide);

    expect(lireSession(LIEN_A)).toEqual(sessionDe('a'));
  });
});

/**
 * CE QUE LA PLACE OUVRE VOYAGE AVEC LE JETON — et l'ignorance ne se confond pas
 * avec le refus.
 *
 * L'écran `rights` relit les quatre droits au rechargement, sans repasser par la
 * passerelle : ils doivent donc survivre à l'entrée. Une entrée écrite par une
 * version qui ne les rangeait pas encore reste une place VALIDE — le jeton est
 * bon tant qu'il est bon (point 1) — et rend `droits: null`, que l'écran peint
 * en retombant sur ce que le lien déclare plutôt qu'en refusant quatre droits.
 */
describe('les droits d’une place ouverte (issue #4523)', () => {
  it('range les quatre droits à côté du jeton, et les relit tels quels', () => {
    poseSession(LIEN_A, sessionDe('a'));

    expect(lireSession(LIEN_A)?.droits).toEqual(DROITS);
  });

  it.each([
    ['une entrée d’une version qui ne les rangeait pas', { pseudo: 'Tolu' }],
    ['des droits qui ne sont pas un objet', { pseudo: 'Tolu', droits: 'tous' }],
    ['des droits PARTIELS — compléter refuserait ce qui est accordé', {
      pseudo: 'Tolu',
      droits: { ecrire: true, images: true },
    }],
    ['un droit qui n’est pas un booléen', {
      pseudo: 'Tolu',
      droits: { ecrire: 'oui', fichiers: true, images: true, historique: true },
    }],
  ])('garde la place et rend des droits INCONNUS pour %s', (_cas, entree) => {
    window.localStorage.setItem(
      cleDuLien(LIEN_A),
      JSON.stringify({ jeton: 'jeton-a', participantId: 'participant-a', ...entree }),
    );

    const place = lireSession(LIEN_A);

    expect(place).not.toBeNull();
    expect(place?.droits).toBeNull();
  });

  it('distingue « aucun droit » de « droits inconnus »', () => {
    const aucun: DroitsDeLaPlace = {
      ecrire: false,
      fichiers: false,
      images: false,
      historique: false,
    };
    poseSession(LIEN_A, { ...sessionDe('a'), droits: aucun });

    expect(lireSession(LIEN_A)?.droits).toEqual(aucun);
  });
});

/**
 * LA LANGUE ET LE NOM — ce que la réponse d'admission transporte et que le
 * parseur JETAIT (issue #4523, revue croisée).
 *
 * `participant.language` est le RANG 1 du Prisme d'un lecteur anonyme : il n'a
 * ni `systemLanguage`, ni `regionalLanguage`, ni `customDestinationLanguage`, et
 * la seule langue qu'il ait jamais déclarée est celle du formulaire d'entrée.
 * `conversation.title` est ce qui permet à l'écran de se peindre quand la
 * passerelle ne répond pas — sans lui, il dépend d'un appel réseau pour nommer
 * la conversation dans laquelle le visiteur est DÉJÀ entré.
 */
describe('ce que la place porte du Prisme et de la conversation', () => {
  it('range la langue déclarée et le titre à côté du jeton, et les relit tels quels', () => {
    poseSession(LIEN_A, sessionDe('a'));

    expect(lireSession(LIEN_A)?.langue).toBe('yo');
    expect(lireSession(LIEN_A)?.nom).toBe('Conversation a');
  });

  it.each([
    ['une entrée d’une version qui ne les rangeait pas', {}],
    ['une langue qui n’est pas une chaîne', { langue: 42, nom: 7 }],
    ['une langue vide, qui se peindrait comme un nom', { langue: '   ', nom: '  ' }],
  ])('garde la place et ne fabrique NI langue NI nom pour %s', (_cas, entree) => {
    window.localStorage.setItem(
      cleDuLien(LIEN_A),
      JSON.stringify({ jeton: 'jeton-a', participantId: 'participant-a', pseudo: 'Tolu', ...entree }),
    );

    const place = lireSession(LIEN_A);

    expect(place).not.toBeNull();
    expect(place?.langue).toBeNull();
    expect(place?.nom).toBeNull();
  });
});

/**
 * LA CLÉ ATTESTÉE — comment on retrouve sa place SANS appeler la passerelle.
 *
 * `cleDeLien` produit une clé depuis la RÉPONSE d'un serveur, et il n'y a pas de
 * seconde fabrique : un segment d'URL n'en sera jamais une. Mais une place déjà
 * ouverte laisse une entrée NOMMÉE d'après sa clé canonique, et cette entrée est
 * une attestation — elle n'existe que si ce serveur l'y a écrite.
 *
 * C'est ce qui a fermé le défaut bloquant de l'écran `rights` : sans ce chemin,
 * connaître sa propre place exigeait un aperçu du LIEN, c'est-à-dire de faire
 * dépendre l'existence d'une place d'une porte qui refuse (410 `LINK_MAX_USES`)
 * précisément parce que la place a été prise.
 */
describe('retrouver sa place sans rien demander à personne', () => {
  const atteste = (nom: string): boolean => window.localStorage.getItem(nom) !== null;

  it('reconnaît la clé sous laquelle une entrée existe', () => {
    poseSession(LIEN_A, sessionDe('a'));

    expect(cleAttestee('mshy_AAA111', atteste)).toBe(LIEN_A);
  });

  it('ne reconnaît RIEN quand aucune entrée ne porte ce nom', () => {
    expect(cleAttestee('mshy_AAA111', atteste)).toBeNull();
  });

  /**
   * L'attestation porte sur le nom COMPLET, jamais sur un préfixe : c'est la
   * même égalité que `estLaCleDu`, et pour la même raison — `mshy_support` est
   * le préfixe de `mshy_support-link`, deux liens que rien n'empêche de
   * coexister.
   */
  it('n’attribue pas à un lien l’entrée d’un lien dont il est le PRÉFIXE', () => {
    poseSession(LIEN_LONG, sessionDe('long'));

    expect(cleAttestee('mshy_support', atteste)).toBeNull();
    expect(cleAttestee('mshy_support-link', atteste)).toBe(LIEN_LONG);
  });

  /**
   * Le candidat vient d'une URL, donc de n'importe qui : il compose un nom de
   * cookie et un nom d'entrée, et un nom n'accepte pas tout. Refuser ces
   * candidats-là ne coûte rien — aucune clé servie par la passerelle n'en a la
   * forme.
   */
  it.each(['', '   ', 'a b', 'a;b', 'a=b', '../autre', 'a'.repeat(129)])(
    'refuse un candidat qui ne peut pas NOMMER une entrée (%j)',
    (candidat) => {
      expect(cleAttestee(candidat, () => true)).toBeNull();
    },
  );
});

describe('le décodage sert aussi ce que le cycle de vie annonce', () => {
  it("rend la session depuis la VALEUR d'un événement `jeton-externe`, sans la relire du stockage", () => {
    poseSession(LIEN_A, sessionDe('a'));
    const valeur = window.localStorage.getItem(cleDuLien(LIEN_A));

    expect(sessionDepuisLaValeur(valeur)).toEqual(sessionDe('a'));
  });

  it('rend null quand un autre onglet a effacé la place', () => {
    expect(sessionDepuisLaValeur(null)).toBeNull();
  });
});

describe('un stockage indisponible dégrade, il ne plante pas', () => {
  const inaccessible = (): (() => void) => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('refusé', 'SecurityError');
      },
    });

    return () => {
      if (original === undefined) return;
      Object.defineProperty(window, 'localStorage', original);
    };
  };

  it('lit null, pose et efface sans jeter — le rôle premier doit rester lisible', () => {
    const retablit = inaccessible();

    try {
      expect(lireSession(LIEN_A)).toBeNull();
      expect(() => poseSession(LIEN_A, sessionDe('a'))).not.toThrow();
      expect(() => effaceSession(LIEN_A)).not.toThrow();
    } finally {
      retablit();
    }
  });

  it('ne jette pas quand le quota refuse l’écriture', () => {
    const espion = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    try {
      expect(() => poseSession(LIEN_A, sessionDe('a'))).not.toThrow();
    } finally {
      espion.mockRestore();
    }
  });
});
