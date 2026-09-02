/**
 * L'UNIQUE détenteur du jeton invité, rangé PAR LIEN (conception § 6.3).
 *
 * Trois faits MESURÉS sur `apps/web` (§ 6.1) dictent tout ce fichier, et
 * aucun n'est une préférence de style :
 *
 *   1. **Le jeton n'a AUCUNE expiration temporelle.** Sa seule condition de
 *      validité est `Participant.isActive === true`, côté serveur, sur les
 *      trois portes du gateway. Ce module ne date donc RIEN : ni écriture, ni
 *      péremption, ni horloge de 24 h — celle de `apps/web` (§ 6.1 point 6)
 *      fermait des sessions parfaitement valides, mesurant l'inverse de ce que
 *      le serveur mesure. Une entrée écrite il y a un mois vaut celle d'il y a
 *      une minute.
 *   2. **Deux onglets partageaient UNE clé** (§ 6.1 point 7) :
 *      `AUTH_STORAGE_KEYS.ANONYMOUS_SESSION` n'est pas indexée par lien, si
 *      bien que rejoindre un second lien ÉCRASE le jeton du premier — et le
 *      retour coûte une identité neuve, un pseudo suffixé et trois compteurs
 *      (§ 6.1 point 3). La clé est ici `meeshy.guest.<lien>` : une entrée par
 *      lien, deux liens cohabitent. C'est cette clé, et elle seule, que
 *      `lib/realtime/lifecycle.ts` reçoit en `cleDuJeton` — d'où il dérive le
 *      canal d'élection du battement, et sur quoi il filtre ses événements
 *      `storage` par ÉGALITÉ. Le mot « préfixe » y a été retiré parce qu'il
 *      invitait précisément le `startsWith` qui rouvrait ce défaut une couche
 *      plus haut : `mshy_support` est le préfixe de `mshy_support-link`, deux
 *      liens que rien n'empêche de coexister (`identifier` est CHOISI par
 *      l'hôte, `schema.prisma:577-579`), et l'onglet du premier recevait la
 *      valeur du second. La jonction des deux moitiés de la règle est
 *      `estLaCleDu` ci-dessous ; elle n'est plus distribuée.
 *   2 bis. **Une place a UN nom, servi par le serveur.** La passerelle accepte
 *      TROIS formes pour le même lien physique — `linkId`, `identifier`
 *      (lisible, `mshy_…` lui aussi) et l'ObjectId 24-hex : `resolveShareLinkId`
 *      (`services/gateway/src/routes/anonymous.ts:67-84`) les normalise côté
 *      serveur, et la note de dépréciation :193-194 le dit en toutes lettres.
 *      Côté client, deux ARRIVÉES par deux formes rangeraient DEUX entrées pour
 *      UNE place : `lireSession` rendrait `null`, l'écran referait un `join`, et
 *      le § 6.1 point 3 se paierait en entier. Aucun témoin de comportement ne
 *      l'attraperait — les deux entrées « marchent ». D'où `CleDeLien`, un type
 *      MARQUÉ que `cleDeLien()` est seul à produire, depuis le `linkId` que le
 *      serveur rend : un site d'appel ne PEUT pas passer le `:lien` de son URL.
 *   3. **Un jeton ne s'efface jamais par accident** (§ 7, « Erreur réseau ≠
 *      401 »). Une entrée illisible, une session invalide écrite par-dessus, un
 *      stockage refusé par le navigateur : aucun de ces trois cas ne détruit
 *      une place valide. L'effacement est un acte NOMMÉ — `effaceSession` —,
 *      réservé au seul 401 avéré de l'état F, jamais à une coupure de tunnel.
 *
 * Ce que le module ne fait PAS, et pourquoi : il ne parle à personne. Le
 * battement `POST /anonymous/refresh` (§ 6.4) et l'arbitrage du 401 (état F :
 * un refresh de CONTRÔLE, puis l'effacement seulement si LUI aussi rend 401)
 * atterrissent ici avec l'écran `join` (L2) — c'est le seul site qui aura le
 * droit d'effacer. La CADENCE, elle, reste chez `lib/realtime/lifecycle.ts` :
 * un onglet caché n'a pas de minuterie du tout, et c'est ce partage qui rend
 * vraie par construction la loi « un onglet caché ne fait rien partir ».
 */

