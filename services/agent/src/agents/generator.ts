import type { ConversationState, PendingAction, PendingMessage, PendingReaction, MessageDirective, ReactionDirective } from '../graph/state';
import type { LlmProvider, LlmTool } from '../llm/types';

function detectConversationLanguage(state: ConversationState): string {
  const recentMessages = state.messages.slice(-20);
  if (recentMessages.length === 0) return 'fr';
  const languages = recentMessages.map((m) => m.originalLanguage).filter((lang): lang is string => !!lang);
  if (languages.length === 0) return 'fr';
  const freq = new Map<string, number>();
  for (const lang of languages) { freq.set(lang, (freq.get(lang) ?? 0) + 1); }
  let dominant = 'fr';
  let maxCount = 0;
  for (const [lang, count] of freq) { if (count > maxCount) { dominant = lang; maxCount = count; } }
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
  recentTopicCategories: string,
  conversationTitle: string,
  conversationDescription: string,
  agentInstructions: string,
  minWords: number,
  maxWords: number,
  isNewTopic: boolean = false,
  replyToSenderName: string | undefined = undefined,
): string {
  const mentionsText = mentionUsernames.length > 0
    ? `\nMENTIONS: Inclus naturellement ces @mentions: ${mentionUsernames.map((u) => `@${u}`).join(', ')}`
    : '';
  const instructionsText = agentInstructions ? `\nINSTRUCTIONS: ${agentInstructions}` : '';
  const useCatchphrases = profile.catchphrases.length > 0 && Math.random() < 0.35;
  const catchphrasesText = useCatchphrases
    ? `\n- EXPRESSIONS TYPIQUES (utiliser rarement, pas a chaque message): "${profile.catchphrases.join('", "')}"` : '';
  const emojisText = profile.commonEmojis.length > 0
    ? `\n- EMOJIS: ${profile.commonEmojis.join(' ')}` : '';

  const toneGuide = profile.tone === 'familier' || profile.tone === 'enthousiaste'
    ? 'Ecris de maniere decontractee, avec des abreviations et du langage familier.'
    : profile.tone === 'critique' || profile.tone === 'sarcastique'
      ? 'Sois direct, parfois piquant, avec un regard critique.'
      : profile.tone === 'curieux'
        ? 'Pose des questions, montre de la curiosite, explore les idees.'
        : 'Garde un ton naturel et equilibre.';

  const emojiGuide = profile.emojiUsage === 'abondant'
    ? 'Maximum 1-2 emojis, naturellement places.'
    : profile.emojiUsage === 'occasionnel'
      ? 'Maximum 1 emoji, seulement si ca colle.'
      : "Pas d'emojis.";

  // === MODE CHAT (default) vs MODE ELABORE (rare — new topic only) ===
  const modeGuide = isNewTopic
    ? `MODE ELABORE — Tu OUVRES un nouveau sujet ou c'est ta PREMIERE intervention sur ce theme.
Tu peux developper (3-6 phrases). Donne ton avis, une experience, une observation concrete.
Meme en mode elabore, reste CONVERSATIONNEL. Pas de dissertation. Pas de structure formelle.`
    : `MODE CHAT — Tu REAGIS dans un fil existant. C'est du CHAT, pas un article.
MAXIMUM 1-3 phrases. Court, direct, percutant.
Tu PEUX citer le prenom ou @pseudo de la personne a qui tu reponds (mais pas obligatoire).
Exemples de TON ATTENDU:
- "Franchement @Paul t'as raison, sans electricite stable rien ne bouge"
- "En vrai le vrai souci c'est la maintenance, on construit mais on entretient pas"
- "Moi je pense qu'il faut deja regler les routes avant de parler d'industrie"
- "Pas d'accord, le probleme c'est pas l'argent c'est la gestion"
- "C'est exactement ce que je disais! @Marie tu vois?"`;

  const shouldCite = Math.random() < 0.4;
  const replyContext = replyToSenderName && shouldCite
    ? `\nTu REPONDS a ${replyToSenderName}. CITE son prenom dans ta reponse.` : '';

  return `Tu incarnes ${displayName} dans un groupe de chat. Tu es un HUMAIN, pas un assistant.

CONVERSATION: ${conversationTitle || 'Sans titre'}${conversationDescription ? ' — ' + conversationDescription : ''}${instructionsText}

QUI TU ES (${displayName.toUpperCase()}):
- ${profile.personaSummary || 'Personnalite naturelle'}
- Style: ${toneGuide}
- ${emojiGuide}
- Registre: ${profile.vocabularyLevel}${catchphrasesText}${emojisText}

${modeGuide}${replyContext}

SUJET: ${topic}${mentionsText}

=== INTERDIT — PATTERNS IA DETECTABLES ===
- PAS de listes numerotees (1. 2. 3.) ni de listes a puces (-)
- PAS de **gras** markdown ni de formatage
- PAS d'ouvertures enthousiastes ("C'est passionnant!", "Il est enrichissant de voir...", "C'est vraiment un sujet captivant")
- PAS de conclusions motivationnelles ("Ensemble nous pouvons...", "L'avenir est prometteur...")
- PAS de formules creuses ("Voici quelques pistes a considerer", "Il est indeniable que...", "Il existe plusieurs solutions")
- PAS de clusters d'emojis (MAXIMUM 1 emoji par message, en fin de phrase si necessaire)
- PAS de reformulation/paraphrase de ce qui vient d'etre dit
- NE TERMINE PAS par une question ("Qu'en pensez-vous ?", "Et vous ?", "Non ?") sauf RAREMENT si le personnage est naturellement curieux ou nouveau dans la conversation. La plupart des gens affirment, ils ne demandent pas l'avis des autres a chaque message

=== VARIER LES EMOTIONS ===
Ne sois PAS toujours d'accord ou positif. Sois humain:
- Dubitatif: "Hmm je suis pas convaincu que..."
- Agace: "Ca me fatigue de voir toujours les memes erreurs..."
- Blagueur: touche d'humour, ironie legere
- Direct: "Non c'est pas ca le probleme, le vrai souci c'est..."
- Vecu: "Moi j'ai vu ca a Douala, les routes..." (experience personnelle)

ANTI-REPETITION:
- Si tu n'as RIEN de nouveau, reponds "SKIP"
- Sujets recents (interdits): ${recentTopics}
- Categories interdites: ${recentTopicCategories}

REGLES ABSOLUES:
- Tu es ${displayName}. JAMAIS un assistant IA.
- ${minWords}-${maxWords} mots. PAS PLUS.
- LANGUE: "${userLanguage}"
- Ecris comme dans WhatsApp/Telegram — PAS comme un article Wikipedia.

Resume conversation: ${summary}`;
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

  // Determine if this is a new topic introduction or a reply in existing thread
  const isNewTopic = !directive.replyToMessageId && !directive.mentionUsernames.length;

  // MODE CHAT: cap maxWords aggressively (1-3 short sentences = ~50 words max)
  // MODE ELABORE (new topic only): allow moderate length (~120 words max)
  const baseMinWords = directive.minWords ?? state.minWordsPerMessage ?? 3;
  const baseMaxWords = directive.maxWords ?? state.maxWordsPerMessage ?? 400;
  const minWords = isNewTopic ? Math.max(baseMinWords, 15) : baseMinWords;
  const maxWords = isNewTopic ? Math.min(baseMaxWords, 120) : Math.min(baseMaxWords, 50);

  const temperature = state.generationTemperature ?? 0.85;
  const maxTokens = Math.max(64, Math.round(maxWords * 1.5));

  const recentTopicCategoriesText = (state.recentTopicCategories ?? []).length > 0
    ? state.recentTopicCategories.join(', ') : 'aucun';

  // Find the sender name of the message being replied to (for contextual citation)
  const replyToSenderName = directive.replyToMessageId
    ? state.messages.find((m) => m.id === directive.replyToMessageId)?.senderName
    : undefined;

  const systemPrompt = buildGeneratorPrompt(
    user.displayName, profile, directive.topic, conversationContext, state.summary,
    directive.mentionUsernames, userLanguage, recentTopicsText, recentTopicCategoriesText,
    state.conversationTitle, state.conversationDescription, state.agentInstructions,
    minWords, maxWords, isNewTopic, replyToSenderName,
  );

  const useWebSearch = Boolean(directive.needsWebSearch && state.webSearchEnabled);
  const tools: LlmTool[] | undefined = useWebSearch
    ? [{ type: 'web_search_preview', search_context_size: 'medium' }] : undefined;

  try {
    const response = await llm.chat({
      systemPrompt,
      messages: [{
        role: 'user',
        content: `Conversation recente:\n${conversationContext}\n\nReponds en tant que ${user.displayName} sur le sujet: ${directive.topic}`,
      }],
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
      return {
        pendingActions: [],
        _traceInputTokens: 0, _traceOutputTokens: 0, _traceModel: 'skipped', _traceExtra: { skipped: true },
      };
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

    return {
      pendingActions: actions,
      _traceInputTokens: 0,
      _traceOutputTokens: 0,
      _traceModel: 'aggregate',
      _traceExtra: {
        messagesGenerated: actions.filter((a) => a.type === 'message').length,
        reactionsBuilt: actions.filter((a) => a.type === 'reaction').length,
      },
    };
  };
}
