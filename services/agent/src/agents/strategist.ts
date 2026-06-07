import crypto from 'node:crypto';
import Mustache from 'mustache';
import type { ConversationState, InterventionPlan, InterventionDirective, ReactionDirective, ControlledUser } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import { parseJsonLlm } from '../utils/parse-json-llm';
import { getArchetype } from '@meeshy/shared/agent/archetypes';
import { resolveDelaySeconds } from '../delivery/delay-resolver';
import type { TopicCatalogEntry } from '../topics/types';
import type { TopicCatalogService } from '../topics/TopicCatalogService';
import type { TopicUsageService } from '../topics/TopicUsageService';

const STRATEGIST_SYSTEM_PROMPT = `Tu es l'orchestrateur d'une communaute de messagerie. Analyse cette conversation et decide quelles interventions sont naturelles.

CONTEXTE:
- Messages recents: {messages}
- Utilisateurs inactifs disponibles: {inactiveUsers}
- Score d'activite conversation: {activityScore} (0 = morte, 1 = tres active)
- Participants actuels: {participants}

CONTEXTE DE LA CONVERSATION:
- Titre: {conversationTitle}
- Description: {conversationDescription}
{agentInstructions}

SUJET ACTUEL DE LA CONVERSATION:
{currentTopic}

THEME DETECTE: {detectedTheme}
{topicProvocation}

DONNEES D'ENGAGEMENT (interventions les plus appreciees):
{engagementData}

===== STRATEGIE D'INTERVENTION (PRIORITES) =====

REGLE FONDAMENTALE — REAGIR D'ABORD, CREER ENSUITE:
1. PRIORITE 1 — REPONDRE: Si des messages recents de VRAIS utilisateurs n'ont pas recu de reponse, reponds-y. Utilise replyToMessageId OBLIGATOIREMENT.
2. PRIORITE 2 — REAGIR: Mets des reactions (emojis) sur des messages interessants non encore reagis par les agents.
3. PRIORITE 3 — RELANCER: SEULEMENT si la conversation est morte depuis 30+ min sans message, tu peux lancer un NOUVEAU sujet.
   - Ce nouveau sujet doit etre LIE au sujet actuel de la conversation ou aux interets des participants.
   - NE lance JAMAIS un sujet hors-contexte (ex: parler d'agriculture dans un debat sur la tech).

CHAQUE intervention "message" DOIT:
- Avoir un replyToMessageId (sauf si la conversation est morte depuis 30+ min)
- Etre pertinente par rapport au sujet EN COURS dans la conversation
- Apporter une valeur ajoutee (opinion, question, experience, information)
- NE PAS repeter ou paraphraser ce qui a deja ete dit

DECIDE:
1. La conversation a-t-elle besoin d'activite ? (oui/non + raison)
2. Si oui, combien d'interventions ? (entre {minResponses} et {maxResponses})
3. Pour chaque intervention, specifie :
   - type: "message" ou "reaction"
   - Si message: asUserId, topic (sujet a aborder), replyToMessageId (OBLIGATOIRE sauf conversation morte), mentionUsernames (liste @username)
   - Si reaction: asUserId, targetMessageId, emoji
   - delayCategory: "immediate" (reponse directe), "short" (10-60min), "medium" (1-6h, contribution spontanee), "long" (6-24h, sujet de fond)
   - topicCategory: categorie courte du sujet (ex: "sport", "politique", "meteo", "humour", "tech", "culture")
4. Les interventions doivent etre NATURELLES et VARIEES
5. Ne fais PAS intervenir le meme utilisateur plus de 2 fois
6. Les reactions doivent utiliser des emojis courants et pertinents au message cible
7. Choisis les utilisateurs dont le profil et les sujets d'expertise correspondent au debat EN COURS
8. Pour chaque intervention "message", indique "needsWebSearch": true/false et "searchHint": string|null
   - needsWebSearch: true si la reponse serait enrichie par des informations recentes, des faits verifiables, ou du contexte externe
   - searchHint: si needsWebSearch est true, une requete de recherche suggeree (ex: "resultats ligue 1 avril 2026")
   - false pour conversations purement sociales ou emotionnelles

HISTORIQUE DES INTERVENTIONS RECENTES (NE PAS REPETER):
{agentHistory}

SUJETS RECEMMENT ABORDES PAR LES AGENTS (INTERDITS - trouver un angle COMPLETEMENT different):
{recentTopicCategories}

ACTIONS DEJA PROGRAMMEES (NE PAS CREER DE DOUBLONS):
{scheduledActions}
- Si une action est deja programmee pour un utilisateur sur un sujet, NE PAS creer une nouvelle action sur le meme sujet
- Privilegier des sujets DIFFERENTS de ceux deja programmes

REGLES ANTI-REPETITION:
- Ne propose JAMAIS un sujet, une idee ou une information deja aborde dans les messages recents ou l'historique des interventions.
- Ne repete PAS ce que les autres participants viennent de dire (pas d'echo, pas de paraphrase inutile).
- Varie les utilisateurs qui interviennent pour eviter une presence trop marquee du meme agent.
- Si aucun sujet frais ou angle d'approche nouveau n'est disponible, retourne shouldIntervene: false.
- Favorise les reactions aux messages recents plutot que de nouveaux messages s'il n'y a rien de nouveau a apporter au debat.
- Maximum 1 intervention par utilisateur si la conversation est peu active.
- Les sujets listes dans "SUJETS RECEMMENT ABORDES" sont STRICTEMENT INTERDITS. Choisis un sujet dans un DOMAINE COMPLETEMENT DIFFERENT.

BUDGET QUOTIDIEN:
- Il reste {budgetRemaining} messages autorise(s) aujourd'hui pour cette conversation
- {todayUsersActive} utilisateurs ont deja parle aujourd'hui (max: {maxUsersToday})
- NE DEPASSE PAS le budget restant ({budgetRemaining} messages max)
- Favorise les utilisateurs qui n'ont PAS encore parle aujourd'hui

ROTATION UTILISATEURS:
- Poids 3x pour les utilisateurs qui n'ont pas parle aujourd'hui
- Les utilisateurs dont les messages ont recu des reactions parlent {reactionBoostFactor}x plus souvent
- Si un utilisateur est @mentionne dans un message recent: il DOIT intervenir (priorite absolue)
- Si un message recent est une reponse a un message d'un utilisateur inactif: il DOIT reagir
- INTERDIT de faire intervenir {todayActiveUserNames} s'il reste des utilisateurs qui n'ont PAS encore parle
- VARIE les utilisateurs: ne choisis PAS toujours le meme. Chaque cycle DOIT utiliser un utilisateur DIFFERENT du precedent
- DERNIER UTILISATEUR AGENT: {lastAgentUserId}. Il est INTERDIT de le reutiliser s'il existe d'autres utilisateurs disponibles

UTILISATEURS AYANT DEJA PARLE AUJOURD'HUI: {todayActiveUserNames}

REGLES ANTI-SALUTATION:
- Une salutation (bonjour, salut, hello, coucou) n'est acceptable QUE pour la PREMIERE intervention d'une section de journee (matin, apres-midi, soir)
- Si l'historique montre une salutation dans les 4 dernieres heures: AUCUNE nouvelle salutation
- Si des utilisateurs agents ont DEJA parle recemment: va droit au sujet, pas de salutation
- Prefere des messages de CONTENU (reactions au sujet, questions, partage d'experience)

MODE BURST (si actif):
- Genere exactement {burstSize} interventions avec des delais courts (30-180s entre chaque)
- Les interventions doivent former un echange naturel (question/reponse, reactions)
- Utilise au moins 2 utilisateurs differents dans le burst

STRATEGIE DE DISTRIBUTION TEMPORELLE:
- Produis un MIX de delayCategory: pas uniquement "immediate"
- Si la conversation est active (score > 0.4): majorite "immediate"/"short"
- Si la conversation est calme (score <= 0.4): majorite "medium"/"long" pour simuler un retour naturel
- Assure au moins 1 action "medium" ou "long" si le budget le permet, pour garantir de l'activite future

IMPORTANT:
- Analyse semantique pure. Fonctionne en TOUTES langues.
- Ne reponds PAS si l'activite est deja suffisante (score > 0.7)
- Varie les types d'interventions (mix messages + reactions)
- REPONDRE aux vrais utilisateurs > REAGIR > LANCER un nouveau sujet

REPONSE JSON STRICTE (aucun texte autour):
{
  "shouldIntervene": boolean,
  "reason": "string",
  "currentConversationTopic": "string",
  "interventions": [
    {
      "type": "message",
      "asUserId": "string",
      "topic": "string",
      "topicCategory": "string",
      "replyToMessageId": "string | null",
      "mentionUsernames": ["string"],
      "delayCategory": "immediate | short | medium | long",
      "needsWebSearch": boolean,
      "searchHint": "string | null"
    },
    {
      "type": "reaction",
      "asUserId": "string",
      "targetMessageId": "string",
      "emoji": "string",
      "delayCategory": "immediate | short | medium | long",
      "topicCategory": "string"
    }
  ]
}`;

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Default probability when AgentConfig.freshTopicProbability isn't set. The
// per-conversation override comes from `state.freshTopicProbability` and is
// the source of truth at runtime.
const DEFAULT_TOPIC_PROVOCATION_PROBABILITY = 0.20;

