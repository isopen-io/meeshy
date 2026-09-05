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
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { canalDuLien } from '../lib/realtime/lifecycle';
import {
  cleDeLien,
  cleDuLien,
  cookiesDEffacementDesPlaces,
  effaceSession,
  effaceToutesLesPlaces,
  estLaCleDu,
  jetonsDesCookies,
  lienDeLaCle,
  lireSession,
  nomsDesCookiesInvites,
  poseSession,
  sessionDepuisLaValeur,
  type CleDeLien,
  type SessionInvitee,
} from '../lib/api/guest-session';

/**
 * LE TYPE MARQUÉ N'EST HABITÉ QUE PAR SA FABRIQUE. `route.ts` promouvait un
 * segment d'adresse en `CleDeLien` (`segment as CleDeLien`) pour peindre un
 * lien clos — exactement l'assertion que le type existe pour interdire, et
 * c'est elle qui rendait « lagos-q1 » en titre d'écran. Le code de production
 * n'écrit `as CleDeLien` qu'à UN endroit : la fabrique.
 */
const RACINE = join(__dirname, '..');
const DOSSIERS_DE_PRODUCTION = ['app', 'lib', 'components', 'scripts'] as const;

const sourcesDeProduction = (): readonly string[] =>
  DOSSIERS_DE_PRODUCTION.flatMap((dossier) => {
    try {
      return readdirSync(join(RACINE, dossier), { recursive: true, withFileTypes: true })
        .filter((entree) => entree.isFile() && /\.(ts|tsx|mts|cts)$/.test(entree.name) && !entree.name.endsWith('.d.ts'))
        .map((entree) => join(entree.parentPath ?? entree.path, entree.name));
    } catch {
      return [];
    }
  });

describe('le type marqué n’est habité que par sa fabrique', () => {
  it('trouve bien du code à garder', () => {
    expect(sourcesDeProduction().length).toBeGreaterThan(20);
  });

  it("n'écrit `as CleDeLien` nulle part hors de lib/api/guest-session.ts", () => {
    const coupables = sourcesDeProduction()
      .filter((chemin) => /\bas CleDeLien\b/.test(readFileSync(chemin, 'utf8')))
      .map((chemin) => relative(RACINE, chemin));
    expect(coupables).toEqual([join('lib', 'api', 'guest-session.ts')]);
  });
});

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

