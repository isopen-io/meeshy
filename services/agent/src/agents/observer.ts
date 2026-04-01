import type { ConversationState, ToneProfile, TraitValue } from '../graph/state';
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

          const lastAnalyzedId = (existing as any)?._lastAnalyzedMessageId as string | undefined;
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
          } as ToneProfile & { _lastAnalyzedMessageId?: string };
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
        _traceExtra: { error: true },
      };
    }
  };
}
