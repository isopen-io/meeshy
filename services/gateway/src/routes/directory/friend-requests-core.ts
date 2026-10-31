import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { withMutationLog } from '../../utils/withMutationLog';
import { validatePagination } from '../../utils/pagination';
import {
  cursorPage,
  decodePageCursor,
  keysetWhere,
  orderByFor,
  type CursorPosition,
  type CursorSort,
} from '../../utils/cursor-pagination';
import { parseRequestLevel } from '@meeshy/shared/types/relation';
import { judgeRelationRequest } from '../../services/relations/relationRequestGate';
import {
  INCLUDE_PARTIES,
  clauseHorsBlocage,
  filtreStatut,
  servirParties,
  type Resultat,
} from './friend-request-parties';
import { trancherDemande } from './friend-request-answer';
import { retirerDemande } from './friend-request-withdraw';

export { INCLUDE_PARTIES, clauseHorsBlocage, filtreStatut, servirParties } from './friend-request-parties';
export type { ClauseHorsBlocage, Refus, Resultat } from './friend-request-parties';

/** Le plafond d'une page de demandes. */
export const LIMITE_MAX_DEMANDES = 100;
const LIMITE_DEFAUT_DEMANDES = 20;

/** Les quatre gestes, et rien d'autre. */
export type ActionDemande = 'accept' | 'reject' | 'cancel' | 'dismiss';
export const ACTIONS: readonly ActionDemande[] = ['accept', 'reject', 'cancel', 'dismiss'] as const;

export type DirectionDemande = 'received' | 'sent' | 'any';

/**
 * ENVOYER une demande — l'UNION des gardes des deux familles, plus le blocage.
 *
 * ## Ce que chaque famille portait, et ce qu'aucune ne portait
 *
 * Deux familles complètes coexistaient, et le partage du trafic était INVERSÉ :
 * `POST /friend-requests`, celui que tous les clients appellent, n'avait ni
 * garde d'auto-envoi, ni contrôle de blocage, ni contrôle de désactivation, et
 * son `findUnique` était SANS `select`. Son jumeau orphelin
 * `POST /users/friend-requests` avait au moins la garde d'auto-envoi — et
 * personne ne l'appelait.
 *
 * Le BLOCAGE n'existait dans aucune des deux : quelqu'un qu'on a bloqué pouvait
 * continuer d'envoyer des demandes, et chacune poussait une notification.
 */
