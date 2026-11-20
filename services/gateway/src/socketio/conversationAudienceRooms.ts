import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { PARTICIPATION_VIVANTE } from '../routes/conversations/utils/access-control';
import { participantUserRooms, type ParticipantRoomTarget } from './emitToConversationParticipants';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'conversationAudienceRooms' });

/**
 * Le plafond de la lecture — et une BORNE DE MÉMOIRE, pas une borne de requête.
 *
 * C'était 2 000, et dépasser faisait **JETER** l'audience (`return []`) : la
 * diffusion repliait alors sur la room de conversation seule, où un lecteur
 * resté sur la LISTE ne reçoit rien (#20007).
 *
 * Ce qu'il borne, c'est ce qu'une mutation tient en mémoire : ~50 000 couples
 * `{ id, userId }` et autant de noms de rooms. Dépasser **TRONQUE en le
 * journalisant** ; la perte d'avant était muette.
 *
 * Et il ne bornait RIEN tant qu'il ne valait que pour ce module : l'enfilage
 * hors ligne de la MÊME mutation relisait ces mêmes lignes, même `where`, même
 * `select`, sans plafond, quelques lignes plus bas dans le même appel. **Une
 * borne qui vaut pour un site d'une question posée par sept n'est pas une
 * borne, c'est une discipline locale** — le coût était payé de toute façon, par
 * le site d'à côté. Depuis #20020, `scanLiveParticipants` est le seul endroit
 * du dépôt où cette lecture s'écrit, et le balayage
 * `live-audience-bound-sweep` tient l'inventaire de ce qui n'y est pas encore.
 */
export const LIVE_AUDIENCE_SCAN_CAP = 50_000;

/**
 * L'audience vivante d'une conversation, et ce que la lecture a PROUVÉ.
 *
 * `complete` est la seule façon de séparer deux phrases qui sortaient par la
 * même valeur (`[]`) : `complete: true` ⇒ « il n'y a aucun participant vivant »
 * (une affirmation), `complete: false` ⇒ « la lecture n'a pas nommé toute
 * l'audience » (une panne, ou le plafond). La distinction ne change rien à
 * l'émission — les deux replient sur la room de conversation — et elle est la
 * condition pour que cette lecture soit un jour PARTAGÉE avec la file hors
 * ligne (#20020), où `[]` vaudrait « aucun participant » et n'enfilerait pour
 * PERSONNE (règle du cycle 116, « `[]` par défaut décide à la place du
 * consommateur »).
 */
export type LiveAudience = {
  readonly targets: ReadonlyArray<ParticipantRoomTarget>;
  readonly complete: boolean;
};

export type ParticipantScanOptions = {
  readonly onError?: (error: unknown) => void;
  /**
   * Le plafond, paramétrable pour qu'un témoin puisse l'ATTEINDRE sans
   * fabriquer 50 001 lignes — et pour qu'un site dont le verdict est UNIVERSEL
   * (« aucun destinataire n'a coupé ses accusés », `earlyBurnMayReachSender`)
   * puisse exiger le sien, bien plus bas : il ne peut rien conclure d'une
   * lecture tronquée, donc il paie moins cher pour la même phrase.
   */
  readonly cap?: number;
  /**
   * Ce que le journal de troncature NOMME — jamais une décoration : il dit ce
   * que la troncature a COÛTÉ, et le prix n'est pas le même d'un chemin à
   * l'autre (une diffusion replie sur la room ; la file hors ligne, dont la
   * garantie est DURABLE, perd des entrées que rien ne rejouera).
   */
  readonly scanLabel?: string;
};

/**
 * Les options de la lecture des participants VIVANTS — la machinerie, plus la
 * seule liberté qu'un appelant obtient sur le `where`.
 */
export type LoadLiveAudienceOptions = ParticipantScanOptions & {
  /**
   * Des clauses SUPPLÉMENTAIRES, qui ne peuvent que RÉTRÉCIR l'audience.
   *
   * Elles existent pour la loi du plancher d'historique (#20050), dont la
   * première lecture ne demande pas « qui est vivant ? » mais « qui est vivant
   * ET arrivé APRÈS ce message ? » : sans elles, ce site paierait la lecture
   * ENTIÈRE pour une question qui, au cas nominal, ne rend rien.
   *
   * **C'est un TABLEAU, et il part dans un `AND`, pas dans un spread** — la
   * première écriture de cette option prenait un objet ÉTALÉ à côté de la loi,
   * et son doc-comment affirmait qu'un appelant « ne peut pas élargir
   * l'audience ». C'était faux, et l'audit adversarial du lot l'a mesuré :
   * `{ OR: [...] }` — la façon NATURELLE d'écrire un rétrécissement disjonctif
   * — écrasait l'`OR` de `bannedAt` et faisait perdre la garde de
   * BANNISSEMENT ; `{ isActive: undefined }` faisait perdre celle d'ACTIVITÉ.
   * Le piège est NOMMÉ dans le dépôt (`utils/prisma-unset.ts` : « le spread
   * silencieux qui écraserait un `OR` existant est le seul piège de cet
   * utilitaire »), et cette option y ouvrait un chemin générique documenté
   * comme sûr. Sous un `AND`, un appelant ne peut plus qu'ajouter une
   * conjonction : il ne touche ni `isActive`, ni `bannedAt`, ni
   * `conversationId`.
   */
  readonly narrowing?: ReadonlyArray<Record<string, unknown>>;
};