import { valeurDuCookie } from './cookies';

const RACINE = 'meeshy.guest.';

/** Ce qui est persisté d'une place invitée — et rien de plus. */
export type SessionInvitee = {
  /** Le jeton opaque du serveur. Aucun TTL, aucune signature horodatée. */
  readonly jeton: string;
  /** Ce qui dit « cette bulle est de moi » avant le premier aller-retour. */
  readonly participantId: string;
  /** Ce que l'état F pré-remplit quand le lecteur reprend sa place au bouton. */
  readonly pseudo: string;
};

const texte = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur.trim() !== '' ? valeur : null;

/**
 * Le nom CANONIQUE d'une place — ce qui indexe l'entrée, le canal d'élection et
 * rien d'autre. Marqué, donc inhabitable par une chaîne quelconque.
 */
export type CleDeLien = string & { readonly __cleDeLien: unique symbol };

/**
 * Ce que les deux portes d'arrivée du serveur rendent d'un lien de partage.
 *
 * `linkId` est OPTIONNEL parce qu'une réponse traversée par le réseau n'est pas
 * un fait de type : un aperçu tronqué ou une version plus ancienne peuvent
 * l'omettre, et la fabrique doit alors rendre `null` plutôt qu'exister sur une
 * assertion. Le champ étant le SEUL du type, TypeScript refuse pour autant tout
 * littéral qui ne le porte pas — `cleDeLien({ identifier })` et
 * `cleDeLien({ id })` ne compilent pas.
 */
export type LienServi = { readonly linkId?: unknown };

/**
 * L'UNIQUE fabrique d'une `CleDeLien`, et elle prend la RÉPONSE du serveur.
 *
 * `linkId` est la forme canonique, servie par les deux — et seules — portes par
 * lesquelles un lecteur arrive sur une place : le 201 de
 * `POST /anonymous/join/:linkId` (`anonymous.ts:254`,
 * `linkId: result.shareLink.linkId`) et l'aperçu RSC du lien
 * `GET /anonymous/link/:identifier` (`anonymous.ts:683`, projeté par
 * `anonymousLinkPreviewSelect` :537-539). Le segment d'URL
 * `/chats/:lien`, lui, n'en est PAS un : il vaut indifféremment `linkId`,
 * `identifier` ou l'ObjectId (point 2 bis ci-dessus), et deux arrivées par deux
 * formes rangeraient deux entrées pour une seule place.
 *
 * Elle ne DEVINE rien — aucune forme n'est reconnaissable de l'extérieur, les
 * trois candidats partageant le préfixe `mshy_` ou l'hexadécimal. Elle
 * CONTRAINT : c'est le type de son argument qui interdit d'y verser un segment
 * d'URL, et le type de son retour qui interdit à `poseSession` d'accepter autre
 * chose qu'elle.
 */
export const cleDeLien = (servi: LienServi): CleDeLien | null => {
  const linkId = texte(servi.linkId);
  return linkId === null ? null : (linkId as CleDeLien);
};

/**
 * La clé du lien — SOURCE UNIQUE, y compris pour le cycle de vie.
 *
 * `lib/realtime/lifecycle.ts` en fait le nom de son `BroadcastChannel` et le
 * filtre de ses événements `storage`. Deux compositions de cette chaîne, et
 * l'onglet d'un lien B pourrait faire taire celui d'un lien A, dont le bail
 * (§ 6.4) ne serait alors plus renouvelé.
 */
export const cleDuLien = (lien: CleDeLien): string => `${RACINE}${lien}`;