export async function envoyerDemande(
  fastify: FastifyInstance,
  request: FastifyRequest,
  params: { emetteurId: string; receveurId: string; message?: string; targetLevel?: unknown }
): Promise<Resultat<Record<string, unknown>>> {
  const { emetteurId, receveurId } = params;

  // Absent, le niveau visé est FRIEND (le sens historique) — et suit la même loi :
  // aucune exception d'ancien client (D-5). Illisible, il est refusé net.
  const niveau = params.targetLevel === undefined ? 'FRIEND' : parseRequestLevel(params.targetLevel);
  if (niveau === null) {
    return { refus: { code: 400, message: 'Niveau demandé illisible', codeMetier: 'RELATION_LEVEL_INVALID' } };
  }

  if (emetteurId === receveurId) {
    return { refus: { code: 400, message: 'You cannot add yourself as a friend' } };
  }

  // Le `select` était ABSENT de la route vivante : elle chargeait la ligne
  // utilisateur ENTIÈRE — mot de passe haché compris — pour tester son
  // existence. Les trois colonnes lues ici sont celles dont les gardes ont
  // besoin, et rien de plus.
  const receveur = await fastify.prisma.user.findUnique({
    where: { id: receveurId },
    select: { id: true, deactivatedAt: true, blockedUserIds: true },
  });

  if (!receveur) return { refus: { code: 404, message: 'Utilisateur non trouve' } };

  // Un compte DÉSACTIVÉ ne reçoit pas de demande : la ligne serait créée, la
  // notification poussée, et personne ne pourrait jamais y répondre.
  if (receveur.deactivatedAt) {
    return { refus: { code: 404, message: 'Utilisateur non trouve' } };
  }

  // Le BLOCAGE, dans les DEUX sens — et le refus est le MÊME message que
  // « déjà une demande ». Distinguer les deux ferait de cette route un oracle :
  // « cette personne vous a bloqué » est une information qu'un bloqueur n'a pas
  // choisi de donner.
  const emetteur = await fastify.prisma.user.findUnique({
    where: { id: emetteurId },
    select: { blockedUserIds: true },
  });

  const bloque =
    (receveur.blockedUserIds ?? []).includes(emetteurId) ||
    (emetteur?.blockedUserIds ?? []).includes(receveurId);

  if (bloque) {
    return { refus: { code: 409, message: 'Une demande d\'ami existe deja entre vous' } };
  }

  // Une demande EN ATTENTE retient la suivante — et, pour son ÉMETTEUR, une demande
  // REFUSÉE aussi, avec la MÊME réponse : il la lit « en attente » (`servirParties`),
  // une réponse différente dirait le refus (RG-07, audit #13933). Il la retire
  // lui-même (`cancel`) pour redemander, et le cool-down juge alors. Une demande
  // acceptée est l'histoire d'un cran déjà franchi : la loi des crans dit le reste.
  const existante = await fastify.prisma.friendRequest.findFirst({
    where: {
      OR: [
        { status: 'pending', senderId: emetteurId, receiverId: receveurId },
        { status: 'pending', senderId: receveurId, receiverId: emetteurId },
        { status: 'rejected', senderId: emetteurId, receiverId: receveurId },
      ],
    },
    select: { id: true },
  });

  if (existante) {
    return { refus: { code: 409, message: 'Une demande d\'ami existe deja entre vous' } };
  }

  const jugement = await judgeRelationRequest(fastify.prisma, {
    requesterId: emetteurId, otherId: receveurId, targetLevel: niveau, now: new Date(),
  });
  if (jugement.allowed === false) {
    return { refus: { code: 409, message: 'Cette demande n\'est pas possible maintenant', codeMetier: jugement.code } };
  }

  const demande = await withMutationLog({
    request,
    fastify,
    userId: emetteurId,
    kind: 'sendFriendRequest',
    // `diverges` — chaque exécution INSÈRE une ligne. Rejouer sur un résultat
    // disparu fabriquerait un doublon, d'où le 410 rendu par la route.
    replayCost: 'diverges',
    op: () => fastify.prisma.friendRequest.create({
      data: {
        senderId: emetteurId,
        receiverId: receveurId,
        message: params.message ? SecuritySanitizer.sanitizeText(params.message) : undefined,
        targetLevel: niveau,
      },
      include: INCLUDE_PARTIES,
    }),
    onDuplicate: (resultId) => fastify.prisma.friendRequest.findUnique({
      where: { id: resultId },
      include: INCLUDE_PARTIES,
    }),
  });

  const notifications = fastify.notificationService;
  if (notifications) {
    await notifications.createFriendRequestNotification({
      recipientUserId: receveurId,
      requesterId: emetteurId,
      friendRequestId: demande.id,
    });
    notifications.emitFriendRequestNew({
      receiverId: receveurId,
      friendRequestId: demande.id,
      senderId: emetteurId,
    });
  }

  // La ligne ne sort JAMAIS brute : le destinataire d'une demande est, par
  // définition, quelqu'un dont on n'est pas encore l'ami — sa présence est donc
  // masquée par la loi, et l'alias `routes/friends.ts` en bénéficie sans le
  // savoir puisqu'il appelle ce même cœur.
  const [servie] = await servirParties(fastify, request, [demande as unknown as Record<string, unknown>]);

  return { valeur: servie };
}

/**
 * Qui peut faire QUOI sur une demande — la seule règle d'autorisation du geste.
 *
 * `accept` et `reject` appartiennent au RECEVEUR ; `cancel` à l'ÉMETTEUR ;
 * `dismiss` à l'un ou l'autre. Les quatre gestes vivaient auparavant sur trois
 * routes et deux verbes, et la règle n'était écrite nulle part en entier.
 */