/**
 * Les options de la lecture des participants ACTIFS, qui n'admet PAS de
 * rétrécissement — `narrowing: never` plutôt qu'une absence, parce qu'une
 * absence COMPILE dès que l'appelant passe une variable : la fonction
 * l'ignorerait en silence, et l'appelant lirait une audience plus large que
 * celle qu'il croit demander (constat de l'audit adversarial du lot).
 */
export type ActiveParticipantScanOptions = ParticipantScanOptions & {
  readonly narrowing?: never;
};

/**
 * Ce qu'une lecture BORNÉE des participants vivants rend, quelle que soit sa
 * projection : les lignes, et si elles sont TOUTES les lignes.
 *
 * Le paramètre de type est la projection — la seule chose qui varie entre les
 * consommateurs de cette question. Le `where`, la borne, la sonde
 * excédentaire, le journal de troncature et le verdict de complétude n'en
 * dépendent pas, et c'est pour cela qu'ils vivent ICI : chaque site qui les
 * réécrivait en a perdu au moins un (#20020 : sept sites posent cette
 * question, cinq sans aucune borne).
 */
export type LiveParticipantScan<Row> = {
  readonly rows: ReadonlyArray<Row>;
  readonly complete: boolean;
};

/**
 * La lecture BORNÉE des participants vivants d'UNE conversation, sous la
 * projection que l'appelant déclare.
 *
 * C'est le site unique de la borne, de la sonde `cap + 1`, du journal de
 * troncature et du verdict de complétude. Un appelant n'apporte que son
 * `select` — et il n'a pas le droit d'apporter un `take` : la borne n'est pas
 * négociable au site, c'est tout l'objet de cette fonction.
 *
 * Ne lève pas. Une lecture tombée rend `{ rows: [], complete: false }`, soit
 * « je n'ai rien prouvé » — jamais « il n'y a personne ».
 */
export async function scanLiveParticipants<Row>(
  prisma: Pick<PrismaClient, 'participant'>,
  conversationId: string,
  select: Record<string, unknown>,
  options?: LoadLiveAudienceOptions,
): Promise<LiveParticipantScan<Row>> {
  const narrowing = options?.narrowing ?? [];
  return boundedScan<Row>(conversationId, options, async (probe) =>
    (await prisma.participant.findMany({
      where: {
        conversationId,
        ...(narrowing.length > 0 ? { AND: [...narrowing] } : {}),
        ...PARTICIPATION_VIVANTE,
      },
      select,
      take: probe,
    })) as Row[],
  );
}

/**
 * La lecture BORNÉE des participants ACTIFS — une question PLUS LARGE que la
 * précédente, et délibérément : elle ne retire pas les BANNIS.
 *
 * Elle existe pour un seul usage, et il justifie l'écart : composer un
 * COMPLÉMENT (`actifs moins admis`, `translationReaders`), c'est-à-dire nommer
 * ceux qui ne doivent RIEN recevoir. Un banni doit y figurer — il est actif, il
 * n'est pas admis — alors qu'il n'a rien à faire dans une AUDIENCE.
 *
 * Elle vit ici, et non chez son appelant, parce que la borne, la sonde, le
 * journal et le verdict de complétude sont les mêmes : c'est la QUESTION qui
 * change, jamais la machinerie. Un site qui la réécrirait en perdrait au moins
 * un (#20020).
 */
export async function scanActiveParticipants<Row>(
  prisma: Pick<PrismaClient, 'participant'>,
  conversationId: string,
  select: Record<string, unknown>,
  options?: ActiveParticipantScanOptions,
): Promise<LiveParticipantScan<Row>> {
  return boundedScan<Row>(conversationId, options, async (probe) =>
    (await prisma.participant.findMany({
      // `isActive` NU, délibérément : voir le doc-comment ci-dessus, et
      // l'entrée `conversationAudienceRooms.ts#1` de `DELIBERATELY_WIDE`
      // (#16690), qui porte la raison et que ce site DÉSIGNE.
      where: { conversationId, isActive: true },
      select,
      take: probe,
    })) as Row[],
  );
}

