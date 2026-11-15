import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { LanguageCache } from './LanguageCache';
import { subscribeConversationLanguageChanges, type ConversationLanguageChange } from './conversationLanguageChanges';

const logger = enhancedLogger.child({ module: 'ConversationLanguages' });

/**
 * Le TTL n'est plus le mécanisme de fraîcheur — les annonces de
 * `conversationLanguageChanges` le sont (#9708). Il reste le FILET : une porte
 * qui n'annonce pas (balayages de maintenance, locale appareil persistée au fil
 * des requêtes) ou une AUTRE instance de la passerelle ne retarde la composition
 * que d'une minute au plus.
 */
export const CONVERSATION_LANGUAGES_TTL_MS = 60_000;

const PARTICIPANT_LANGUAGE_SELECT = {
  id: true,
  displayName: true,
  type: true,
  language: true,
  user: {
    select: {
      id: true,
      username: true,
      systemLanguage: true,
      regionalLanguage: true,
      customDestinationLanguage: true,
      deviceLocale: true,
    },
  },
} as const;

/**
 * Les langues vers lesquelles un message d'une conversation doit partir :
 * TOUTES les langues de ses participants actifs — les quatre rangs du prisme
 * d'un inscrit, la langue de ligne d'un invité. Le retrait de la langue source
 * se fait chez l'appelant.
 */
export class ConversationLanguages {
  private readonly cache = new LanguageCache(CONVERSATION_LANGUAGES_TTL_MS, 100);
  private readonly unsubscribe: () => void;
  /**
   * Avance à chaque invalidation. Une lecture commencée AVANT l'écriture d'une
   * arrivée peut finir APRÈS son annonce : elle ne remplit pas le cache, sans
   * quoi la composition d'avant y serait réinstallée pour un TTL entier.
   */
  private generation = 0;

  constructor(private readonly prisma: Pick<PrismaClient, 'conversation' | 'participant'>) {
    this.unsubscribe = subscribeConversationLanguageChanges((change) => this.forgetFor(change));
  }

  dispose(): void {
    this.unsubscribe();
  }

  private forgetFor(change: ConversationLanguageChange): void {
    this.generation += 1;
    if (change.kind === 'reader-languages') {
      this.cache.clear();
      return;
    }
    this.cache.delete(change.conversationId);
  }

  async of(conversationId: string): Promise<string[]> {
    try {
      const cached = this.cache.get(conversationId);
      if (cached) {
        logger.info(`💾 [LANG-TRACE] Langues depuis cache: [${cached.join(', ')}]`);
        return cached;
      }

      const startTime = Date.now();
      const generation = this.generation;
      const [conversation, participants] = await Promise.all([
        this.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { autoTranslateEnabled: true },
        }),
        this.prisma.participant.findMany({
          where: { conversationId, isActive: true },
          select: PARTICIPANT_LANGUAGE_SELECT,
        }),
      ]);

      if (conversation?.autoTranslateEnabled === false) {
        logger.info(`⛔ [LANG-TRACE] autoTranslateEnabled=false pour ${conversationId} — traduction désactivée`);
        if (generation === this.generation) this.cache.set(conversationId, []);
        return [];
      }

      const languages = Array.from(new Set(participants.flatMap(participantLanguages)));
      if (generation === this.generation) this.cache.set(conversationId, languages);

      logger.info(
        `✅ [LANG-TRACE] Langues extraites en ${Date.now() - startTime}ms: [${languages.join(', ')}] | ` +
        `${participants.length} participant(s)`
      );
      return languages;
    } catch (error) {
      logger.error(`❌ [TranslationService] Erreur extraction langues: ${error}`);
      return ['en', 'fr'];
    }
  }
}

type ParticipantLanguageRow = {
  readonly type: string;
  readonly language: string | null;
  readonly user: {
    readonly systemLanguage: string | null;
    readonly regionalLanguage: string | null;
    readonly customDestinationLanguage: string | null;
    readonly deviceLocale: string | null;
  } | null;
};

/**
 * Un inscrit contribue les quatre rangs de son prisme (SSOT partagée, codes
 * dédoublonnés et normalisés). Un invité ou un bot contribue sa langue de
 * ligne, normalisée de la même façon : elle est stockée sans validation
 * (`'EN'`, `'en-US'`, `'fil-PH'`) et `'fil-PH'` / `'fil'` doivent compter pour
 * UNE cible.
 */
function participantLanguages(participant: ParticipantLanguageRow): string[] {
  if (participant.type === 'user' && participant.user) {
    return resolveUserLanguagesOrdered(participant.user, {
      deviceLocale: participant.user.deviceLocale ?? undefined,
    });
  }
  return participant.language ? [normalizeLanguageForDedup(participant.language)] : [];
}
