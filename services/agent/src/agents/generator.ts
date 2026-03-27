import type { ConversationState, PendingAction, PendingMessage, PendingReaction, MessageDirective, ReactionDirective } from '../graph/state';
import type { LlmProvider, LlmTool } from '../llm/types';

function detectConversationLanguage(state: ConversationState): string {
  const recentMessages = state.messages.slice(-20);
  if (recentMessages.length === 0) return 'fr';

  const languages = recentMessages
    .map((m) => m.originalLanguage)
    .filter((lang): lang is string => !!lang);

  if (languages.length === 0) return 'fr';

  const freq = new Map<string, number>();
  for (const lang of languages) {
    freq.set(lang, (freq.get(lang) ?? 0) + 1);
  }
  let dominant = 'fr';
  let maxCount = 0;
  for (const [lang, count] of freq) {
    if (count > maxCount) {
      dominant = lang;
      maxCount = count;
    }
  }
  return dominant;
}

function buildGeneratorPrompt(
  displayName: string,
  profile: { personaSummary: string; tone: string; vocabularyLevel: string; typicalLength: string; emojiUsage: string; topicsOfExpertise: string[]; catchphrases: string[]; commonEmojis: string[] },
  topic: string,
  conversationContext: string,
  summary: string,
  mentionUsernames: string[],
  userLanguage: string,
  recentTopics: string,
  conversationTitle: string,
  conversationDescription: string,
  agentInstructions: string,
  minWords: number,
  maxWords: number,
): string {
  const mentionsText = mentionUsernames.length > 0
    ? `\nMENTIONS: Inclus naturellement ces @mentions dans ta reponse: ${mentionUsernames.map((u) => `@${u}`).join(', ')}`
    : '';

  const instructionsText = agentInstructions
    ? `\nINSTRUCTIONS: ${agentInstructions}`
    : '';

  const catchphrasesText = profile.catchphrases.length > 0
    ? `\n- EXPRESSIONS OBLIGATOIRES (utilise au moins une): "${profile.catchphrases.join('", "')}"`
    : '';

  const emojisText = profile.commonEmojis.length > 0
    ? `\n- EMOJIS SPECIFIQUES a utiliser: ${profile.commonEmojis.join(' ')}`
    : '';

  const toneGuide = profile.tone === 'familier' || profile.tone === 'enthousiaste'
    ? 'Ecris de maniere decontractee, avec des abreviations et du langage familier.'
    : profile.tone === 'critique' || profile.tone === 'sarcastique'
      ? 'Sois direct, parfois piquant, avec un regard critique.'
      : profile.tone === 'curieux'
        ? 'Pose des questions, montre de la curiosite, explore les idees.'
        : 'Garde un ton naturel et equilibre.';

  const lengthGuide = profile.typicalLength === 'court'
    ? 'Ecris des reponses COURTES et DIRECTES (1-3 phrases max). Pas de blabla.'
    : profile.typicalLength === 'long'
      ? 'Developpe tes idees en detail, avec des exemples et des nuances.'
      : 'Ecris des reponses de longueur moyenne, ni trop courtes ni trop longues.';

  const emojiGuide = profile.emojiUsage === 'abondant'
    ? 'Utilise BEAUCOUP d\'emojis dans ton message (3-5 minimum).'
    : profile.emojiUsage === 'occasionnel'
      ? 'Insere 1-2 emojis de maniere naturelle.'
      : 'N\'utilise PAS d\'emojis du tout.';

  return `Tu incarnes ${displayName} dans une conversation de groupe. Tu n'es PAS un assistant, tu es un HUMAIN avec une personnalite propre.

CONTEXTE DE LA CONVERSATION:
- Titre: ${conversationTitle || 'Sans titre'}
- Description: ${conversationDescription || 'Aucune'}${instructionsText}

PERSONNALITE DE ${displayName.toUpperCase()} (A RESPECTER STRICTEMENT):
- Description: ${profile.personaSummary || 'Personnalite naturelle'}
- Style: ${toneGuide}
- Longueur: ${lengthGuide}
- Emojis: ${emojiGuide}
- Registre de langue: ${profile.vocabularyLevel} (${profile.vocabularyLevel === 'familier' ? 'utilise du slang, des abreviations, "mdr", "ptdr", "tkt"' : profile.vocabularyLevel === 'soutenu' ? 'utilise un vocabulaire riche et des tournures elegantes' : 'registre standard, naturel'})
- Sujets maitrises: ${profile.topicsOfExpertise.join(', ') || 'generaux'}${catchphrasesText}${emojisText}

SUJET A ABORDER: ${topic}${mentionsText}

ANTI-REPETITION:
- NE repete PAS les memes idees ou formulations que tu as deja utilisees
- Si tu n'as RIEN de nouveau a dire, reponds exactement "SKIP"
- Sujets deja abordes recemment: ${recentTopics}

REGLES ABSOLUES:
- Tu es ${displayName}. JAMAIS un assistant IA.
- Ta reponse DOIT faire entre ${minWords} et ${maxWords} mots. PAS PLUS.
- ${lengthGuide}
- Ne revele jamais que tu es un agent IA.
- LANGUE: Tu DOIS repondre en "${userLanguage}".
- EVITE les salutations sauf si c'est ta toute premiere intervention de la section de journee.
- Ecris EXACTEMENT comme ${displayName} ecrirait — pas comme un chatbot.

Resume: ${summary}`;
}

