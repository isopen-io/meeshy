import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Qui a ouvert une vue unique, et qu'est-ce que cela change — PAR PERSONNE
 * (#7578).
 *
 * ─── LE DÉFAUT QUE CE MODULE REMPLACE ───────────────────────────────────────
 *
 * La consommation tenait un compteur GLOBAL du message, plafonné par défaut à
 * un (`maxViewOnceCount ?? 1`). La première personne qui ouvrait — l'AUTEUR
 * compris — épuisait le budget : la destruction était programmée pour tous, et
 * un destinataire qui n'avait encore rien vu perdait le message. Les clients
 * lisaient de leur côté `viewOnceCount ≥ maxViewOnceCount` comme « brûlé »,
 * donc la même ouverture d'un tiers masquait le message chez tout le monde.
 *
 * ─── LA RÈGLE (porteur, 2026-09-23) ─────────────────────────────────────────
 *
 *  1. Chaque participant, auteur compris, ouvre UNE fois. Ce qu'une personne
 *     ouvre ne retire rien aux autres.
 *  2. L'ouverture de l'auteur ne compte JAMAIS dans l'audience.
 *  3. Le contenu n'est purgé que lorsque TOUS les destinataires ACTIFS l'ont
 *     ouvert (ou au plafond de rétention, posé à l'envoi). Même alors, la bulle
 *     reste : seul le contenu disparaît.
 *
 * La donnée qui rend ce calcul exact existe déjà et est unique par spectateur :
 * `MessageStatusEntry.viewedOnceAt`, posée par `recordViewOnceConsumption`. Ce
 * module la RELIT — il ne se fie pas au compteur dénormalisé, qu'une ouverture
 * d'auteur avait gonflé sur les messages existants : relire la source répare
 * ces messages sans migration.
 *
 * ─── « ACTIF » ──────────────────────────────────────────────────────────────
 *
 * Un membre parti ne bloque pas la purge, et son ouverture passée ne compte pas
 * pour ceux qui restent : numérateur et dénominateur se lisent sur les mêmes
 * participants actifs. L'auteur est retiré des deux.
 */

/** Plafond des ouvertures relues pour UNE lecture (#4165 : aucun `findMany` nu). */
const VIEW_ONCE_OPENINGS_SCAN_CAP = 5000;

export type ViewOnceAudiencePrisma = Pick<PrismaClient, 'messageStatusEntry' | 'participant'>;

export interface ViewOnceMessageRef {
  readonly id: string;
  readonly conversationId: string;
  /** `Participant.id` de l'auteur — la clé de `MessageStatusEntry`. */
  readonly senderId: string;
  readonly isViewOnce?: boolean | null;
  /** Contenu déjà purgé : l'état final, quel que soit le compte. */
  readonly viewOnceBurnedAt?: Date | null;
}

export interface ViewOnceReaderState {
  /** Ce lecteur a-t-il déjà ouvert le message ? Vrai pour l'auteur aussi. */
  readonly consumedByMe: boolean;
  /** Tous les destinataires actifs l'ont ouvert, ou le contenu est purgé. */
  readonly isFullyConsumed: boolean;
  /** Destinataires actifs (auteur exclu) qui l'ont ouvert. */
  readonly openedCount: number;
  /** Destinataires actifs (auteur exclu) — le dénominateur. */
  readonly recipientCount: number;
}

/**
 * L'état fermé : servi quand la lecture des ouvertures échoue. Un lecteur dont
 * on ne sait pas s'il a ouvert est traité comme l'ayant fait — la porte échoue
 * en montrant MOINS, jamais un contenu déjà consommé.
 */
const UNKNOWN_READER_STATE: ViewOnceReaderState = {
  consumedByMe: true,
  isFullyConsumed: false,
  openedCount: 0,
  recipientCount: 0,
};

function isPurged(message: ViewOnceMessageRef): boolean {
  return message.viewOnceBurnedAt instanceof Date;
}

/**
 * Les états d'une PAGE de messages, pour UN lecteur. Aucune requête quand la
 * page ne porte aucune vue unique — `GET …/messages` est la route la plus
 * appelée du gateway.
 *
 * Lève sur une panne de lecture : c'est `loadViewOnceReaderStates` qui décide
 * de l'état fermé pour les lectures, et la route de consommation qui décide de
 * ne rien programmer.
 */
/**
 * Le lecteur : un `Participant.id`, ou — pour une lecture qui traverse
 * plusieurs conversations (`/sync`) — sa ligne DANS chaque conversation.
 */
export type ViewOnceReader =
  | string
  | null
  | undefined
  | ((conversationId: string) => string | null | undefined);

function readerIn(reader: ViewOnceReader, conversationId: string): string | null | undefined {
  return typeof reader === 'function' ? reader(conversationId) : reader;
}

export async function computeViewOnceStates(
  prisma: ViewOnceAudiencePrisma,
  messages: readonly ViewOnceMessageRef[],
  reader: ViewOnceReader,
): Promise<Map<string, ViewOnceReaderState>> {
  const states = new Map<string, ViewOnceReaderState>();
  const viewOnce = messages.filter((message) => message.isViewOnce === true);
  if (viewOnce.length === 0) return states;

  const openings = (await prisma.messageStatusEntry.findMany({
    where: {
      messageId: { in: viewOnce.map((message) => message.id) },
      AND: [{ viewedOnceAt: { isSet: true } }, { viewedOnceAt: { not: null } }],
    },
    select: { messageId: true, participantId: true },
    take: VIEW_ONCE_OPENINGS_SCAN_CAP,
  })) as Array<{ messageId: string; participantId: string }>;

  const candidateIds = [
    ...new Set([...openings.map((entry) => entry.participantId), ...viewOnce.map((message) => message.senderId)]),
  ];
  const activeRows = (await prisma.participant.findMany({
    where: { id: { in: candidateIds }, isActive: true },
    select: { id: true },
    take: candidateIds.length,
  })) as Array<{ id: string }>;
  const active = new Set(activeRows.map((row) => row.id));

  const conversationIds = [...new Set(viewOnce.map((message) => message.conversationId))];
  const activeCounts = new Map(
    await Promise.all(
      conversationIds.map(
        async (conversationId) =>
          [conversationId, await prisma.participant.count({ where: { conversationId, isActive: true } })] as const,
      ),
    ),
  );

  for (const message of viewOnce) {
    const openers = new Set(
      openings.filter((entry) => entry.messageId === message.id).map((entry) => entry.participantId),
    );
    const openedCount = [...openers].filter((id) => id !== message.senderId && active.has(id)).length;
    const members = activeCounts.get(message.conversationId) ?? 0;
    const recipientCount = Math.max(0, members - (active.has(message.senderId) ? 1 : 0));

    const readerParticipantId = readerIn(reader, message.conversationId);
    states.set(message.id, {
      consumedByMe: Boolean(readerParticipantId) && openers.has(readerParticipantId as string),
      isFullyConsumed: isPurged(message) || (recipientCount > 0 && openedCount >= recipientCount),
      openedCount,
      recipientCount,
    });
  }

  return states;
}

/**
 * La variante des LECTURES : une panne rend l'état fermé plutôt que d'emporter
 * la page, qui porte aussi tous les messages ordinaires.
 */
export async function loadViewOnceReaderStates(
  prisma: ViewOnceAudiencePrisma,
  messages: readonly ViewOnceMessageRef[],
  reader: ViewOnceReader,
  onError?: (err: unknown) => void,
): Promise<Map<string, ViewOnceReaderState>> {
  try {
    return await computeViewOnceStates(prisma, messages, reader);
  } catch (err) {
    onError?.(err);
    return new Map(
      messages
        .filter((message) => message.isViewOnce === true)
        .map((message) => [message.id, UNKNOWN_READER_STATE] as const),
    );
  }
}

/** Les champs d'une vue unique que le fil sert à CE lecteur. */
export interface ViewOnceServedFields {
  readonly consumedByMe: boolean;
  readonly isFullyConsumed: boolean;
  readonly viewOnceCount: number;
  readonly maxViewOnceCount: number;
}

/**
 * Projette une vue unique pour son lecteur.
 *
 * - `viewOnceCount` / `maxViewOnceCount` deviennent « destinataires qui ont
 *   ouvert » / « destinataires actifs » : un client qui lit encore
 *   `viewOnceCount ≥ maxViewOnceCount` comme « brûlé » lit désormais « tous les
 *   destinataires l'ont ouvert », et plus jamais « quelqu'un l'a ouvert ».
 * - Pour qui l'a DÉJÀ ouvert : ni texte, ni
 *   traduction, ni pièce jointe, ni lieu, ni sticker, ni métadonnée. Il ne
 *   reste que la bulle (identifiant, auteur, heure, type) et l'état.
 *
 * Un message ordinaire, ou une vue unique sans état résolu, repart intact.
 */
export function projectViewOnceForReader<T extends object>(
  message: T & { readonly id: string; readonly isViewOnce?: boolean | null },
  state: ViewOnceReaderState | undefined,
): T & Partial<ViewOnceServedFields> {
  if (message.isViewOnce !== true || !state) return message;

  const served: T & ViewOnceServedFields = {
    ...message,
    consumedByMe: state.consumedByMe,
    isFullyConsumed: state.isFullyConsumed,
    viewOnceCount: state.openedCount,
    maxViewOnceCount: state.recipientCount,
  };
  // Une vue unique PURGÉE n'a déjà plus de contenu en base : seule
  // l'ouverture du lecteur a besoin d'être retenue ici.
  if (!state.consumedByMe) return served;

  // Seules les clés que la charge PORTE sont retenues : une lecture projetée
  // (`/sync?fields=`) ne se voit pas ajouter ce qu'elle n'a pas demandé.
  const withheld = Object.fromEntries(
    Object.entries(WITHHELD_CONTENT).filter(([key]) => key in message),
  );
  return { ...served, ...withheld };
}

/** Ce qu'une vue unique déjà ouverte ne sert plus à son lecteur. */
const WITHHELD_CONTENT: Readonly<Record<string, unknown>> = {
  content: '',
  translations: [],
  attachments: [],
  encryptedContent: null,
  encryptionMetadata: null,
  metadata: null,
  location: null,
  sticker: null,
};
