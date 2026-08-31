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

const RACINE = 'meeshy.guest.';

/**
 * CE QU'UNE PLACE OUVERTE DONNE LE DROIT DE FAIRE — les quatre booléens que la
 * réponse de jonction sert, et rien d'autre.
 *
 * Ils sont ici, dans le module de la PLACE, et pas dans `adhesion.ts` : ce sont
 * des faits qui SURVIVENT à l'appel qui les a rendus. L'écran `rights` les relit
 * au rechargement, sans repasser par la passerelle, et le composeur de `thread`
 * les relira du battement (§ 6.3 B : « les droits sont RE-LUS de la réponse :
 * l'hôte a pu les changer »). Les ranger avec le jeton est ce qui rend cette
 * relecture possible sans seconde source.
 *
 * La correspondance avec la passerelle est écrite ici, une fois : `ecrire` ←
 * `participant.canSendMessages`, `fichiers` ← `participant.canSendFiles`,
 * `images` ← `participant.canSendImages`, `historique` ←
 * `conversation.allowViewHistory` (`participantConversationPayload`,
 * `services/gateway/src/routes/conversations/link-admission.ts`).
 */
export type DroitsDeLaPlace = {
  readonly ecrire: boolean;
  readonly fichiers: boolean;
  readonly images: boolean;
  readonly historique: boolean;
};

