import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { contentExitLaw } from '@meeshy/shared/utils/content-exit-law';
import { SUPPORTED_LANGUAGE_CODES } from '@meeshy/shared/utils/language-codes';
import { normalizeLanguageCode, normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, applyHistoryFloor, loadHistoryFloorsFor } from '../historyFloor';
import { subscribeConversationLanguageChanges } from './conversationLanguageChanges';

const logger = enhancedLogger.child({ module: 'ArrivalHistoryBackfill' });

/**
 * Combien de messages récents une langue nouvelle reçoit traduits (#9709).
 *
 * La première page d'un fil sert 20 messages (`messages-reads.ts`,
 * `defaultLimit: 20`) ; 50 couvrent cette page et les deux défilements qui la
 * suivent — ce qu'un invité lit en arrivant, l'hôte ayant écrit AVANT d'envoyer
 * le lien. Au-delà, un message plus ancien se traduit à la demande
 * (`message:request-translation`). Le coût est borné : au plus 50 requêtes au
 * traducteur par langue nouvelle et par conversation.
 */
export const ARRIVAL_BACKFILL_DEPTH = 50;

/**
 * Au-delà, la conversation n'est pas rattrapée : le plancher d'historique de
 * CHAQUE participant actif doit être lu (voir `historyFloorFor` ci-dessous), et
 * le salon global en compte des milliers. Une conversation de cette taille a de
 * toute façon déjà ses grandes langues.
 */
export const ARRIVAL_BACKFILL_MAX_PARTICIPANTS = 500;

/** Une seconde arrivée de la même langue ne relance rien pendant cette fenêtre. */
export const ARRIVAL_BACKFILL_COOLDOWN_MS = 10 * 60 * 1000;
/**
 * Langues DISTINCTES rattrapées par conversation et par fenêtre. La langue d'un
 * invité vient du corps de sa requête : sans budget, une suite d'entrées par
 * lien sous des langues différentes ferait chacune 50 requêtes au traducteur.
 */
export const ARRIVAL_BACKFILL_LANGUAGES_PER_WINDOW = 3;
const COOLDOWN_MAX_ENTRIES = 1000;

const CATALOG = new Set<string>(SUPPORTED_LANGUAGE_CODES.map((code) => code.toLowerCase()));

/** Une langue du CATALOGUE, canonique — ou rien : un code inconnu ne se rattrape pas. */
const catalogLanguage = (raw: string | null | undefined): string | null => {
  const code = normalizeLanguageCode(raw);
  return code && CATALOG.has(code) ? code : null;
};

const { EPHEMERAL, BLURRED, VIEW_ONCE, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;
const PROTECTION_FLAGS = EPHEMERAL | BLURRED | VIEW_ONCE | EPHEMERAL_AFTER_READ;

const PROTECTION_SELECT = { isViewOnce: true, isBlurred: true, effectFlags: true } as const;

const CANDIDATE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  originalLanguage: true,
  translations: true,
  deletedAt: true,
  ...PROTECTION_SELECT,
  ephemeralDuration: true,
  expiresAt: true,
  isEncrypted: true,
  encryptionMode: true,
  attachments: { select: PROTECTION_SELECT },
} as const;

export type BackfillMessage = {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string | null;
  readonly content: string;
  readonly originalLanguage: string;
};

type ProtectionFlags = {
  readonly isViewOnce: boolean | null;
  readonly isBlurred: boolean | null;
  readonly effectFlags: number | null;
};

type Candidate = BackfillMessage & ProtectionFlags & {
  readonly translations: unknown;
  readonly deletedAt: Date | null;
  readonly ephemeralDuration: number | null;
  readonly expiresAt: Date | null;
  readonly isEncrypted: boolean | null;
  readonly encryptionMode: string | null;
  readonly attachments: ReadonlyArray<ProtectionFlags>;
};

export type ArrivalBackfillDeps = {
  readonly prisma: Pick<PrismaClient, 'conversation' | 'participant' | 'message' | 'conversationShareLink'>;
  /** Le pipeline EXISTANT (ZMQ → traducteur → `translationReady` → `message:translation`). */
  readonly translate: (message: BackfillMessage, targetLanguage: string) => Promise<unknown>;
};

