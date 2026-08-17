import type { ConversationState, MessageEntry, ToneProfile, TraitValue } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import { parseJsonLlm } from '../utils/parse-json-llm';

const OBSERVER_SYSTEM_PROMPT = `Tu es un analyste conversationnel expert en profilage psychologique et stylistique. Tu dois identifier ce qui rend CHAQUE participant UNIQUE.

Analyse la conversation et retourne un JSON avec:
1. "summary": resume concis de la conversation (max 200 mots)
2. "overallTone": ton general
3. "healthScore": sante globale de la conversation (0-100: 0=toxique, 50=neutre, 100=sain et dynamique)
4. "engagementLevel": dormant|faible|modere|actif|intense
5. "conflictLevel": aucun|leger|modere|eleve|critique
6. "dynamique": description courte de la dynamique de groupe (1-2 phrases)
7. "dominantEmotions": emotions dominantes de la conversation (array de strings)
8. "profiles": un objet avec chaque userId comme cle contenant:

   // STYLISTIQUE (existant)
   - "tone": ton SPECIFIQUE (pas juste "neutre" — sois precis: "sarcastique et joueur", "enthousiaste et direct")
   - "vocabularyLevel": "familier" | "courant" | "soutenu"
   - "typicalLength": "expeditif" | "court" | "moyen" | "long" | "tres long"
   - "emojiUsage": "jamais" | "occasionnel" | "abondant"
   - "topicsOfExpertise": sujets sur lesquels il intervient
   - "catchphrases": expressions recurrentes et TICS DE LANGAGE. MINIMUM 3 si possible.
   - "responseTriggers": types de messages qui le font reagir
   - "silenceTriggers": types de messages qu'il ignore
   - "commonEmojis": emojis SPECIFIQUES qu'il utilise dans ses messages
   - "reactionPatterns": emojis reactions (MINIMUM 2)
   - "personaSummary": description DETAILLEE UNIQUE (50-100 mots)

   // PSYCHOLOGIQUE (nouveau) — chaque trait: { "label": "une des 5 categories", "score": 0-100 }
   - "communication": { "verbosity", "formality", "responseSpeed", "initiativeRate", "clarity", "argumentation" }
   - "personality": { "socialStyle", "assertiveness", "agreeableness", "humor", "emotionality", "openness", "confidence", "creativity", "patience", "adaptability" }
   - "interpersonal": { "empathy", "politeness", "leadership", "conflictStyle", "supportiveness", "diplomacy", "trustLevel" }
   - "emotional": { "emotionalStability", "positivity", "sensitivity", "stressResponse" }

   - "dominantEmotions": emotions dominantes de l'utilisateur (array)
   - "relationshipMap": { [autreUserId]: { "attitude": string, "score": -100 a 100, "detail": string (1 phrase) } }

CATEGORIES DE TRAITS:
- verbosity: laconique|concis|modere|detaille|prolixe
- formality: argotique|familier|courant|soigne|academique
- responseSpeed: tres_lent|lent|modere|rapide|instantane
- initiativeRate: passif|reactif|equilibre|proactif|meneur
- clarity: confus|vague|correct|clair|limpide
- argumentation: inexistante|faible|moyenne|structuree|rigoureuse
- socialStyle: introverti|reserve|ambivert|sociable|extraverti
- assertiveness: timide|discret|mesure|affirme|dominant
- agreeableness: confrontant|critique|neutre|conciliant|bienveillant
- humor: absent|rare|occasionnel|frequent|omnipresent
- emotionality: stoique|contenu|modere|expressif|debordant
- openness: ferme|prudent|receptif|curieux|aventurier
- confidence: insecure|hesitant|modere|assure|inebranlable
- creativity: conventionnel|classique|modere|creatif|visionnaire
- patience: impatient|presse|modere|patient|zen
- adaptability: rigide|constant|flexible|adaptable|cameleon
- empathy: indifferent|distant|attentif|empathique|fusionnel
- politeness: abrupt|direct|correct|poli|ceremonieux
- leadership: suiveur|discret|participant|influent|leader
- conflictStyle: evitant|passif|diplomate|confrontant|combatif
- supportiveness: absent|rare|ponctuel|present|pilier
- diplomacy: maladroit|brut|correct|habile|maitre
- trustLevel: mefiant|prudent|neutre|confiant|naif
- emotionalStability: volatile|instable|variable|stable|inebranlable
- positivity: pessimiste|negatif|neutre|positif|optimiste
- sensitivity: insensible|epais|modere|sensible|hypersensible
- stressResponse: panique|anxieux|gerable|calme|imperturbable
- relationshipMap attitude: hostile|froid|distant|neutre|cordial|amical|chaleureux

REGLES CRITIQUES:
- Chaque profil DOIT etre DIFFERENT des autres
- "personaSummary" doit capturer l'ESSENCE UNIQUE de la personne
- "tone" doit etre une DESCRIPTION RICHE, pas un seul mot
- "catchphrases" doit contenir des VRAIS tics de langage observes
- Scores bases sur des PREUVES dans les messages, pas des suppositions
- relationshipMap score: -100 (haine) a 100 (adoration), detail: 1 phrase explicative
- Si pas assez de donnees pour un trait, l'omettre
- Valeurs categoriques TOUJOURS en francais
Retourne UNIQUEMENT du JSON valide, aucun texte autour.`;