/**
 * Le chemin inverse, pour qui reçoit une CLÉ sans savoir de quel lien elle
 * parle — le consommateur de la transition `jeton-externe`, qu'un autre onglet
 * a déclenchée. La racine seule n'appartient à aucun lien.
 */
export const lienDeLaCle = (cle: string): CleDeLien | null =>
  cle.startsWith(RACINE) && cle.length > RACINE.length ? (cle.slice(RACINE.length) as CleDeLien) : null;

/**
 * La JONCTION — « cette clé est-elle celle de CE lien ? », posée en un seul
 * endroit.
 *
 * Le module exposait les deux moitiés (`cleDuLien`, `lienDeLaCle`) sans jamais
 * les joindre, et chaque consommateur redécidait ce qu'appartenir veut dire :
 * `lib/realtime/lifecycle.ts` avait choisi `startsWith`, ce qui livrait à
 * l'onglet de `mshy_support` le jeton — jeton, `participantId` et pseudo — du
 * lien `mshy_support-link`. Une clé de lien n'a AUCUNE sous-clé : appartenir,
 * c'est être ÉGAL, jamais commencer par.
 *
 * Une clé nulle (un `storage` de vidage complet) n'appartient à personne : elle
 * annonce une disparition, pas une valeur à adopter.
 */
export const estLaCleDu = (lien: CleDeLien, cle: string | null): boolean =>
  cle !== null && lienDeLaCle(cle) === lien;

/**
 * Un champ se lit sur les propriétés PROPRES de l'entrée décodée : ce que le
 * `JSON.parse` d'un stockage tiers rend n'est pas une `SessionInvitee`, et une
 * assertion de type le prétendrait. Les propriétés héritées sont ignorées de
 * surcroît — une entrée trafiquée par `__proto__` ne peut rien fournir.
 */
const champ = (objet: object, nom: keyof SessionInvitee): unknown =>
  Object.getOwnPropertyDescriptor(objet, nom)?.value;

const estValide = (session: SessionInvitee): boolean =>
  texte(session.jeton) !== null && texte(session.participantId) !== null;

/**
 * Le décodage, offert à qui reçoit la VALEUR d'un événement `storage` : sans
 * lui, chaque consommateur du cycle de vie réécrirait ce `JSON.parse` — et la
 * forme de l'entrée, qui est un contrat ENTRE ONGLETS, aurait autant de
 * lecteurs que d'écrans.
 *
 * Une entrée qu'on ne comprend pas ne vaut pas une session ; elle n'est pas
 * détruite pour autant — une version plus récente a pu l'écrire, et un onglet
 * ancien n'a pas à effacer ce qu'il ne sait pas lire.
 */
export const sessionDepuisLaValeur = (valeur: string | null): SessionInvitee | null => {
  if (valeur === null) return null;

  const decodee = ((): unknown => {
    try {
      return JSON.parse(valeur);
    } catch {
      return null;
    }
  })();

  if (typeof decodee !== 'object' || decodee === null) return null;

  const jeton = texte(champ(decodee, 'jeton'));
  const participantId = texte(champ(decodee, 'participantId'));
  if (jeton === null || participantId === null) return null;

  return { jeton, participantId, pseudo: texte(champ(decodee, 'pseudo')) ?? '' };
};

/**
 * Le stockage se touche à CHAQUE appel, jamais au chargement du module : ce
 * fichier est importé par des composants serveur (l'écran `join` est rendu
 * avant de s'hydrater), et son accès est refusé net par un navigateur en
 * navigation privée, à cookies bloqués ou à quota plein. Aucun de ces cas
 * n'est une panne : ils rendent « aucune session » et laissent l'écriture sans
 * effet, jamais une exception — le rôle premier doit rester lisible sans
 * compte ET sans stockage.
 */
const surLeStockage = <T,>(defaut: T, action: (stockage: Storage) => T): T => {
  try {
    if (typeof localStorage === 'undefined') return defaut;
    return action(localStorage);
  } catch {
    return defaut;
  }
};