export type ArrivalBackfillInput = {
  readonly conversationId: string;
  readonly language: string;
  /** Les messages écrits APRÈS l'arrivée partent déjà vers la langue par le chemin d'envoi. */
  readonly arrivedAt: Date;
};

const isBlurred = (carrier: ProtectionFlags): boolean =>
  carrier.isBlurred === true || ((carrier.effectFlags ?? 0) & BLURRED) !== 0;

/**
 * FAIL-CLOSED : un message part vers une langue nouvelle seulement si RIEN ne le
 * protège. Vue unique, flamme (durée, échéance, après lecture) et leurs drapeaux
 * se lisent par la loi partagée (`contentExitLaw`), message ET pièces jointes ;
 * le flou et le chiffrement, qui n'en sont pas des natures, se lisent à côté.
 * Un message chiffré de bout en bout n'a pas de clair côté serveur ; un message
 * chiffré par le serveur n'est pas rattrapé non plus — le doute ferme.
 */
function mayReachNewReader(message: Candidate): boolean {
  if (message.deletedAt != null) return false;
  if (message.isEncrypted !== false || message.encryptionMode != null) return false;
  if (message.isViewOnce !== false || message.isBlurred !== false) return false;
  if (((message.effectFlags ?? 0) & PROTECTION_FLAGS) !== 0) return false;
  if (isBlurred(message) || message.attachments.some(isBlurred)) return false;
  if (contentExitLaw(message).nature !== 'ordinary') return false;
  return typeof message.content === 'string' && message.content.trim().length > 0;
}

function lacksLanguage(message: Candidate, language: string): boolean {
  const source = message.originalLanguage && message.originalLanguage !== 'auto'
    ? normalizeLanguageForDedup(message.originalLanguage)
    : null;
  if (source === language) return false;
  const translations = message.translations && typeof message.translations === 'object'
    ? Object.keys(message.translations as Record<string, unknown>)
    : [];
  return !translations.some((key) => normalizeLanguageForDedup(key) === language);
}

/**
 * Le plancher COMMUN à toute la room : le plus récent des planchers de ses
 * participants actifs. Une traduction se diffuse à la room entière
 * (`_handleTextTranslationReady`) : traduire un message qu'UN de ses membres n'a
 * pas le droit de lire le lui pousserait. L'arrivant y compris — un invité sans
 * historique a pour plancher son arrivée, donc rien n'est rattrapé pour lui.
 *
 * `undefined` : trop de participants pour lire leurs planchers — rien n'est fait.
 */
async function commonHistoryFloor(
  prisma: ArrivalBackfillDeps['prisma'],
  conversationId: string,
): Promise<Date | null | undefined> {
  const participants = await prisma.participant.findMany({
    where: { conversationId, isActive: true },
    select: HISTORY_FLOOR_PARTICIPANT_SELECT,
    take: ARRIVAL_BACKFILL_MAX_PARTICIPANTS + 1,
  });
  if (participants.length > ARRIVAL_BACKFILL_MAX_PARTICIPANTS) return undefined;

  const floors = await loadHistoryFloorsFor(prisma, participants);
  return floors.reduce<Date | null>(
    (latest, floor) => (floor && (!latest || floor > latest) ? floor : latest),
    null,
  );
}

/**
 * Traduit vers `language` les messages texte récents qui ne l'ont pas encore —
 * l'invité arrivé APRÈS que l'hôte a écrit lit le fil dans sa langue (#9709).
 * Rend les identifiants des messages envoyés au traducteur.
 */