function mergeStringArrays(incoming: unknown, existing: string[] | undefined): string[] {
  const incomingArr = Array.isArray(incoming) ? incoming.filter((s): s is string => typeof s === 'string') : [];
  const existingArr = existing ?? [];
  if (incomingArr.length === 0) return existingArr;
  return [...new Set([...existingArr, ...incomingArr])];
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

const CONFIDENCE_DECAY = 0.005;

const TRAIT_CATEGORIES = ['communication', 'personality', 'interpersonal', 'emotional'] as const;

function extractTraitCategory(raw: unknown): Record<string, TraitValue> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const result: Record<string, TraitValue> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val && typeof val === 'object' && 'label' in val && 'score' in val) {
      const tv = val as { label: unknown; score: unknown };
      if (typeof tv.label === 'string' && typeof tv.score === 'number') {
        result[key] = { label: tv.label, score: tv.score };
      }
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractTraits(p: Record<string, unknown>): NonNullable<ToneProfile['traits']> {
  const traits: NonNullable<ToneProfile['traits']> = {};
  for (const cat of TRAIT_CATEGORIES) {
    const extracted = extractTraitCategory(p[cat]);
    if (extracted) (traits as Record<string, Record<string, TraitValue>>)[cat] = extracted;
  }
  return traits;
}

function mergeTraitCategories(
  existing: NonNullable<ToneProfile['traits']>,
  incoming: NonNullable<ToneProfile['traits']>,
): NonNullable<ToneProfile['traits']> {
  const merged: NonNullable<ToneProfile['traits']> = { ...existing };
  for (const cat of TRAIT_CATEGORIES) {
    const existingCat = (existing as Record<string, Record<string, TraitValue> | undefined>)[cat];
    const incomingCat = (incoming as Record<string, Record<string, TraitValue> | undefined>)[cat];
    if (incomingCat) {
      (merged as Record<string, Record<string, TraitValue>>)[cat] = { ...existingCat, ...incomingCat };
    }
  }
  return merged;
}

export function createObserverNode(llm: LlmProvider) {
  return async function observe(state: ConversationState) {
    if (state.messages.length === 0) return {
      summary: state.summary,
      toneProfiles: state.toneProfiles,
      _traceInputTokens: 0, _traceOutputTokens: 0, _traceModel: 'skipped', _traceExtra: { skipped: true },
    };

    const participantIds = new Set(state.messages.map((m) => m.senderId));
    const displayNameMap = new Map(state.messages.map((m) => [m.senderId, m.senderName]));

    const conversationText = state.messages
      .map((m) => `[${m.senderName}]: ${m.content}`)
      .join('\n');

    const contextPrompt = state.summary
      ? `Resume precedent: ${state.summary}\n\nNouveaux messages:\n${conversationText}`
      : conversationText;

    try {
      const response = await llm.chat({
        systemPrompt: OBSERVER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contextPrompt }],
        temperature: 0.3,
        maxTokens: 3072,
      });

      let parsed: { summary?: string; overallTone?: string; profiles?: Record<string, unknown>; healthScore?: number; engagementLevel?: string; conflictLevel?: string; dynamique?: string; dominantEmotions?: string[] };
      try {
        parsed = parseJsonLlm<typeof parsed>(response.content);
      } catch {
        console.warn('[Observer] Failed to parse LLM response, preserving existing state');
        return {
          summary: state.summary,
          _traceInputTokens: response.usage.inputTokens,
          _traceOutputTokens: response.usage.outputTokens,
          _traceModel: response.model,
          _traceExtra: { parseError: true },
        };
      }

      const updatedProfiles: Record<string, ToneProfile> = { ...state.toneProfiles };

      if (parsed.profiles) {
        for (const [userId, profile] of Object.entries(parsed.profiles)) {
          if (!participantIds.has(userId)) continue;

          const existing = updatedProfiles[userId];
          const p = profile as Record<string, unknown>;

          const controlledUser = state.controlledUsers.find((u) => u.userId === userId);
          const preservedOrigin = controlledUser?.role.origin ?? existing?.origin ?? 'observed';

          if (existing?.locked) {
            if (existing.confidence > 0) {
              const decayed = Math.max(0.5, existing.confidence - CONFIDENCE_DECAY);
              updatedProfiles[userId] = {
                ...existing,
                confidence: decayed,
                locked: decayed >= 0.5,
              };
            }
            continue;
          }

          const lastAnalyzedId = existing?._lastAnalyzedMessageId;
          const newMessages = lastAnalyzedId
            ? state.messages.filter((m) => m.senderId === userId && m.id > lastAnalyzedId)
            : state.messages.filter((m) => m.senderId === userId);
          const newCount = newMessages.length;
          const messagesAnalyzed = (existing?.messagesAnalyzed ?? 0) + newCount;
          const latestMessageId = newMessages.length > 0 ? newMessages[newMessages.length - 1].id : lastAnalyzedId;

          const incomingTraits = extractTraits(p);
          const mergedTraits = existing?.traits
            ? mergeTraitCategories(existing.traits, incomingTraits)
            : incomingTraits;

          const incomingRelMap = p.relationshipMap as Record<string, unknown> | undefined;
          const mergedRelationshipMap: ToneProfile['relationshipMap'] = { ...(existing?.relationshipMap ?? {}) };
          if (incomingRelMap && typeof incomingRelMap === 'object') {
            for (const [relUserId, relValue] of Object.entries(incomingRelMap)) {
              if (typeof relValue === 'string') {
                mergedRelationshipMap[relUserId] = relValue;
              } else if (relValue && typeof relValue === 'object' && 'attitude' in relValue) {
                mergedRelationshipMap[relUserId] = relValue as { attitude: string; score: number; detail: string };
              }
            }
          }

          const incomingDominantEmotions = Array.isArray(p.dominantEmotions)
            ? (p.dominantEmotions as unknown[]).filter((e): e is string => typeof e === 'string')
            : undefined;

          updatedProfiles[userId] = {
            userId,
            displayName: displayNameMap.get(userId) ?? existing?.displayName ?? userId,
            origin: preservedOrigin,
            archetypeId: existing?.archetypeId,
            personaSummary: safeString(p.personaSummary, existing?.personaSummary ?? ''),
            tone: safeString(p.tone, existing?.tone ?? 'neutre'),
            vocabularyLevel: safeString(p.vocabularyLevel, existing?.vocabularyLevel ?? 'courant'),
            typicalLength: safeString(p.typicalLength, existing?.typicalLength ?? 'moyen'),
            emojiUsage: safeString(p.emojiUsage, existing?.emojiUsage ?? 'occasionnel'),
            topicsOfExpertise: mergeStringArrays(p.topicsOfExpertise, existing?.topicsOfExpertise).slice(-10),
            topicsAvoided: mergeStringArrays(p.topicsAvoided, existing?.topicsAvoided).slice(-10),
            relationshipMap: mergedRelationshipMap,
            catchphrases: mergeStringArrays(p.catchphrases, existing?.catchphrases),
            responseTriggers: mergeStringArrays(p.responseTriggers, existing?.responseTriggers),
            silenceTriggers: mergeStringArrays(p.silenceTriggers, existing?.silenceTriggers),
            commonEmojis: mergeStringArrays(p.commonEmojis, existing?.commonEmojis),
            reactionPatterns: mergeStringArrays(p.reactionPatterns, existing?.reactionPatterns),
            messagesAnalyzed,
            confidence: Math.min(messagesAnalyzed / 50, 1.0),
            locked: messagesAnalyzed >= 50,
            traits: Object.keys(mergedTraits).length > 0 ? mergedTraits : undefined,
            dominantEmotions: incomingDominantEmotions ?? existing?.dominantEmotions,
            _lastAnalyzedMessageId: latestMessageId,
          };
        }
      }

      return {
        summary: parsed.summary ?? state.summary,
        toneProfiles: updatedProfiles,
        _traceInputTokens: response.usage?.inputTokens ?? 0,
        _traceOutputTokens: response.usage?.outputTokens ?? 0,
        _traceModel: response.model ?? 'unknown',
        _traceExtra: {
          profilesUpdated: Object.keys(parsed.profiles ?? {}).length,
          summaryChanged: (parsed.summary ?? '') !== state.summary,
          overallTone: parsed.overallTone,
          healthScore: parsed.healthScore,
          engagementLevel: parsed.engagementLevel,
          conflictLevel: parsed.conflictLevel,
          dynamique: parsed.dynamique,
          dominantEmotions: parsed.dominantEmotions,
        },
      };
    } catch (error) {
      console.error('[Observer] Error analyzing conversation:', error);
      return {
        summary: state.summary,
        _traceInputTokens: 0,
        _traceOutputTokens: 0,
        _traceModel: 'error',
        _traceExtra: {
          error: true,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorCode: (error as any)?.code ?? 'UNKNOWN',
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  };
}

// ---------------------------------------------------------------------------------------------
// G-125 — Résumé borné à une plage de messages, format UNE ligne.
//
// Distinct du résumé glissant produit par `observe()` ci-dessus (jusqu'à 200 mots, portant sur
// toute la fenêtre de contexte conservée) : ce résumé sert le pont ✦ du fil (contrat §5.1) et ne
// doit JAMAIS parler de « la conversation » dans son ensemble — seulement de la plage explicite
// qu'on lui fournit. La gateway (G-127) intersecte cette plage avec la fenêtre non lue du lecteur ;
// l'observer, lui, ne connaît que la plage qu'on lui donne, jamais l'historique complet.
//
// La contrainte « une ligne » est posée sur la GÉNÉRATION (prompt système dédié + budget de
// tokens court) — pas rattrapée après coup par une troncature fragile. `collapseToOneLine` ne
// fait qu'aplatir des retours à la ligne littéraux si le modèle les ignore malgré la consigne ;
// il ne réécrit, ne résume ni ne coupe jamais le texte.
// ---------------------------------------------------------------------------------------------

export type MessageRange = {
  /** Premier message inclus dans la plage — un identifiant, jamais un index ni un décompte. */
  fromMessageId: string;
  /** Dernier message inclus dans la plage, bornes comprises. */
  toMessageId: string;
};

export type RangeSummaryResult = {
  /** Une seule ligne, sans retour à la ligne — garanti par le prompt de génération. */
  summary: string;
  fromMessageId: string;
  toMessageId: string;
  /** Nombre de messages réellement couverts — toujours compté sur la fenêtre isolée, jamais déduit. */
  messageCount: number;
};

const RANGE_SUMMARY_SYSTEM_PROMPT = `Tu résumes UNIQUEMENT les messages fournis ci-dessous — jamais toute la conversation, jamais ce qui la précède ou la suit.

Contraintes de génération, non négociables :
- UNE SEULE ligne. Aucun retour à la ligne, aucune puce, aucun titre, aucune énumération.
- Une phrase en français, moins de 30 mots.
- Rien au-delà de ce que ces messages disent : si un point n'y est pas tranché, ne l'affirme pas.
- Ne dis jamais « la conversation » en général : dis ce qui s'est dit DANS cette plage précise.

Retourne UNIQUEMENT la phrase, sans guillemets, sans JSON, sans texte autour.`;

/** Budget de tokens volontairement court : une contrainte de génération de plus, pas une garde a posteriori. */
const RANGE_SUMMARY_MAX_TOKENS = 96;

/**
 * Isole la plage explicite `[fromMessageId, toMessageId]` (bornes incluses) dans `messages`.
 * Une borne introuvable, ou des bornes inversées, rendent une fenêtre VIDE et incomplète —
 * jamais un sous-ensemble deviné au mieux (règle « une absence reste une absence »).
 */
export function resolveMessageRangeWindow(
  messages: MessageEntry[],
  range: MessageRange,
): { window: MessageEntry[]; isComplete: boolean } {
  const fromIndex = messages.findIndex((m) => m.id === range.fromMessageId);
  const toIndex = messages.findIndex((m) => m.id === range.toMessageId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex > toIndex) {
    return { window: [], isComplete: false };
  }
  return { window: messages.slice(fromIndex, toIndex + 1), isComplete: true };
}

/**
 * Aplatit une réponse en une seule ligne : un filet de sécurité littéral (retours à la ligne
 * remplacés par un espace, lignes vides supprimées) — pas une réécriture. La forme d'une ligne
 * vient du prompt de génération, pas d'ici ; une phrase déjà sur une seule ligne ressort intacte.
 */
function collapseToOneLine(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .trim();
}

/**
 * Résumé borné (G-125) : ne lit et n'envoie au LLM QUE les messages de `range`, jamais
 * l'historique complet, jamais un résumé précédent. Rend `null` — jamais un résumé fabriqué —
 * si la plage est introuvable, vide, ou si le modèle ne rend rien d'exploitable (C2 : une
 * couverture incertaine ne se déclare jamais complète).
 */
export async function summarizeMessageRange(
  llm: LlmProvider,
  messages: MessageEntry[],
  range: MessageRange,
): Promise<RangeSummaryResult | null> {
  const { window, isComplete } = resolveMessageRangeWindow(messages, range);
  if (!isComplete || window.length === 0) return null;

  const conversationText = window.map((m) => `[${m.senderName}]: ${m.content}`).join('\n');

  try {
    const response = await llm.chat({
      systemPrompt: RANGE_SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: conversationText }],
      temperature: 0.2,
      maxTokens: RANGE_SUMMARY_MAX_TOKENS,
    });

    const oneLine = collapseToOneLine(response.content ?? '');
    if (!oneLine) return null;

    return {
      summary: oneLine,
      fromMessageId: range.fromMessageId,
      toMessageId: range.toMessageId,
      messageCount: window.length,
    };
  } catch (error) {
    console.error('[Observer] Erreur de résumé borné (G-125):', error);
    return null;
  }
}