/**
 * Effective probability that the strategist provokes a fresh topic this cycle.
 * The Animator's job is to revive dead conversations, so the probability rises
 * as human activity falls: a dead conversation (activityScore=0) almost always
 * provokes, while the admin's `freshTopicProbability` acts as a floor so a high
 * manual setting is never lowered by activity. Bounded to [0, 1].
 */
export function computeProvocationProbability(
  freshTopicProbability: number,
  activityScore: number,
): number {
  const inactivityBoost = 1 - Math.max(0, Math.min(1, activityScore));
  return Math.max(0, Math.min(1, Math.max(freshTopicProbability, inactivityBoost)));
}

export type ProvocationHint = { instruction: string; searchHint: string; topicCategory: string };

/**
 * Construit le haystack utilisé pour le scoring regex. Concatène titre +
 * description + agent instructions + 30 derniers messages.
 */
function buildHaystack(state: ConversationState): string {
  return [
    state.conversationTitle ?? '',
    state.conversationDescription ?? '',
    state.agentInstructions ?? '',
    ...state.messages.slice(-30).map((m) => m.content),
  ].join(' ').toLowerCase();
}

function countMatches(regexes: RegExp[], haystack: string): number {
  let total = 0;
  for (const r of regexes) {
    const flags = r.flags.includes('g') ? r.flags : r.flags + 'g';
    const matches = haystack.match(new RegExp(r.source, flags)) ?? [];
    total += matches.length;
  }
  return total;
}

/**
 * Sélectionne le topic à provoquer : top-3 par score regex puis random parmi
 * ce top pour éviter le déterminisme. Retourne null si liste vide.
 */
export function selectProvocationTopic(
  eligible: TopicCatalogEntry[],
  compiledPatterns: Map<string, RegExp[]>,
  haystack: string,
): TopicCatalogEntry | null {
  if (eligible.length === 0) return null;
  const scored = eligible.map((t) => ({
    topic: t,
    score: countMatches(compiledPatterns.get(t.id) ?? [], haystack),
  }));
  const sorted = scored.sort((a, b) => b.score - a.score);
  const pool = sorted.slice(0, Math.min(3, sorted.length));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick.topic;
}