export function acteurAutorise(
  action: ActionDemande,
  demande: { senderId: string; receiverId: string },
  acteurId: string
): boolean {
  if (action === 'accept' || action === 'reject') return demande.receiverId === acteurId;
  if (action === 'cancel') return demande.senderId === acteurId;
  return demande.senderId === acteurId || demande.receiverId === acteurId;
}

/**
 * RÉPONDRE à une demande — un geste, un verbe.
 *
 * `accept` / `reject` écrivent le statut ; `cancel` / `dismiss` SUPPRIMENT la
 * ligne, ce que faisait le `DELETE` qu'ils remplacent. La différence n'est pas
 * cosmétique : une ligne supprimée n'a plus de notification où mener, d'où le
 * RETRAIT de la notification au lieu de son marquage.
 */
export async function repondreDemande(
  fastify: FastifyInstance,
  request: FastifyRequest,
  params: { acteurId: string; demandeId: string; action: ActionDemande }
): Promise<Resultat<Record<string, unknown>>> {
  const { acteurId, demandeId, action } = params;

  const demande = await fastify.prisma.friendRequest.findUnique({
    where: { id: demandeId },
    select: { id: true, senderId: true, receiverId: true, status: true, targetLevel: true },
  });

  // Un 404 pour TOUTES les raisons de refus — inexistante, déjà traitée, ou
  // pas à cet acteur. Distinguer « elle existe mais pas pour vous » de « elle
  // n'existe pas » dirait à un inconnu qu'une demande existe entre deux tiers.
  if (!demande || !acteurAutorise(action, demande, acteurId)) {
    return { refus: { code: 404, message: 'Demande d\'ami non trouvee' } };
  }

  if (action === 'cancel' || action === 'dismiss') {
    return retirerDemande(fastify, request, demande, acteurId);
  }

  if (demande.status !== 'pending') {
    return { refus: { code: 404, message: 'Demande d\'ami non trouvee ou deja traitee' } };
  }

  return trancherDemande(fastify, request, demande, acteurId, action);
}

export type PageDeDemandes = {
  readonly items: ReadonlyArray<Record<string, unknown>>;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly limit: number;
};

/**
 * L'ordre TOTAL de la liste — DÉCLARÉ une fois, et ce que le curseur encode
 * (#4900).
 *
 * « Total » n'est pas décoratif. Cette route bornait sa page par
 * `{ createdAt: { lt } }` SEUL : deux demandes nées dans la même milliseconde que
 * la dernière ligne servie étaient TOUTES LES DEUX jetées de la page suivante, et
 * n'apparaissaient sur AUCUNE page. Son alias DÉPRÉCIÉ (`routes/friends.ts`)
 * ayant rallié la loi partagée au lot #4175, le déprécié départageait ses ex æquo
 * quand son successeur canonique ne le faisait pas — retirer l'alias aurait donc
 * fait PERDRE une correction, l'inversion exacte qu'un plan de dépréciation ne
 * peut pas signaler.
 *
 * La loi partagée dérive de cette seule déclaration l'`orderBy`, la clause de
 * reprise ET la signature inscrite dans le jeton : les trois ne peuvent plus
 * diverger.
 */
const ORDRE_DEMANDES: CursorSort = [
  { field: 'createdAt', direction: 'desc', kind: 'date' },
  { field: 'id', direction: 'desc', kind: 'string' },
];