export async function backfillHistoryForArrival(
  deps: ArrivalBackfillDeps,
  input: ArrivalBackfillInput,
): Promise<readonly string[]> {
  const language = catalogLanguage(input.language);
  if (!language) return [];

  const conversation = await deps.prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { autoTranslateEnabled: true, encryptionMode: true },
  });
  if (!conversation || conversation.autoTranslateEnabled === false || conversation.encryptionMode != null) return [];

  const floor = await commonHistoryFloor(deps.prisma, input.conversationId);
  if (floor === undefined) return [];
  if (floor !== null && floor >= input.arrivedAt) return [];

  const recent = (await deps.prisma.message.findMany({
    where: applyHistoryFloor(
      {
        conversationId: input.conversationId,
        messageType: 'text',
        createdAt: { lt: input.arrivedAt },
        // Défense en profondeur — `mayReachNewReader` rejuge chaque ligne.
        // Les colonnes à défaut sont écrites à chaque création : une ligne qui
        // ne les porte pas n'est pas lue (fail-closed). Les colonnes FACULTATIVES
        // peuvent être ABSENTES du document, que `null` seul n'apparie pas.
        isViewOnce: false,
        isBlurred: false,
        isEncrypted: false,
        AND: [
          { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { isSet: false } }] },
          { OR: [{ encryptionMode: null }, { encryptionMode: { isSet: false } }] },
        ],
      },
      floor,
    ),
    orderBy: { createdAt: 'desc' },
    take: ARRIVAL_BACKFILL_DEPTH,
    select: CANDIDATE_SELECT,
  })) as unknown as readonly Candidate[];

  const due = recent.filter((message) => mayReachNewReader(message) && lacksLanguage(message, language));

  const dispatched: string[] = [];
  for (const message of due) {
    try {
      await deps.translate(
        {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          originalLanguage: message.originalLanguage,
        },
        language,
      );
      dispatched.push(message.id);
    } catch (error) {
      logger.warn('arrival backfill: one message not dispatched', { messageId: message.id, error });
    }
  }

  logger.info('arrival backfill dispatched', {
    conversationId: input.conversationId,
    language,
    dispatched: dispatched.length,
  });
  return dispatched;
}

/**
 * Écoute les ARRIVÉES annoncées et lance le rattrapage, hors du chemin de la
 * requête qui a fait entrer le participant. Une même langue arrivant deux fois
 * de suite dans une conversation ne relance rien pendant
 * `ARRIVAL_BACKFILL_COOLDOWN_MS` — les messages en vol n'ont pas encore leur
 * traduction en base, et la redemander doublerait le travail du traducteur.
 */
export class ArrivalHistoryBackfill {
  private readonly recent = new Map<string, number>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly deps: ArrivalBackfillDeps,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.unsubscribe = subscribeConversationLanguageChanges((change) => {
      if (change.kind === 'arrival') this.schedule(change.conversationId, change.language);
    });
  }

  dispose(): void {
    this.unsubscribe();
  }

  private schedule(conversationId: string, rawLanguage: string | null | undefined): void {
    const language = catalogLanguage(rawLanguage);
    if (!language) return;

    const arrivedAt = this.now();
    const key = `${conversationId}::${language}`;
    const last = this.recent.get(key);
    if (last !== undefined && arrivedAt.getTime() - last < ARRIVAL_BACKFILL_COOLDOWN_MS) return;
    if (this.languagesInWindow(conversationId, arrivedAt.getTime()) >= ARRIVAL_BACKFILL_LANGUAGES_PER_WINDOW) {
      logger.warn('arrival backfill budget reached for this conversation', { conversationId, language });
      return;
    }
    this.remember(key, arrivedAt.getTime());

    backfillHistoryForArrival(this.deps, { conversationId, language, arrivedAt }).catch((error: unknown) => {
      this.recent.delete(key);
      logger.warn('arrival backfill failed — nothing translated', { conversationId, language, error });
    });
  }

  private languagesInWindow(conversationId: string, at: number): number {
    const prefix = `${conversationId}::`;
    return [...this.recent].filter(([key, ts]) => key.startsWith(prefix) && at - ts < ARRIVAL_BACKFILL_COOLDOWN_MS).length;
  }

  private remember(key: string, at: number): void {
    if (this.recent.size >= COOLDOWN_MAX_ENTRIES) {
      for (const [entry, ts] of this.recent) {
        if (at - ts >= ARRIVAL_BACKFILL_COOLDOWN_MS) this.recent.delete(entry);
      }
      if (this.recent.size >= COOLDOWN_MAX_ENTRIES) {
        const oldest = this.recent.keys().next().value;
        if (oldest !== undefined) this.recent.delete(oldest);
      }
    }
    this.recent.delete(key);
    this.recent.set(key, at);
  }
}