export function renderProvocationHint(
  topic: TopicCatalogEntry,
  ctx: { conversationTitle: string; conversationDescription: string },
): ProvocationHint {
  const renderCtx = {
    label: topic.label,
    conversationTitle: ctx.conversationTitle,
    conversationDescription: ctx.conversationDescription,
  };
  return {
    instruction: Mustache.render(topic.instructionTemplate, renderCtx),
    searchHint: Mustache.render(topic.searchHintTemplate, renderCtx),
    topicCategory: topic.slug,
  };
}

function buildProvocationBlock(
  hint: ProvocationHint,
  budgetRemaining: number,
  burstSize: number,
  activityScore: number,
): string {
  // Dead/calm conversation: the Animator should impersonate SEVERAL users to
  // spin up a real exchange, not drop a single lonely message. Active enough
  // conversations keep the lighter single-message provocation.
  const burstCount = Math.max(2, Math.min(burstSize, budgetRemaining));
  const animate = activityScore < 0.3 && budgetRemaining >= 2 && burstCount >= 2;

  if (animate) {
    return [
      '',
      '===== RELANCE DE CONVERSATION MORTE (ANIMATION MULTI-UTILISATEURS) =====',
      hint.instruction,
      '',
      'CONTRAINTES:',
      `- La conversation est MORTE/CALME (score ${activityScore.toFixed(2)}). AJOUTE ${burstCount} interventions "message" formant un ECHANGE NATUREL sur ce nouveau sujet (dans la limite du budget restant ${budgetRemaining}).`,
      `- Utilise AU MOINS 2 utilisateurs DIFFERENTS — l'un lance le sujet, les autres rebondissent (question → avis → relance), comme une vraie discussion.`,
      '- Le PREMIER message ouvre le sujet (replyToMessageId: null, needsWebSearch: true).',
      '- Les messages SUIVANTS se repondent entre eux (replyToMessageId pointant vers le message agent precedent du burst) et n\'ont PAS besoin de web search.',
      `- searchHint du premier message, base de requete: "${hint.searchHint}" (raffine selon le contexte et la date)`,
      `- topicCategory: "${hint.topicCategory}" pour tout le burst`,
      '- delayCategory: "short" ou "medium" avec des delais croissants pour simuler un echange etale dans le temps (jamais tout "immediate").',
      '- Le sujet doit etre NEUF (pas dans agentHistory, pas dans recentTopicCategories).',
      '',
    ].join('\n');
  }

  return [
    '',
    '===== PROVOCATION DE NOUVEAU SUJET (DECLENCHE) =====',
    hint.instruction,
    '',
    'CONTRAINTES:',
    `- AJOUTE OBLIGATOIREMENT 1 intervention "message" de type provocation (en plus des reponses habituelles, dans la limite du budget restant ${budgetRemaining}).`,
    '- Cette intervention DOIT avoir needsWebSearch: true',
    `- searchHint OBLIGATOIRE, base de requete: "${hint.searchHint}" (raffine en fonction du contexte de conversation et de la date)`,
    `- topicCategory: "${hint.topicCategory}"`,
    '- delayCategory: "short" ou "medium" (jamais "immediate" pour eviter de couper une discussion en cours)',
    '- replyToMessageId: null (c\'est un nouveau sujet, pas une reponse)',
    '- Le sujet doit etre NEUF (pas dans agentHistory, pas dans recentTopicCategories)',
    '- Si le budget restant est 0, NE PAS forcer cette provocation',
    '- Choisis un utilisateur dont les topicsOfExpertise matchent le theme',
    '',
  ].join('\n');
}