/**
 * L'ordre — PARTIEL — sous lequel les jetons EN VOL ont été frappés.
 *
 * Cette route a servi son curseur en HORODATAGE ISO EN CLAIR. Le motif que la
 * loi porte déjà pour `/notifications` s'applique : un jeton sans version est
 * accepté quand ses clés sont exactement les champs d'un ordre DÉCLARÉ.
 *
 * ## Qui tient un tel jeton, MESURÉ
 *
 * Aucun client ne le PERSISTE au-delà d'une session : les deux consommateurs le
 * gardent dans une variable LOCALE et drainent la liste entière en une passe —
 * `useFriendRequestsV2` (`apps/web/hooks/v2/use-friend-requests-v2.ts`) met en
 * cache la LISTE drainée, pas le curseur, et `ContactsListViewModel`
 * (`apps/ios/…/Features/Contacts/`) fait de même. L'exposition réelle est donc
 * un drain À CHEVAL sur un déploiement — page N frappée par l'ancien code,
 * page N+1 servie par le nouveau (ou l'inverse, en flotte mixte). Refuser le
 * jeton y interromprait le drain au milieu : la liste de contacts reviendrait
 * TRONQUÉE, et sans erreur visible pour le lecteur.
 *
 * ## Ce que cette position permet, et ce qu'elle ne permet pas
 *
 * L'ordre est PARTIEL : un horodatage seul ne dit pas SUR LAQUELLE des lignes de
 * sa milliseconde le client s'est arrêté. La loi en dérive donc la seule clause
 * que cette position autorise, `{ createdAt: { lt } }` — exactement la fenêtre
 * que le client avait, ni plus étroite ni plus large. Elle ne départage pas les
 * ex æquo, et ne le peut pas : c'est précisément ce qui manquait au jeton, et
 * la raison pour laquelle il est devenu TOTAL. La page reste ORDONNÉE et
 * RÉ-ANCRÉE sous l'ordre total, si bien que le jeton rendu en échange départage
 * — la transition ne dure qu'UNE page.
 */
const ORDRE_HISTORIQUE: CursorSort = ORDRE_DEMANDES.slice(0, 1);

/** Une position de reprise, avec l'ORDRE sous lequel elle a été frappée. */
type Reprise = { readonly ordre: CursorSort; readonly position: CursorPosition };

/**
 * Le jeton d'un appelant relu — opaque d'abord, historique ensuite, `null` sinon.
 *
 * L'ordre des deux tentatives n'est pas indifférent : un jeton opaque est du
 * base64url, qu'aucun analyseur de date ne lit, tandis qu'un horodatage ISO n'est
 * pas un jeton opaque valide. Les deux formes ne se recouvrent pas, et la forme
 * COURANTE est essayée la première.
 *
 * `null` couvre tout le reste — jeton tronqué, d'une version inconnue, ou frappé
 * sous un AUTRE ordre.
 *
 * ## Pourquoi 400, quand l'alias sert la première page
 *
 * Le dépôt connaît les deux lectures d'un jeton illisible et la loi les laisse
 * décider ({@link decodePageCursor}). `routes/friends.ts` sert la première page ;
 * cette route rend 400 (contrat de #4254), et le discriminant est le CLIENT.
 *
 * Les deux consommateurs de cette adresse DRAINENT en boucle et ne s'arrêtent
 * que sur un curseur ABSENT, en APPENDANT à un accumulateur borné à 500 — les
 * deux le disent en commentaire, mot pour mot : « redemander la même page
 * tournerait en rond jusqu'au plafond en collectant des doublons ». Un repli
 * silencieux sur la première page produirait exactement cela : le même lot
 * re-servi jusqu'à la borne, sans qu'aucune erreur ne remonte. Le 400 arrête la
 * boucle, et se voit.
 *
 * L'alias, lui, n'a que des appelants par RANG (`offset`) qui n'envoient jamais
 * de curseur : son repli y est inerte.
 */
function repriseDepuis(cursor: string): Reprise | null {
  const totale = decodePageCursor(cursor, ORDRE_DEMANDES);
  if (totale) return { ordre: ORDRE_DEMANDES, position: totale };

  const horodatage = new Date(cursor);
  if (Number.isNaN(horodatage.getTime())) return null;
  return { ordre: ORDRE_HISTORIQUE, position: { createdAt: horodatage.toISOString() } };
}

/**
 * LISTER — une route pour les trois listings et le fantôme.
 *
 * `GET /friend-requests/received`, `/sent`, `/users/friend-requests` et un
 * `GET /friend-requests` sans suffixe QUI N'EXISTAIT PAS, appelé par deux sites
 * web dont le `if (response.ok)` avalait le 404 : la page contacts historique
 * affichait une liste vide DÉFINITIVE.
 *
 * `q` filtre côté SERVEUR. Sans lui, le web drainait la liste entière page par
 * page pour filtrer en mémoire.
 */