const sessionDe = (suffixe: string): SessionInvitee => ({
  jeton: `jeton-${suffixe}`,
  participantId: `participant-${suffixe}`,
  pseudo: `Invite ${suffixe}`,
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

/**
 * Les jetons que le NAVIGATEUR présente — la valeur de chaque cookie
 * `meeshy_guest_<lien>`, sans que le nom soit promu en clé : la place se
 * reconnaît auprès du serveur (`reconnais`, `lib/api/invite.ts`).
 */
describe('les jetons invités portés par un en-tête Cookie', () => {
  it('rend la valeur de chaque cookie de place, décodée, une fois chacune, dans l’ordre', () => {
    expect(jetonsDesCookies('meeshy_session=x; meeshy_guest_mshy_a=S1; meeshy_auth=J; meeshy_guest_mshy_b=S%202; meeshy_guest_mshy_c=S1')).toEqual(['S1', 'S 2']);
  });

  it('ignore un cookie de place sans valeur, sans signe égal, ou un en-tête absent', () => {
    expect(jetonsDesCookies('meeshy_guest_mshy_a=; meeshy_guest_mshy_b; theme=dark')).toEqual([]);
    expect(jetonsDesCookies(null)).toEqual([]);
    expect(jetonsDesCookies('')).toEqual([]);
  });

  it('ne compte que le préfixe EXACT de la place — meeshy_guest, jamais meeshy_guestbook', () => {
    expect(jetonsDesCookies('meeshy_guestbook=x; meeshy_guest_mshy_a=S1')).toEqual(['S1']);
  });
});

/**
 * LES NOMS des cookies invités — la JUMELLE de `jetonsDesCookies` (qui rend
 * les VALEURS). La déconnexion (#5095) en a besoin pour expirer chaque place
 * détenue, sans connaître le lien : un `Set-Cookie` d'effacement se rédige
 * avec un NOM.
 */
describe('les NOMS des cookies invités portés par un en-tête Cookie', () => {
  it('rend chaque nom, dédupliqué, préfixe EXACT', () => {
    expect(
      nomsDesCookiesInvites('meeshy_guest_mshy_a=x; autre=y; meeshy_guest_mshy_a=x2; meeshy_guest_mshy_b=z'),
    ).toEqual(['meeshy_guest_mshy_a', 'meeshy_guest_mshy_b']);
  });

  it('ignore un en-tête absent, une place sans valeur, et meeshy_guestbook', () => {
    expect(nomsDesCookiesInvites(null)).toEqual([]);
    expect(nomsDesCookiesInvites('meeshy_guest_mshy_a=')).toEqual([]);
    expect(nomsDesCookiesInvites('meeshy_guestbook=x')).toEqual([]);
  });
});

describe('les Set-Cookie qui ferment toutes les places — mêmes attributs que la pose', () => {
  it('un Set-Cookie par nom présenté, Path=/chat, SameSite=Lax', () => {
    expect(
      cookiesDEffacementDesPlaces('meeshy_guest_mshy_a=t1; meeshy_guest_mshy_b=t2', false),
    ).toEqual([
      'meeshy_guest_mshy_a=; Max-Age=0; Path=/chat; SameSite=Lax',
      'meeshy_guest_mshy_b=; Max-Age=0; Path=/chat; SameSite=Lax',
    ]);
  });

  it('ajoute Secure quand le canal l’est', () => {
    expect(cookiesDEffacementDesPlaces('meeshy_guest_mshy_a=t1', true)).toEqual([
      'meeshy_guest_mshy_a=; Max-Age=0; Path=/chat; SameSite=Lax; Secure',
    ]);
  });

  it('aucun jeton présenté ⇒ aucun Set-Cookie', () => {
    expect(cookiesDEffacementDesPlaces(null, false)).toEqual([]);
  });
});

describe('effaceToutesLesPlaces — la sortie NAVIGATEUR de toutes les places à la fois', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie.split(';').forEach((morceau) => {
      const nom = morceau.split('=')[0]?.trim();
      if (nom) document.cookie = `${nom}=; Max-Age=0; Path=/`;
    });
  });

  it('efface CHAQUE entrée meeshy.guest.* du stockage, et rien d’autre', () => {
    localStorage.setItem(cleDuLien(LIEN_A), JSON.stringify(sessionDe('a')));
    localStorage.setItem(cleDuLien(lienDe('mshy_BBB222')), JSON.stringify(sessionDe('b')));
    localStorage.setItem('autre-clef', 'intacte');

    effaceToutesLesPlaces();

    expect(localStorage.getItem(cleDuLien(LIEN_A))).toBeNull();
    expect(localStorage.getItem(cleDuLien(lienDe('mshy_BBB222')))).toBeNull();
    expect(localStorage.getItem('autre-clef')).toBe('intacte');
  });

  it('expire chaque cookie meeshy_guest_* de document.cookie', () => {
    document.cookie = 'meeshy_guest_mshy_a=t1; Path=/chat';
    document.cookie = 'meeshy_guest_mshy_b=t2; Path=/chat';

    effaceToutesLesPlaces();

    expect(document.cookie).not.toContain('meeshy_guest_mshy_a');
    expect(document.cookie).not.toContain('meeshy_guest_mshy_b');
  });

  it('ne jette jamais — un stockage indisponible n’interrompt pas la sortie', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('bloqué');
      },
    });

    expect(() => effaceToutesLesPlaces()).not.toThrow();

    if (original) Object.defineProperty(window, 'localStorage', original);
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

    expect(Object.keys(brut as Record<string, unknown>).sort()).toEqual(['jeton', 'participantId', 'pseudo']);
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
    ['au jeton vide', { jeton: '  ', participantId: 'p', pseudo: 'x' }],
    ['sans participant', { jeton: 'jeton-a', participantId: '', pseudo: 'x' }],
  ])('refuse d’écrire une session %s et garde la place en cours', (_cas, invalide) => {
    poseSession(LIEN_A, sessionDe('a'));

    poseSession(LIEN_A, invalide);

    expect(lireSession(LIEN_A)).toEqual(sessionDe('a'));
  });
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