/**
 * Le type MARQUÉ dit d'où vient la clé ; il ne dit pas qu'elle est non vide —
 * une assertion suffit à le contourner, et le contournement est ici un
 * effacement silencieux de la place d'autrui sous la clé-racine.
 */
const lienValide = (lien: CleDeLien): boolean => lien.trim() !== '';

export const lireSession = (lien: CleDeLien): SessionInvitee | null =>
  lienValide(lien)
    ? surLeStockage(null, (stockage) => sessionDepuisLaValeur(stockage.getItem(cleDuLien(lien))))
    : null;

export const poseSession = (lien: CleDeLien, session: SessionInvitee): void => {
  if (!lienValide(lien) || !estValide(session)) return;

  const entree: SessionInvitee = {
    jeton: session.jeton,
    participantId: session.participantId,
    pseudo: session.pseudo,
  };

  surLeStockage(undefined, (stockage) => stockage.setItem(cleDuLien(lien), JSON.stringify(entree)));
};

/** L'acte NOMMÉ de l'état F — le seul chemin par lequel une place se perd côté client. */
export const effaceSession = (lien: CleDeLien): void => {
  if (!lienValide(lien)) return;

  surLeStockage(undefined, (stockage) => stockage.removeItem(cleDuLien(lien)));
};

/**
 * LE COOKIE — la seconde projection de la MÊME valeur (conception § 12.3).
 *
 * Pour que le SERVEUR décide l'état de `/chat/:lien` (CHOIX ou INVITÉ) sans
 * JavaScript, le jeton voyage dans un cookie que la route pose à la jonction et
 * relit à chaque chargement. Il est écrit et lu ICI, par le détenteur unique,
 * jamais par un second store : `lireSession` et ce cookie sont deux projections
 * d'une valeur, sur deux supports — le cookie pour le serveur, le stockage pour
 * `lib/realtime/lifecycle.ts` et l'élection du battement.
 *
 * LE NOM PORTE LE LIEN, LE CHEMIN NE LE PORTE PAS — et c'est une décision, pas
 * un raccourci. La directive écrit `Path=/chat/<segment>` ; or le segment n'est
 * pas le lien : la passerelle accepte TROIS formes pour la même place (point
 * 2 bis ci-dessus), et un cookie porté au segment cesserait d'être envoyé dès
 * que le lecteur arrive par l'autre forme — il verrait la modale, referait un
 * `join`, et paierait le § 6.1 point 3 en entier. Le nom, lui, est indexé par
 * la `CleDeLien` que le SERVEUR rend ; le chemin `/chat` ne couvre que la porte
 * de l'invité (`/chat/…`, jamais `/chats`, la porte du membre — la
 * correspondance de chemin d'un cookie exige un `/` après le préfixe).
 *
 * SANS `Max-Age` : le jeton n'a AUCUN TTL (point 1). Sans `HttpOnly`, pour la
 * même raison que `meeshy_auth` (`app/authentification/remise.ts`) : une
 * déconnexion doit pouvoir le retirer, et le module de participation doit
 * pouvoir le lire pour s'authentifier au socket.
 */
const RACINE_DU_COOKIE = 'meeshy_guest_';

export const CHEMIN_DU_COOKIE = '/chat';

export const nomDuCookie = (lien: CleDeLien): string => `${RACINE_DU_COOKIE}${lien}`;

const attributsDuCookie = (secure: boolean): string =>
  `Path=${CHEMIN_DU_COOKIE}; SameSite=Lax${secure ? '; Secure' : ''}`;

/** La valeur `Set-Cookie` qui POSE la place — écrite par la route de jonction, et par elle seule. */
export const cookieDeSession = ({
  lien,
  jeton,
  secure,
}: {
  readonly lien: CleDeLien;
  readonly jeton: string;
  readonly secure: boolean;
}): string => `${nomDuCookie(lien)}=${encodeURIComponent(jeton)}; ${attributsDuCookie(secure)}`;