export async function listerDemandes(
  fastify: FastifyInstance,
  request: FastifyRequest,
  params: {
    acteurId: string;
    direction?: DirectionDemande;
    status?: string;
    q?: string;
    cursor?: string;
    limit?: string;
  }
): Promise<Resultat<PageDeDemandes>> {
  const { limit: taille } = validatePagination('0', params.limit, {
    defaultLimit: LIMITE_DEFAUT_DEMANDES,
    maxLimit: LIMITE_MAX_DEMANDES,
  });

  if (params.limit !== undefined && String(taille) !== params.limit.trim()) {
    return { refus: { code: 400, message: `limit must be an integer between 1 and ${LIMITE_MAX_DEMANDES}` } };
  }

  const direction: DirectionDemande = params.direction ?? 'received';
  const identite =
    direction === 'received' ? { receiverId: params.acteurId }
    : direction === 'sent' ? { senderId: params.acteurId }
    : { OR: [{ receiverId: params.acteurId }, { senderId: params.acteurId }] };

  // Le curseur est relu par la LOI PARTAGÉE, jamais borné à la main : elle tient
  // ENSEMBLE l'`orderBy`, la clause de reprise et la signature du jeton, si bien
  // que les trois ne peuvent plus diverger. Un jeton illisible reste un 400, et
  // un horodatage ISO — la forme que cette route servait — reprend toujours
  // (cf. {@link repriseDepuis}).
  const point = params.cursor ? repriseDepuis(params.cursor) : null;
  if (params.cursor && point === null) {
    return { refus: { code: 400, message: 'cursor is not a cursor served by this route' } };
  }

  const filtreTexte = params.q
    ? {
        OR: [
          { sender: { username: { contains: params.q, mode: 'insensitive' as const } } },
          { sender: { displayName: { contains: params.q, mode: 'insensitive' as const } } },
          { receiver: { username: { contains: params.q, mode: 'insensitive' as const } } },
          { receiver: { displayName: { contains: params.q, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  // La clause de reprise, ET-isée avec les gardes de la route et jamais
  // substituée : c'est ce qui rend impossible la faute la plus chère — une page
  // suivante qui « oublie » l'identité du lecteur.
  //
  // La loi rend son `OR` en LECTURE SEULE (elle ne laisse aucun site d'appel
  // muter sa clause) là où Prisma déclare le sien mutable. La COPIE traduit
  // l'une dans l'autre — c'est ce que `cursorQuery` obtient par une assertion
  // de type, que ce site n'a pas besoin de reprendre.
  const reprise = point
    ? [{ OR: [...keysetWhere(point.ordre, point.position).OR] }]
    : [];

  const horsBlocage = await clauseHorsBlocage(fastify, params.acteurId);

  const lignes = await fastify.prisma.friendRequest.findMany({
    where: {
      AND: [
        identite,
        horsBlocage,
        filtreStatut(params.status, params.acteurId),
        filtreTexte,
        ...reprise,
      ],
    },
    include: INCLUDE_PARTIES,
    orderBy: orderByFor(ORDRE_DEMANDES),
    // La ligne SONDE : elle dit `hasMore` sans compter la table.
    take: taille + 1,
  });

  // Le curseur se frappe sur la ligne BRUTE — `servirParties` MASQUE des champs
  // de présence, il ne retire aucune ligne : la ligne lue EST la ligne servie.
  // Faire dépendre la pagination d'une projection filtrée est exactement ce qui
  // produit, ailleurs dans le dépôt, des pages vides que le client compense à la
  // main.
  const servie = cursorPage({
    sort: ORDRE_DEMANDES,
    rows: lignes as unknown as Array<Record<string, unknown>>,
    limit: taille,
  });

  const items = await servirParties(fastify, request, servie.page);

  return {
    valeur: {
      items,
      hasMore: servie.pagination.hasMore,
      nextCursor: servie.pagination.nextCursor,
      limit: taille,
    },
  };
}