function buildStrategistPrompt(
  state: ConversationState,
  minResponses: number,
  maxResponses: number,
  maxReactions: number,
  reactionsEnabled: boolean,
  detectedTheme: string,
  provocationHint: ProvocationHint | null,
): string {
  const windowSize = state.useFullHistory ? 250 : (state.contextWindowSize ?? 50);
  const recentMessages = state.messages.slice(-windowSize);

  const messagesText = recentMessages
    .map((m) => `[${m.senderName} (${m.senderId})]: ${m.content} (id: ${m.id})`)
    .join('\n');

  const shuffledUsers = shuffleArray(state.controlledUsers);
  const todayActiveSet = new Set(state.todayActiveUserIds ?? []);

  const inactiveUsersText = shuffledUsers
    .map((u) => {
      const p = u.role;
      const spokeToday = todayActiveSet.has(u.userId) ? ' [A DEJA PARLE AUJOURD\'HUI]' : ' [N\'A PAS ENCORE PARLE]';
      return `- ${u.displayName} (id: ${u.userId})${spokeToday}: ${p.personaSummary ?? 'aucun profil'}. Ton: ${p.tone}. Sujets: ${p.topicsOfExpertise.join(', ')}. Emojis frequents: ${p.commonEmojis?.join(', ') ?? 'aucun'}. Reactions habituelles: ${p.reactionPatterns?.join(', ') ?? 'aucun'}.`;
    })
    .join('\n');

  const participantsText = recentMessages
    .filter((m, i, arr) => arr.findIndex((a) => a.senderId === m.senderId) === i)
    .map((m) => `@${m.senderUsername ?? m.senderName} (${m.senderId})`)
    .join(', ');

  const effectiveMaxReactions = reactionsEnabled ? maxReactions : 0;

  const recentHistory = (state.agentHistory ?? []).slice(-30);

  const historyText = recentHistory
    .slice(-20)
    .map((h) => `- ${h.userId}: "${h.topic}" (il y a ${Math.round((Date.now() - h.timestamp) / 60000)}min)`)
    .join('\n') || 'Aucune intervention recente.';

  const bannedTopics = [...new Set(recentHistory.map((h) => h.topic).filter(Boolean))];
  const bannedTopicsText = bannedTopics.length > 0
    ? `\nSUJETS INTERDITS (deja abordes recemment - NE PAS Y REVENIR, propose un sujet COMPLETEMENT DIFFERENT):\n${bannedTopics.map((t) => `- "${t}"`).join('\n')}`
    : '';

  const instructionsText = state.agentInstructions
    ? `INSTRUCTIONS SPECIFIQUES: ${state.agentInstructions}`
    : '';

  const recentTopicsText = (state.recentTopicCategories ?? []).length > 0
    ? state.recentTopicCategories.join(', ')
    : 'Aucun sujet recent.';

  const lastUserName = (() => {
    if (!state.lastAgentUserId) return 'aucun';
    const user = state.controlledUsers.find((u) => u.userId === state.lastAgentUserId);
    return user ? `${user.displayName} (${user.userId})` : state.lastAgentUserId;
  })();

  // Extract current conversation topic from last 10 messages
  const currentTopicMessages = recentMessages.slice(-10).map((m) => m.content).join(' ');
  const currentTopicText = currentTopicMessages.length > 0
    ? `Analyse les 10 derniers messages pour detecter le sujet actuel. Contenu: "${currentTopicMessages.slice(0, 500)}"`
    : 'Aucun message recent — conversation potentiellement morte.';

  // Format engagement data if available
  const engagementText = (state.engagementData ?? []).length > 0
    ? state.engagementData.map((e) => {
        const user = state.controlledUsers.find((u) => u.userId === e.userId);
        return `- ${user?.displayName ?? e.userId}: ${e.repliesReceived} reponses, ${e.reactionsReceived} reactions recues`;
      }).join('\n')
    : 'Pas encore de donnees d\'engagement.';

  // Replace safe (config/numeric) placeholders FIRST, then user-content placeholders LAST
  // to prevent template injection from user messages containing {placeholder} strings.
  // The fresh-topic block is appended LAST so it sits at the bottom of the prompt
  // and dominates the LLM's decision when activated.
  return STRATEGIST_SYSTEM_PROMPT
    .replace('{activityScore}', String(state.activityScore))
    .replace('{minResponses}', String(minResponses))
    .replace('{maxResponses}', String(maxResponses + effectiveMaxReactions))
    .replace(/\{budgetRemaining\}/g, String(state.budgetRemaining))
    .replace('{todayUsersActive}', String(state.todayUsersActive))
    .replace('{maxUsersToday}', String(state.maxUsersToday))
    .replace('{reactionBoostFactor}', String(state.reactionBoostFactor))
    .replace(/\{burstSize\}/g, String(state.burstSize))
    .replace(/\{lastAgentUserId\}/g, lastUserName)
    .replace(/\{todayActiveUserNames\}/g, (() => {
      const activeSet = new Set(state.todayActiveUserIds ?? []);
      const activeNames = state.controlledUsers
        .filter((u) => activeSet.has(u.userId))
        .map((u) => u.displayName);
      return activeNames.length > 0 ? activeNames.join(', ') : 'aucun';
    })())
    .replace('{conversationTitle}', state.conversationTitle || 'Sans titre')
    .replace('{conversationDescription}', state.conversationDescription || 'Aucune')
    .replace('{agentInstructions}', instructionsText)
    .replace('{agentHistory}', historyText + bannedTopicsText)
    .replace('{recentTopicCategories}', recentTopicsText)
    .replace('{scheduledActions}', (state.scheduledActions ?? []).length > 0
      ? state.scheduledActions.map(sa =>
        `- ${sa.userId} : "${sa.topicCategory}" dans ${Math.round((sa.scheduledAt - Date.now()) / 60_000)}min (${sa.type})`
      ).join('\n')
      : 'Aucune action programmee')
    .replace('{detectedTheme}', detectedTheme)
    .replace('{topicProvocation}', provocationHint ? buildProvocationBlock(provocationHint, state.budgetRemaining, state.burstSize, state.activityScore) : '')
    .replace('{engagementData}', engagementText)
    .replace('{inactiveUsers}', inactiveUsersText)
    .replace('{participants}', participantsText)
    .replace('{currentTopic}', currentTopicText)
    .replace('{messages}', messagesText);
}

const TYPICAL_LENGTH_RANGES: Record<string, { min: number; max: number }> = {
  expeditif: { min: 1, max: 10 },
  court: { min: 2, max: 30 },
  moyen: { min: 10, max: 60 },
  long: { min: 30, max: 120 },       // admin/expert only
  'tres long': { min: 60, max: 250 }, // admin/expert only
};

function calculateWordLimits(
  user: ControlledUser,
  isInterpelle: boolean,
  state: ConversationState,
) {
  const archetype = user.role.archetypeId ? getArchetype(user.role.archetypeId) : null;

  // 1. User Override (highest priority)
  let minWords = (user.role as any).overrideMinWordsPerMessage;
  let maxWords = (user.role as any).overrideMaxWordsPerMessage;

  // 2. Archetype
  if (minWords === undefined || minWords === null) minWords = archetype?.minWords;
  if (maxWords === undefined || maxWords === null) maxWords = archetype?.maxWords;

  // 3. Per-user typicalLength (maps to distinct word ranges)
  if (minWords === undefined || minWords === null) {
    const range = TYPICAL_LENGTH_RANGES[user.role.typicalLength];
    if (range) minWords = range.min;
  }
  if (maxWords === undefined || maxWords === null) {
    const range = TYPICAL_LENGTH_RANGES[user.role.typicalLength];
    if (range) maxWords = range.max;
  }

  // 4. Conversation default fallback
  if (minWords === undefined || minWords === null) minWords = state.minWordsPerMessage;
  if (maxWords === undefined || maxWords === null) {
    // Don't cap here — the generator applies probability-based tier selection
    maxWords = state.maxWordsPerMessage;
  }

  return {
    minWords: Number(minWords) || 1,
    maxWords: Number(maxWords) || 500,
  };
}