/** L'acte NOMMÉ de l'état F, projeté sur le cookie : le seul chemin par lequel il se retire. */
export const cookieDEffacement = ({
  lien,
  secure,
}: {
  readonly lien: CleDeLien;
  readonly secure: boolean;
}): string => `${nomDuCookie(lien)}=; Max-Age=0; ${attributsDuCookie(secure)}`;

/**
 * Le jeton, lu dans un en-tête `Cookie` — celui d'une requête côté serveur, ou
 * `document.cookie` côté navigateur, qui ont la même forme.
 */
export const jetonDuCookie = (enteteCookie: string | null, lien: CleDeLien): string | null =>
  lienValide(lien) ? valeurDuCookie(enteteCookie, nomDuCookie(lien)) : null;

const decodee = (valeur: string): string => {
  try {
    return decodeURIComponent(valeur);
  } catch {
    return valeur;
  }
};

/**
 * TOUS les jetons invités que le navigateur présente — la valeur de chaque
 * cookie `meeshy_guest_<lien>` de l'en-tête, quelle que soit la place.
 *
 * Le NOM porte le lien (ci-dessus), mais il n'est pas relu ici, et c'est
 * voulu : la place que ces jetons détiennent se RECONNAÎT auprès du serveur
 * (`reconnais`, `lib/api/invite.ts`), qui rend la clé canonique — un nom de
 * cookie n'est jamais promu en `CleDeLien` par le client, pas plus qu'un
 * segment d'adresse.
 *
 * Pourquoi cette lecture existe : quand l'aperçu du lien REFUSE (410 — clos,
 * échu, plein), sa charge ne porte aucun `linkId`, donc le nom du cookie de
 * CE lien n'est pas calculable. Or c'est précisément là que ce que le lecteur
 * DÉTIENT doit trancher avant l'aperçu (§ 6.3.B : « le jeton est bon tant
 * qu'il est bon ») : la route présente chacun de ces jetons à la porte qui
 * sait dire s'il appartient au lien. Un cookie sans valeur ne compte pas ;
 * deux cookies de même valeur ne comptent qu'une fois.
 */
export const jetonsDesCookies = (enteteCookie: string | null): readonly string[] => [
  ...new Set(
    (enteteCookie ?? '')
      .split(';')
      .map((morceau) => morceau.trim())
      .filter((morceau) => morceau.startsWith(RACINE_DU_COOKIE) && morceau.includes('='))
      .map((morceau) => morceau.slice(morceau.indexOf('=') + 1))
      .filter((valeur) => valeur !== '')
      .map(decodee),
  ),
];

/**
 * L'effacement, côté NAVIGATEUR — la projection de `effaceSession` sur le
 * cookie, quand l'état F est constaté par le module de participation (401 de
 * contrôle sur le battement). Même acte, même nom, même seul déclencheur.
 */
export const effaceLeCookie = (lien: CleDeLien): void => {
  if (typeof document === 'undefined' || !lienValide(lien)) return;
  document.cookie = cookieDEffacement({ lien, secure: document.location.protocol === 'https:' });
};

/**
 * LA PLACE, EFFACÉE SUR SES DEUX SUPPORTS — l'acte de l'état F tel que le
 * module de participation le pose : le cookie, que le serveur relit, ET le
 * stockage, que les AUTRES ONGLETS écoutent (`storage`, transition
 * `jeton-externe` de `lib/realtime/lifecycle.ts`). Un onglet dont le battement
 * constate la place fermée ferme ainsi ses voisins sans qu'aucun n'ait à
 * battre. Le stockage n'émet cet événement que si l'entrée EXISTAIT : c'est
 * pourquoi le module POSE la projection à son démarrage (`poseSession`) — un
 * effacement sans projection préalable ne dirait rien à personne.
 */
export const effaceLaPlace = (lien: CleDeLien): void => {
  effaceSession(lien);
  effaceLeCookie(lien);
};