async function generateMessage(
  llm: LlmProvider,
  state: ConversationState,
  directive: MessageDirective,
): Promise<PendingMessage | null> {
  const user = state.controlledUsers.find((u) => u.userId === directive.asUserId);
  if (!user) return null;

  const userLanguage = user.systemLanguage || detectConversationLanguage(state);

  const windowSize = state.useFullHistory ? 250 : (state.contextWindowSize ?? 50);
  const conversationContext = state.messages
    .slice(-windowSize)
    .map((m) => `[${m.senderName}]: ${m.content}`)
    .join('\n');

  const profile = user.role;
  const userHistory = (state.agentHistory ?? [])
    .filter((h) => h.userId === directive.asUserId)
    .slice(-5)
    .map((h) => h.topic)
    .filter(Boolean);
  const recentTopicsText = userHistory.length > 0 ? userHistory.join(', ') : 'aucun';

  const minWords = directive.minWords ?? state.minWordsPerMessage ?? 3;
  const maxWords = directive.maxWords ?? state.maxWordsPerMessage ?? 400;
  const temperature = state.generationTemperature ?? 0.8;
  const maxTokens = Math.max(64, Math.round(maxWords * 1.5));

  const systemPrompt = buildGeneratorPrompt(
    user.displayName,
    profile,
    directive.topic,
    conversationContext,
    state.summary,
    directive.mentionUsernames,
    userLanguage,
    recentTopicsText,
    state.conversationTitle,
    state.conversationDescription,
    state.agentInstructions,
    minWords,
    maxWords,
  );

  const useWebSearch = Boolean(directive.needsWebSearch && state.webSearchEnabled);
  const tools: LlmTool[] | undefined = useWebSearch
    ? [{ type: 'web_search_preview', search_context_size: 'medium' }]
    : undefined;

  try {
    const response = await llm.chat({
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Conversation recente:\n${conversationContext}\n\nReponds en tant que ${user.displayName} sur le sujet: ${directive.topic}`,
        },
      ],
      temperature,
      maxTokens: useWebSearch ? Math.max(maxTokens, 512) : maxTokens,
      tools,
    });

    const content = response.content.trim();
    if (!content || content === 'SKIP') return null;

    return {
      type: 'message',
      asUserId: directive.asUserId,
      content,
      originalLanguage: userLanguage,
      replyToId: directive.replyToMessageId,
      mentionedUsernames: directive.mentionUsernames,
      delaySeconds: directive.delaySeconds,
      messageSource: 'agent',
    };
  } catch (error) {
    console.error(`[Generator] Error generating message for user ${directive.asUserId}:`, error);
    return null;
  }
}

function buildReaction(directive: ReactionDirective): PendingReaction {
  return {
    type: 'reaction',
    asUserId: directive.asUserId,
    targetMessageId: directive.targetMessageId,
    emoji: directive.emoji,
    delaySeconds: directive.delaySeconds,
  };
}

export function createGeneratorNode(llm: LlmProvider) {
  return async function generator(state: ConversationState) {
    const plan = state.interventionPlan;
    if (!plan?.shouldIntervene || plan.interventions.length === 0) {
      return { pendingActions: [] };
    }

    const actions: PendingAction[] = [];

    for (const directive of plan.interventions) {
      if (directive.type === 'message') {
        const message = await generateMessage(llm, state, directive);
        if (message) actions.push(message);
      } else if (directive.type === 'reaction') {
        actions.push(buildReaction(directive));
      }
    }

    console.log(`[Generator] Produced ${actions.length} actions (${actions.filter((a) => a.type === 'message').length} messages, ${actions.filter((a) => a.type === 'reaction').length} reactions)`);

    return { pendingActions: actions };
  };
}