function extractSignificantWords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\sàâäéèêëïîôùûüÿçæœ]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 4);
}

function isTopicTooSimilar(topic: string, recentTopics: string[]): boolean {
  const topicWords = extractSignificantWords(topic);
  if (topicWords.length === 0) return false;
  const recentWords = new Set(recentTopics.flatMap((t) => extractSignificantWords(t)));
  if (recentWords.size === 0) return false;
  const overlap = topicWords.filter((w) => recentWords.has(w));
  return overlap.length / topicWords.length > 0.5;
}

/**
 * Resolve an LLM-provided `asUserId` to a controlled user. Weak models
 * (gpt-4o-mini) routinely echo a displayName or username instead of the 24-hex
 * Mongo id, so fall back to a case-insensitive name/username match before
 * giving up. Without this, validateInterventions silently dropped every planned
 * message (prod regression 2026-05-30: agent produced reactions only).
 */
// Canonical form for tolerant name matching: strip diacritics, lowercase, drop
// all whitespace. Weak models routinely mangle names — drop accents
// ("Israël" → "israel"), split/join words ("inocentguesseu" ↔ "inocent guesseu").
function canonName(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, '');
}

function resolveControlledUser(
  rawAsUserId: string,
  controlledUsers: ControlledUser[],
  byId: Map<string, ControlledUser>,
): ControlledUser | undefined {
  const direct = byId.get(rawAsUserId);
  if (direct) return direct;
  const needle = canonName(rawAsUserId);
  if (!needle) return undefined;
  return controlledUsers.find(
    (u) => canonName(u.displayName ?? '') === needle || canonName(u.username ?? '') === needle,
  );
}

function validateInterventions(
  interventions: unknown[],
  controlledUsers: ControlledUser[],
  messageIds: Set<string>,
  maxMessages: number,
  maxReactions: number,
  state: ConversationState,
): InterventionDirective[] {
  const validated: InterventionDirective[] = [];
  let messageCount = 0;
  let reactionCount = 0;
  const userActionCounts = new Map<string, number>();
  const controlledUserMap = new Map(controlledUsers.map((u) => [u.userId, u]));

  for (const raw of interventions) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const rawAsUserId = String(item.asUserId ?? '');

    const user = resolveControlledUser(rawAsUserId, controlledUsers, controlledUserMap);
    if (!user) {
      console.warn(`[Strategist] Dropped ${String(item.type)} intervention: asUserId="${rawAsUserId}" matches no controlled user (id/displayName/username)`);
      continue;
    }
    const userId = user.userId;

    const currentCount = userActionCounts.get(userId) ?? 0;
    if (currentCount >= 2) continue;

    if (item.type === 'message' && messageCount < maxMessages) {
      const topic = String(item.topic ?? '');
      const recentTopics = (state.agentHistory ?? []).slice(-30).map((h) => h.topic).filter(Boolean);
      if (topic && isTopicTooSimilar(topic, recentTopics)) {
        console.warn(`[Strategist] Rejected intervention: topic "${topic}" too similar to recent history`);
        continue;
      }

      const isInterpelle = Boolean(item.replyToMessageId) || (Array.isArray(item.mentionUsernames) && item.mentionUsernames.length > 0);
      const limits = calculateWordLimits(user, isInterpelle, state);

      const delayCategory = (['immediate', 'short', 'medium', 'long'].includes(String(item.delayCategory))
        ? String(item.delayCategory)
        : 'immediate') as 'immediate' | 'short' | 'medium' | 'long';
      const messageIndex = validated.filter(v => v.type === 'message').length;
      const totalPlannedMessages = interventions.filter((raw: any) => raw?.type === 'message').length;
      const delaySeconds = resolveDelaySeconds(delayCategory, {
        minDelayMinutes: state.minDelayMinutes ?? 1,
        maxDelayMinutes: state.maxDelayMinutes ?? 360,
        spreadOverDayEnabled: state.spreadOverDayEnabled ?? true,
        actionIndex: messageIndex,
        totalActions: totalPlannedMessages,
      });
      const topicCategory = String(item.topicCategory ?? item.topic ?? 'general').toLowerCase().slice(0, 50);
      const topicHash = crypto.createHash('md5').update(String(item.topic ?? '')).digest('hex').slice(0, 8);

      validated.push({
        type: 'message',
        asUserId: userId,
        topic: String(item.topic ?? ''),
        topicCategory,
        replyToMessageId: item.replyToMessageId ? String(item.replyToMessageId) : undefined,
        mentionUsernames: Array.isArray(item.mentionUsernames) ? item.mentionUsernames.map(String) : [],
        delaySeconds,
        delayCategory,
        needsWebSearch: Boolean(item.needsWebSearch),
        searchHint: typeof item.searchHint === 'string' ? item.searchHint : undefined,
        minWords: limits.minWords,
        maxWords: limits.maxWords,
      });
      messageCount++;
      userActionCounts.set(userId, currentCount + 1);
    } else if (item.type === 'reaction' && reactionCount < maxReactions) {
      const targetId = String(item.targetMessageId ?? '');
      if (!messageIds.has(targetId)) continue;

      const rxnDelayCategory = (['immediate', 'short', 'medium', 'long'].includes(String(item.delayCategory))
        ? String(item.delayCategory)
        : 'immediate') as 'immediate' | 'short' | 'medium' | 'long';

      validated.push({
        type: 'reaction',
        asUserId: userId,
        targetMessageId: targetId,
        emoji: String(item.emoji ?? '👍'),
        delaySeconds: Math.round(Math.max(5, Math.min(120, resolveDelaySeconds(rxnDelayCategory, {
          minDelayMinutes: 0,
          maxDelayMinutes: 2,
        })))),
        delayCategory: rxnDelayCategory,
        topicCategory: 'reaction',
      });
      reactionCount++;
      userActionCounts.set(userId, currentCount + 1);
    }
  }

  return validated;
}