/**
 * La machinerie commune aux deux questions : la borne, la sonde `cap + 1`, le
 * journal de troncature et le verdict de complétude.
 *
 * **Elle reçoit la LECTURE, jamais le `where`**, et ce n'est pas un détail de
 * style : la première écriture de ce lot passait la clause de participation en
 * PARAMÈTRE, si bien que le `where` de production se lisait
 * `{ conversationId, ...participation }` — et le cliquet #16690, qui tient la
 * distinction « audience ⇒ loi étroite / refus ⇒ sur-ensemble » sur le LITTÉRAL
 * du `where`, est devenu rouge en nommant un site qu'il ne pouvait plus juger.
 * Le discriminant avait quitté le code pour devenir un choix de nom de
 * fonction, qu'aucun balayage ne lit. Chaque question ÉPELLE donc sa clause
 * chez elle ; la machinerie ne décide que de la borne, et la sonde reste
 * incessible — un appelant reçoit `probe`, il ne le choisit pas.
 */
async function boundedScan<Row>(
  conversationId: string,
  options: ParticipantScanOptions | undefined,
  read: (probe: number) => Promise<Row[]>,
): Promise<LiveParticipantScan<Row>> {
  const cap = options?.cap ?? LIVE_AUDIENCE_SCAN_CAP;
  let rows: Row[];
  try {
    // `cap + 1` : la ligne EXCÉDENTAIRE est la sonde « y en a-t-il d'autres ? »,
    // la seule façon de distinguer une audience de la taille exacte du plafond
    // d'une audience tronquée.
    rows = await read(cap + 1);
  } catch (error) {
    options?.onError?.(error);
    return { rows: [], complete: false };
  }

  const scanned = rows ?? [];
  if (scanned.length <= cap) return { rows: scanned, complete: true };

  // Le seul cas où une mutation n'atteint pas toute la liste, et il ne se tait
  // plus : c'était la perte SILENCIEUSE que l'audit de #19954 a nommée.
  logger.warn('live participant scan truncated by cap', {
    conversationId,
    cap,
    named: cap,
    scan: options?.scanLabel ?? 'live-audience',
  });
  return { rows: scanned.slice(0, cap), complete: false };
}

/** La projection qui NOMME une room : `id` pour un participant sans ligne `User`. */
const ROOM_TARGET_SELECT = { id: true, userId: true } as const;

/**
 * Les participants VIVANTS d'une conversation, réduits aux deux identités qui
 * nomment une room — en UNE lecture bornée, sans tri.
 *
 * ── Pourquoi UNE lecture, et pas des pages ──────────────────────────────────
 *
 * Une pagination au curseur a d'abord été écrite ici, puis retirée par l'audit
 * adversarial du lot : elle exigeait `orderBy: { id: 'asc' }`, qu'AUCUN index de
 * `Participant` ne sert (`@@index([conversationId, isActive])` ne porte pas
 * `_id`). Le moteur aurait donc payé un TRI BLOQUANT sur tous les participants
 * du fil, **par page**, sur un chemin chaud — là où la lecture sans tri se
 * stream depuis l'index et s'arrête au plafond. Elle ajoutait en prime une
 * course : un curseur désigne une LIGNE, et `cleanupExpiredData` supprime
 * physiquement des participants anonymes vivants.
 *
 * Ne lève pas : une lecture qui tombe rend `{ targets: [], complete: false }`,
 * et l'appelant replie sur la room de conversation — jamais sur rien.
 */
export async function loadLiveAudience(
  prisma: Pick<PrismaClient, 'participant'>,
  conversationId: string,
  options?: LoadLiveAudienceOptions,
): Promise<LiveAudience> {
  const scan = await scanLiveParticipants<ParticipantRoomTarget>(
    prisma,
    conversationId,
    ROOM_TARGET_SELECT,
    options,
  );
  return { targets: scan.rows, complete: scan.complete };
}

/**
 * La même audience, moins les cibles qu'un prédicat écarte — en gardant le
 * verdict de complétude, qui parle de la LECTURE et non du filtre.
 */
export function filterLiveAudience(
  audience: LiveAudience,
  keep: (target: ParticipantRoomTarget) => boolean,
): LiveAudience {
  return { targets: audience.targets.filter(keep), complete: audience.complete };
}

/**
 * La room de conversation SUIVIE des rooms personnelles (`userId ?? id`),
 * dédoublonnées, pour UNE diffusion : Socket.IO ne remet l'événement qu'une
 * fois par socket présent dans plusieurs de ces rooms — et cette garantie n'est
 * vraie que par ÉMISSION, ce qui est la raison de n'en faire qu'une. Sans
 * participant nommé, la room de conversation seule, sous sa forme de chaîne.
 *
 * `ServerEmitIO.to` accepte `string | string[]` depuis le cycle 108 : une
 * audience de 50 000 part donc en un seul appel, dédoublonnée de bout en bout,
 * sans élargir la porte d'émission.
 */
export function conversationAudienceRooms(
  conversationId: string,
  audience: LiveAudience,
): string | string[] {
  const rooms = participantUserRooms(audience.targets, [ROOMS.conversation(conversationId)]);
  return rooms.length === 1 ? rooms[0] : rooms;
}