/** Ce qui est persisté d'une place invitée — et rien de plus. */
export type SessionInvitee = {
  /** Le jeton opaque du serveur. Aucun TTL, aucune signature horodatée. */
  readonly jeton: string;
  /** Ce qui dit « cette bulle est de moi » avant le premier aller-retour. */
  readonly participantId: string;
  /** Ce que l'état F pré-remplit quand le lecteur reprend sa place au bouton. */
  readonly pseudo: string;
  /**
   * LE RANG 1 DU PRISME D'UN LECTEUR ANONYME — et il n'existait nulle part.
   *
   * Un invité n'a ni `systemLanguage`, ni `regionalLanguage`, ni
   * `customDestinationLanguage` : la SEULE langue qu'il déclare est celle du
   * champ « Langue parlée » du formulaire d'entrée, que la passerelle normalise
   * et persiste en `Participant.language`, et qu'elle REND sur les deux réponses
   * de la place (`participantConversationPayload` → `participant.language`, le
   * 201 du join comme le 200 du refresh). Le parseur la jetait : l'écran qui
   * CONFIRME l'entrée — celui-là même qui parle de traduction — ne savait pas
   * dans quelle langue son lecteur allait lire.
   *
   * `null` quand la réponse ne l'a pas dite ; l'écran se tait alors sur la
   * langue plutôt que d'en nommer une qu'il aurait devinée.
   */
  readonly langue: string | null;
  /**
   * Le TITRE de la conversation, tel que la réponse de la place le sert
   * (`conversation.title`).
   *
   * Il est rangé ICI, avec le jeton, pour une raison qui n'est pas de confort :
   * sans lui, l'écran des droits ne peut pas se peindre quand la passerelle est
   * muette, puisque son seul autre porteur est l'APERÇU DU LIEN — un appel
   * réseau, sur le chemin où précisément le réseau manque. Une place doit
   * pouvoir s'afficher hors-ligne (§ 7).
   */
  readonly nom: string | null;
  /**
   * L'ADRESSE DU FIL — `conversation.id`, tel que les deux réponses de la place
   * le servent.
   *
   * Il est rangé avec le jeton pour la même raison que le titre : sans lui,
   * l'écran du fil ne peut pas demander ses messages quand la passerelle est
   * muette, et il n'est déductible de RIEN — la clé du lien n'est pas
   * l'identifiant de la conversation, et le segment d'URL encore moins.
   *
   * `null` quand la réponse ne l'a pas dit ; l'écran retombe alors sur l'écran
   * des droits plutôt que d'appeler une porte avec une adresse inventée.
   */
  readonly conversationId: string | null;
  /**
   * Ce que la place OUVRE — `null` quand la réponse ne l'a pas dit.
   *
   * `null` n'est pas « aucun droit » : c'est « la porte n'a pas répondu à cette
   * question ». Les deux ne se peignent pas pareil, et les confondre refuserait
   * à l'écran des droits que le visiteur a réellement. Le cas est REEL : une
   * entrée écrite par une version antérieure n'en porte aucun, et rien
   * n'autorise à l'effacer pour autant (point 3 ci-dessus).
   */
  readonly droits: DroitsDeLaPlace | null;
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
 * Ce qu'une clé canonique peut CONTENIR — la seule chose que ce module sache
 * dire d'un candidat sans avoir vu la réponse d'un serveur.
 *
 * Ce n'est PAS une reconnaissance de forme : les trois formes que la passerelle
 * accepte (`linkId`, `identifier`, ObjectId) sont indiscernables (point 2 bis),
 * et rien ici ne prétend le contraire. C'est une contrainte de NOM : la clé
 * compose un nom de cookie et un nom d'entrée de stockage, et un candidat venu
 * d'une URL est écrit par n'importe qui. Un candidat qui sort de cet alphabet
 * n'est refusé qu'à ce titre.
 */
const NOMMABLE = /^[A-Za-z0-9._~-]{1,128}$/;

/**
 * La clé ATTESTÉE — l'unique chemin par lequel un CANDIDAT devient une clé.
 *
 * `cleDeLien` produit une clé depuis la RÉPONSE d'un serveur ; il n'y a pas de
 * seconde fabrique, et le segment d'URL n'en sera jamais une. Mais une place
 * DÉJÀ OUVERTE laisse une trace nommée d'après sa clé canonique, et cette trace
 * est une attestation : si une entrée existe sous `meeshy.guest.<candidat>`,
 * c'est que ce serveur l'y a écrite depuis un `linkId` qu'un serveur lui a
 * rendu. Le candidat n'a donc rien PRODUIT — il a INDEXÉ.
 *
 * Cette nuance est ce qui permet de lire la place AVANT d'appeler la passerelle
 * (§ 6.3 B : « rend d'abord le CACHE », « n'appelle JAMAIS `join` »). Sans elle,
 * connaître sa propre place exigeait un aperçu du LIEN — c'est-à-dire de faire
 * dépendre l'existence d'une place de l'état d'une porte qui ne la connaît pas,
 * et qui refuse (410 `LINK_MAX_USES`) précisément parce que la place a été
 * prise.
 *
 * `atteste` reçoit le NOM D'ENTRÉE complet, jamais le candidat : composer ce nom
 * est le rôle de `cleDuLien`, et deux compositions feraient deux façons de
 * nommer une place.
 */
export const cleAttestee = (
  candidat: string,
  atteste: (nom: string) => boolean,
): CleDeLien | null =>
  NOMMABLE.test(candidat) && atteste(cleDuLien(candidat as CleDeLien))
    ? (candidat as CleDeLien)
    : null;

/** Un candidat peut-il seulement NOMMER une entrée ? — la moitié de `cleAttestee` qui ne lit rien. */
export const estNommable = (candidat: string): boolean => NOMMABLE.test(candidat);

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

/**
 * Les quatre droits, ou RIEN.
 *
 * Une entrée partielle ne se complète pas par un défaut : compléter par `false`
 * retirerait un droit accordé, compléter par `true` en promettrait un qui ne
 * l'est pas. Les quatre sont là, booléens, ou la place ne sait pas — et l'écran
 * le dit en retombant sur ce que le LIEN déclare.
 */
export const droitsDepuisLaValeur = (valeur: unknown): DroitsDeLaPlace | null => {
  if (typeof valeur !== 'object' || valeur === null) return null;

  const lu = (nom: keyof DroitsDeLaPlace): boolean | null => {
    const droit = Object.getOwnPropertyDescriptor(valeur, nom)?.value;
    return typeof droit === 'boolean' ? droit : null;
  };

  const ecrire = lu('ecrire');
  const fichiers = lu('fichiers');
  const images = lu('images');
  const historique = lu('historique');

  return ecrire === null || fichiers === null || images === null || historique === null
    ? null
    : { ecrire, fichiers, images, historique };
};

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

  return {
    jeton,
    participantId,
    pseudo: texte(champ(decodee, 'pseudo')) ?? '',
    langue: texte(champ(decodee, 'langue')),
    nom: texte(champ(decodee, 'nom')),
    conversationId: texte(champ(decodee, 'conversationId')),
    droits: droitsDepuisLaValeur(champ(decodee, 'droits')),
  };
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
    langue: session.langue,
    nom: session.nom,
    conversationId: session.conversationId,
    droits: session.droits,
  };

  surLeStockage(undefined, (stockage) => stockage.setItem(cleDuLien(lien), JSON.stringify(entree)));
};

/** L'acte NOMMÉ de l'état F — le seul chemin par lequel une place se perd côté client. */
export const effaceSession = (lien: CleDeLien): void => {
  if (!lienValide(lien)) return;

  surLeStockage(undefined, (stockage) => stockage.removeItem(cleDuLien(lien)));
};