const DEFAULT_REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '💯', '😮', '🙌', '✨', '🤔'];

function getUserReactionEmojis(user: ControlledUser): string[] {
  if (user.role.reactionPatterns.length > 0) return user.role.reactionPatterns;
  if (user.role.commonEmojis.length > 0) return user.role.commonEmojis;
  return DEFAULT_REACTION_EMOJIS;
}

function ensureMinimumReactions(
  interventions: InterventionDirective[],
  state: ConversationState,
  maxReactions: number,
): InterventionDirective[] {
  if (maxReactions <= 0) return interventions;

  const controlledUserIds = new Set(state.controlledUsers.map((u) => u.userId));
  const controlledUserMap = new Map(state.controlledUsers.map((u) => [u.userId, u]));
  const reactableMessages = state.messages
    .filter((m) => !controlledUserIds.has(m.senderId))
    .slice(-20);

  if (reactableMessages.length === 0) return interventions;

  const alreadyReactedTo = new Set(
    interventions
      .filter((i): i is ReactionDirective => i.type === 'reaction')
      .map((i) => `${i.asUserId}:${i.targetMessageId}`),
  );

  const result = [...interventions];
  let totalReactions = interventions.filter((i) => i.type === 'reaction').length;

  const messageInterventions = interventions.filter((i) => i.type === 'message');
  const usersWhoSpeak = new Set(messageInterventions.map((i) => i.asUserId));

  // Count how many messages each user sent in the last 20h (fatigue factor)
  const twentyHoursAgo = Date.now() - 20 * 60 * 60 * 1000;
  const recentAgentHistory = (state.agentHistory ?? []).filter((h) => h.timestamp > twentyHoursAgo);

  // 1. SPEAKERS: react BEFORE their message (10-60s delay, simulates reading)
  for (const userId of usersWhoSpeak) {
    const user = controlledUserMap.get(userId);
    if (!user || totalReactions >= maxReactions) break;

    // Count messages sent by this user in last 20h — more messages = fewer reactions
    const recentMessageCount = recentAgentHistory.filter((h) => h.userId === userId).length;

    // First response of the day/topic: 3-4 reactions. Subsequent: 1-2, decreasing with fatigue
    const isFirstResponse = recentMessageCount === 0;
    let reactionCount: number;
    if (isFirstResponse) {
      reactionCount = 3 + Math.floor(Math.random() * 2); // 3-4
    } else if (recentMessageCount <= 3) {
      reactionCount = 1 + Math.floor(Math.random() * 2); // 1-2
    } else if (recentMessageCount <= 6) {
      reactionCount = Math.random() < 0.7 ? 1 : 0; // mostly 1, sometimes 0
    } else {
      reactionCount = Math.random() < 0.3 ? 1 : 0; // rarely react when fatigued
    }

    const userEmojis = getUserReactionEmojis(user);
    const candidateMessages = reactableMessages.filter(
      (m) => !alreadyReactedTo.has(`${userId}:${m.id}`) && m.senderId !== userId,
    );

    for (let i = 0; i < reactionCount && i < candidateMessages.length && totalReactions < maxReactions; i++) {
      const targetMsg = candidateMessages[candidateMessages.length - 1 - i];
      const emoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];

      // Speakers: 10-60s delay (reading before typing)
      result.push({
        type: 'reaction',
        asUserId: userId,
        targetMessageId: targetMsg.id,
        emoji,
        delaySeconds: Math.round((10 + Math.random() * 50) * (0.8 + Math.random() * 0.4)),
        delayCategory: 'immediate' as const,
        topicCategory: 'reaction',
      });
      alreadyReactedTo.add(`${userId}:${targetMsg.id}`);
      totalReactions++;
    }
  }

  // 2. LURKERS: the MAIN reactors — they read and react heavily (3-15s delay)
  const silentUsers = state.controlledUsers.filter((u) => !usersWhoSpeak.has(u.userId));
  for (const user of shuffleArray(silentUsers)) {
    if (totalReactions >= maxReactions) break;
    if (Math.random() > 0.85) continue; // 85% chance to react as lurker — they're the most active reactors

    const userEmojis = getUserReactionEmojis(user);
    const candidateMessages = reactableMessages.filter(
      (m) => !alreadyReactedTo.has(`${user.userId}:${m.id}`) && m.senderId !== user.userId,
    );
    if (candidateMessages.length === 0) continue;

    // Lurkers react to 2-4 messages (they're just reading and reacting, that's their thing)
    const lurkReactionCount = 2 + Math.floor(Math.random() * 3); // 2-4
    for (let i = 0; i < lurkReactionCount && i < candidateMessages.length && totalReactions < maxReactions; i++) {
      const targetMsg = candidateMessages[candidateMessages.length - 1 - i]; // most recent first
      const emoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];

      // Lurkers: 3-15s delay (quick scroll + tap reaction)
      result.push({
        type: 'reaction',
        asUserId: user.userId,
        targetMessageId: targetMsg.id,
        emoji,
        delaySeconds: Math.round((3 + Math.random() * 12) * (0.8 + Math.random() * 0.4)),
        delayCategory: 'immediate' as const,
        topicCategory: 'reaction',
      });
      alreadyReactedTo.add(`${user.userId}:${targetMsg.id}`);
      totalReactions++;
    }
  }

  return result;
}



// Standalone lurker reactions — called even when no message interventions happen
function generateLurkerReactions(
  state: ConversationState,
  maxReactions: number,
): InterventionDirective[] {
  if (maxReactions <= 0) return [];

  const controlledUserIds = new Set(state.controlledUsers.map((u) => u.userId));
  const controlledUserMap = new Map(state.controlledUsers.map((u) => [u.userId, u]));
  const reactableMessages = state.messages
    .filter((m) => !controlledUserIds.has(m.senderId))
    .slice(-15);

  if (reactableMessages.length === 0) return [];

  const result: InterventionDirective[] = [];
  const alreadyReactedTo = new Set<string>();
  let totalReactions = 0;

  // Pick 1-3 random lurkers to react
  const lurkers = shuffleArray([...state.controlledUsers]);
  const lurkerCount = 1 + Math.floor(Math.random() * Math.min(3, lurkers.length));

  for (let li = 0; li < lurkerCount && totalReactions < maxReactions; li++) {
    const user = lurkers[li];
    const userEmojis = getUserReactionEmojis(user);
    const candidates = reactableMessages.filter(
      (m) => !alreadyReactedTo.has(`${user.userId}:${m.id}`) && m.senderId !== user.userId,
    );
    if (candidates.length === 0) continue;

    const reactionCount = 1 + Math.floor(Math.random() * 2); // 1-2
    for (let i = 0; i < reactionCount && i < candidates.length && totalReactions < maxReactions; i++) {
      const targetMsg = candidates[candidates.length - 1 - i];
      const emoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];

      result.push({
        type: 'reaction',
        asUserId: user.userId,
        targetMessageId: targetMsg.id,
        emoji,
        delaySeconds: Math.round((3 + Math.random() * 12) * (0.8 + Math.random() * 0.4)),
        delayCategory: 'immediate' as const,
        topicCategory: 'reaction',
      });
      alreadyReactedTo.add(`${user.userId}:${targetMsg.id}`);
      totalReactions++;
    }
  }

  return result;
}
export interface StrategistDependencies {
  topicCatalog: TopicCatalogService;
  topicUsage: TopicUsageService;
}

export function createStrategistNode(llm: LlmProvider, deps?: StrategistDependencies) {
  return async function strategist(state: ConversationState) {
    if (state.controlledUsers.length === 0) {
      return {
        interventionPlan: { shouldIntervene: false, reason: 'No controlled users available', interventions: [] } satisfies InterventionPlan,
        _traceInputTokens: 0, _traceOutputTokens: 0, _traceModel: 'skipped', _traceExtra: { decision: 'skip_no_users' },
      };
    }

    const maxReactions = state.maxReactionsPerCycle;
    const reactionsEnabled = state.reactionsEnabled;

    if (state.activityScore > 0.7) {
      // Even in active conversations, lurkers can still react
      const lurkerReactions = reactionsEnabled
        ? generateLurkerReactions(state, maxReactions)
        : [];
      return {
        interventionPlan: {
          shouldIntervene: lurkerReactions.length > 0,
          reason: 'Conversation active — lurker reactions only',
          interventions: lurkerReactions,
        } satisfies InterventionPlan,
        _traceInputTokens: 0, _traceOutputTokens: 0, _traceModel: 'skipped', _traceExtra: { decision: 'skip_active' },
      };
    }

    if (state.budgetRemaining <= 0) {
      // Budget exhausted for messages, but lurkers can still react
      const lurkerReactions = reactionsEnabled
        ? generateLurkerReactions(state, maxReactions)
        : [];
      return {
        interventionPlan: {
          shouldIntervene: lurkerReactions.length > 0,
          reason: 'Budget exhausted — lurker reactions only',
          interventions: lurkerReactions,
        } satisfies InterventionPlan,
        _traceInputTokens: 0, _traceOutputTokens: 0, _traceModel: 'skipped', _traceExtra: { decision: 'skip_budget' },
      };
    }

    const minResponses = state.minResponsesPerCycle;
    const maxResponses = state.maxResponsesPerCycle;

    const provocationProbability = computeProvocationProbability(
      state.freshTopicProbability ?? DEFAULT_TOPIC_PROVOCATION_PROBABILITY,
      state.activityScore,
    );
    const shouldProvoke =
      state.budgetRemaining > 0 && provocationProbability > 0 && Math.random() < provocationProbability;

    let provocationHint: ProvocationHint | null = null;
    let chosenTopic: TopicCatalogEntry | null = null;
    let detectedTheme = 'general';

    if (shouldProvoke && deps) {
      try {
        const allTopics = await deps.topicCatalog.list({ activeOnly: true });
        const blockedSet = new Set(state.freshTopicBlockedSlugs ?? []);
        const allowed = allTopics.filter((t) => !blockedSet.has(t.slug));
        const eligible = await deps.topicUsage.filterEligible(allowed, state.conversationId);

        if (eligible.length > 0) {
          const haystack = buildHaystack(state);
          const compiledMap = new Map<string, RegExp[]>();
          for (const t of eligible) {
            compiledMap.set(t.id, deps.topicCatalog.compiledPatternsFor(t.id));
          }
          chosenTopic = selectProvocationTopic(eligible, compiledMap, haystack);
          if (chosenTopic) {
            detectedTheme = chosenTopic.slug;
            provocationHint = renderProvocationHint(chosenTopic, {
              conversationTitle: state.conversationTitle ?? '',
              conversationDescription: state.conversationDescription ?? '',
            });
            console.log(
              `[Strategist] Topic provocation TRIGGERED (slug=${chosenTopic.slug}, searchHint="${provocationHint.searchHint}")`,
            );
          }
        }
      } catch (err) {
        console.error('[Strategist] Topic catalog lookup failed, skipping provocation', err);
      }
    }
    const provokeNewTopic = provocationHint !== null;

    const prompt = buildStrategistPrompt(
      state,
      minResponses,
      maxResponses,
      maxReactions,
      reactionsEnabled,
      detectedTheme,
      provocationHint,
    );

    // Record usage (fire-and-forget) — pas besoin d'attendre, on log les erreurs.
    if (chosenTopic && deps) {
      const topicId = chosenTopic.id;
      const conversationId = state.conversationId;
      deps.topicUsage.record(topicId, conversationId).catch((err) =>
        console.error('[Strategist] Failed to record topic usage', err),
      );
    }

    try {
      const response = await llm.chat({
        systemPrompt: prompt,
        messages: [
          {
            role: 'user',
            content: `Analyse cette conversation et propose un plan d'intervention naturel. Score d'activite: ${state.activityScore}. Utilisateurs inactifs disponibles: ${state.controlledUsers.length}.`,
          },
        ],
        temperature: 0.7,
        maxTokens: 1024,
      });

      const parsed = parseJsonLlm<{ shouldIntervene: boolean; reason?: string; interventions?: unknown[] }>(response.content);

      if (!parsed.shouldIntervene) {
        // No messages needed, but lurkers can still react
        const lurkerReactions = reactionsEnabled
          ? generateLurkerReactions(state, maxReactions)
          : [];
        return {
          interventionPlan: {
            shouldIntervene: lurkerReactions.length > 0,
            reason: parsed.reason ?? 'No messages — lurker reactions only',
            interventions: lurkerReactions,
          } satisfies InterventionPlan,
          _traceInputTokens: response.usage.inputTokens,
          _traceOutputTokens: response.usage.outputTokens,
          _traceModel: response.model,
          _traceExtra: { decision: 'skip_no_intervene', reason: parsed.reason ?? '' },
        };
      }

      const messageIds = new Set(state.messages.map((m) => m.id));

      // gpt-4o-mini (and other weak models) routinely return asUserId as a
      // displayName/username instead of the 24-hex id. Normalise every
      // intervention to the canonical controlled-user id BEFORE rotation and
      // validation so all downstream matching works. (Prod regression
      // 2026-05-30: 100% of planned messages were silently dropped here.)
      if (parsed.interventions) {
        const byId = new Map(state.controlledUsers.map((u) => [u.userId, u]));
        for (const iv of parsed.interventions as Array<Record<string, unknown>>) {
          if (!iv || typeof iv !== 'object') continue;
          const resolved = resolveControlledUser(String(iv.asUserId ?? ''), state.controlledUsers, byId);
          if (resolved) iv.asUserId = resolved.userId;
        }
      }

      // CODE-LEVEL USER ROTATION: If the LLM picked the same user as last cycle
      // and there are other available users, rewrite interventions to use different users (sequential cycling).
      if (state.lastAgentUserId && state.controlledUsers.length > 1 && parsed.interventions) {
        const otherUsers = shuffleArray(state.controlledUsers.filter((u) => u.userId !== state.lastAgentUserId));
        if (otherUsers.length > 0) {
          const messageInterventions = (parsed.interventions as Array<Record<string, unknown>>).filter(
            (i) => i.type === 'message' && i.asUserId === state.lastAgentUserId,
          );
          for (let idx = 0; idx < messageInterventions.length; idx++) {
            const replacement = otherUsers[idx % otherUsers.length];
            console.log(`[Strategist] Rotating user: ${state.lastAgentUserId} → ${replacement.userId} (${replacement.displayName})`);
            messageInterventions[idx].asUserId = replacement.userId;
          }
        }
      }

      const dynamicMax = state.activityScore < 0.3
        ? maxResponses
        : Math.max(1, Math.ceil(maxResponses * (1 - state.activityScore)));
      const effectiveMaxMessages = Math.min(dynamicMax, state.budgetRemaining);

      const validatedInterventions = validateInterventions(
        parsed.interventions ?? [],
        state.controlledUsers,
        messageIds,
        effectiveMaxMessages,
        reactionsEnabled ? maxReactions : 0,
        state,
      );

      const withReactions = ensureMinimumReactions(
        validatedInterventions,
        state,
        reactionsEnabled ? maxReactions : 0,
      );

      return {
        interventionPlan: {
          shouldIntervene: withReactions.length > 0,
          reason: parsed.reason ?? '',
          interventions: withReactions,
        } satisfies InterventionPlan,
        _traceInputTokens: response.usage?.inputTokens ?? 0,
        _traceOutputTokens: response.usage?.outputTokens ?? 0,
        _traceModel: response.model ?? 'unknown',
        _traceExtra: {
          decision: withReactions.length > 0 ? 'intervene' : 'skip',
          reason: parsed.reason ?? '',
          plannedMessages: withReactions.filter((i) => i.type === 'message').length,
          plannedReactions: withReactions.filter((i) => i.type === 'reaction').length,
          detectedTheme,
          topicProvocationTriggered: provokeNewTopic,
          provocationSearchHint: provocationHint?.searchHint,
        },
      };
    } catch (error) {
      console.error('[Strategist] Error:', error);
      return {
        interventionPlan: { shouldIntervene: false, reason: 'Strategist error', interventions: [] } satisfies InterventionPlan,
        _traceInputTokens: 0,
        _traceOutputTokens: 0,
        _traceModel: 'error',
        _traceExtra: {
          decision: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
          errorCode: (error as any)?.code ?? 'UNKNOWN',
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  };
}
