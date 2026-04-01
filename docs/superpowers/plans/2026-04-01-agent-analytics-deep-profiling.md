# Agent Analytics & Deep Profiling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 23 psychological dimensions per participant, server-side message stats, daily snapshots, and enrich the iOS conversation dashboard with server data instead of client-computed stats.

**Architecture:** Prisma schema extensions (46 new fields on AgentUserRole, 5 on AgentConversationSummary, 2 new models) → Observer LLM prompt enrichment → Incremental stats pipeline in gateway → Daily cron snapshots → REST API enrichment → Swift SDK types → iOS dashboard refresh.

**Tech Stack:** Prisma/MongoDB, TypeScript (gateway + agent), Swift/SwiftUI (iOS), node-cron, Redis caching, Swift Charts.

**Spec:** `docs/superpowers/specs/2026-04-01-agent-analytics-deep-profiling-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|----------------|
| `services/gateway/src/services/ConversationMessageStatsService.ts` | Incremental message stats aggregation + Redis/memory cache |
| `services/gateway/src/routes/conversations/stats.ts` | `GET /conversations/:id/stats` endpoint |
| `services/agent/src/cron/daily-snapshot.ts` | Daily snapshot cron job (00:00 UTC) |

### Modified Files
| File | Changes |
|------|---------|
| `packages/shared/prisma/schema.prisma` | 46 new fields on AgentUserRole, 5 on AgentConversationSummary, 2 new models (AgentAnalysisSnapshot, ConversationMessageStats), 2 new relations on Conversation |
| `services/agent/src/graph/state.ts` | Extend ToneProfile with optional `traits` + `dominantEmotions` |
| `services/agent/src/agents/observer.ts` | New LLM prompt (23 traits + conversation metrics), maxTokens 3072 |
| `services/agent/src/memory/mongo-persistence.ts` | Persist 46 new trait fields in upsertUserRole, enriched upsertSummary, relationshipMap migration in getControlledUsers |
| `services/gateway/src/routes/conversations/core.ts` | Extend /analysis select with all new fields + history array |
| `services/gateway/src/routes/conversations/index.ts` | Register stats routes |
| `services/gateway/src/socketio/handlers/MessageHandler.ts` | Hook stats increment on message:new |
| `services/gateway/src/routes/conversations/messages-advanced.ts` | Hook stats adjust on edit/delete REST handlers |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/AgentAnalysisModels.swift` | Add TraitScore, trait category structs, AnalysisSnapshot, ConversationMessageStatsResponse, update existing models |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationAnalysisService.swift` | Add fetchStats() method |
| `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift` | Replace client-computed stats with server stats, add traits/history sections |

---

## Task 1: Prisma Schema — New Fields & Models

**Files:**
- Modify: `packages/shared/prisma/schema.prisma:3022-3079` (AgentUserRole + AgentConversationSummary)
- Modify: `packages/shared/prisma/schema.prisma:288-367` (Conversation model — add relations)

- [ ] **Step 1: Add 46 new trait fields to AgentUserRole**

After `reactionPatterns String[] @default([])` (line 3045), before the override fields block, add:

```prisma
  // ── Psychological Dimensions (23 traits) ──
  traitVerbosity            String?
  traitVerbosityScore       Int?
  traitFormality            String?
  traitFormalityScore       Int?
  traitResponseSpeed        String?
  traitResponseSpeedScore   Int?
  traitInitiativeRate       String?
  traitInitiativeRateScore  Int?
  traitClarity              String?
  traitClarityScore         Int?
  traitArgumentation        String?
  traitArgumentationScore   Int?

  traitSocialStyle          String?
  traitSocialStyleScore     Int?
  traitAssertiveness        String?
  traitAssertivenessScore   Int?
  traitAgreeableness        String?
  traitAgreeablenessScore   Int?
  traitHumor                String?
  traitHumorScore           Int?
  traitEmotionality         String?
  traitEmotionalityScore    Int?
  traitOpenness             String?
  traitOpennessScore        Int?
  traitConfidence           String?
  traitConfidenceScore      Int?
  traitCreativity           String?
  traitCreativityScore      Int?
  traitPatience             String?
  traitPatienceScore        Int?
  traitAdaptability         String?
  traitAdaptabilityScore    Int?

  traitEmpathy              String?
  traitEmpathyScore         Int?
  traitPoliteness           String?
  traitPolitenessScore      Int?
  traitLeadership           String?
  traitLeadershipScore      Int?
  traitConflictStyle        String?
  traitConflictStyleScore   Int?
  traitSupportiveness       String?
  traitSupportivenessScore  Int?
  traitDiplomacy            String?
  traitDiplomacyScore       Int?
  traitTrustLevel           String?
  traitTrustLevelScore      Int?

  traitEmotionalStability      String?
  traitEmotionalStabilityScore Int?
  traitPositivity              String?
  traitPositivityScore         Int?
  traitSensitivity             String?
  traitSensitivityScore        Int?
  traitStressResponse          String?
  traitStressResponseScore     Int?

  dominantEmotions          String[]  @default([])
  engagementLevel           String?
  sentimentScore            Float?
```

- [ ] **Step 2: Add 5 new fields to AgentConversationSummary**

After `messageCount Int` (line 3074), before `updatedAt`, add:

```prisma
  healthScore               Int?
  engagementLevel           String?
  conflictLevel             String?
  dynamique                 String?
  dominantEmotions          String[]  @default([])
```

- [ ] **Step 3: Add AgentAnalysisSnapshot model**

After AgentConversationSummary (after line 3079), add:

```prisma
model AgentAnalysisSnapshot {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  conversationId  String   @db.ObjectId
  snapshotDate    DateTime

  overallTone     String
  healthScore     Int?
  engagementLevel String?
  conflictLevel   String?
  topTopics       String[]
  dominantEmotions String[]
  messageCountAtSnapshot Int

  participantSnapshots Json

  createdAt       DateTime @default(now())

  conversation    Conversation @relation(fields: [conversationId], references: [id])

  @@unique([conversationId, snapshotDate])
  @@index([conversationId])
  @@index([snapshotDate])
}
```

- [ ] **Step 4: Add ConversationMessageStats model**

After AgentAnalysisSnapshot, add:

```prisma
model ConversationMessageStats {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  conversationId  String   @unique @db.ObjectId

  totalMessages   Int      @default(0)
  totalWords      Int      @default(0)
  totalCharacters Int      @default(0)

  textMessages    Int      @default(0)
  imageCount      Int      @default(0)
  audioCount      Int      @default(0)
  videoCount      Int      @default(0)
  fileCount       Int      @default(0)
  locationCount   Int      @default(0)

  participantStats Json    @default("{}")
  dailyActivity   Json     @default("{}")
  hourlyDistribution Json  @default("{}")
  languageDistribution Json @default("{}")

  updatedAt       DateTime @updatedAt

  conversation    Conversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId])
}
```

- [ ] **Step 5: Add relation fields to Conversation model**

In the Conversation model (around line 364, after `agentUserRoles AgentUserRole[]`), add:

```prisma
  agentAnalysisSnapshots AgentAnalysisSnapshot[]
  conversationMessageStats ConversationMessageStats?
```

- [ ] **Step 6: Add relation to AgentConversationSummary**

The existing `AgentConversationSummary` model has no `conversation` relation. Add it:

```prisma
  conversation    Conversation @relation(fields: [conversationId], references: [id])
```

And in the Conversation model, add (if not already present):

```prisma
  agentConversationSummary AgentConversationSummary?
```

- [ ] **Step 7: Run Prisma generate and push**

```bash
cd /Users/smpceo/Documents/v2_meeshy
pnpm --filter=@meeshy/shared exec prisma generate
pnpm --filter=@meeshy/shared exec prisma db push
```

Also regenerate for agent service:

```bash
pnpm --filter=@meeshy/agent run generate
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(schema): add 23 psychological trait fields, AgentAnalysisSnapshot, ConversationMessageStats models

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: ToneProfile Type Extension (Agent Service)

**Files:**
- Modify: `services/agent/src/graph/state.ts:14-35`

- [ ] **Step 1: Extend ToneProfile type**

Replace the existing `ToneProfile` type (lines 14-35) with:

```typescript
export type TraitValue = {
  label: string;
  score: number;
};

export type ToneProfile = {
  userId: string;
  displayName: string;
  origin: 'observed' | 'archetype' | 'hybrid';
  archetypeId?: string;
  personaSummary: string;
  tone: string;
  vocabularyLevel: string;
  typicalLength: string;
  emojiUsage: string;
  topicsOfExpertise: string[];
  topicsAvoided: string[];
  relationshipMap: Record<string, string | { attitude: string; score: number; detail: string }>;
  catchphrases: string[];
  responseTriggers: string[];
  silenceTriggers: string[];
  commonEmojis: string[];
  reactionPatterns: string[];
  messagesAnalyzed: number;
  confidence: number;
  locked: boolean;
  traits?: {
    communication?: Record<string, TraitValue>;
    personality?: Record<string, TraitValue>;
    interpersonal?: Record<string, TraitValue>;
    emotional?: Record<string, TraitValue>;
  };
  dominantEmotions?: string[];
};
```

Key changes: `relationshipMap` accepts both old `string` and new structured format. Added optional `traits` and `dominantEmotions`.

- [ ] **Step 2: Verify build**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/agent && pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add services/agent/src/graph/state.ts
git commit -m "feat(agent): extend ToneProfile with 23 psychological traits and dominantEmotions

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Observer LLM Prompt Enhancement

**Files:**
- Modify: `services/agent/src/agents/observer.ts`

- [ ] **Step 1: Replace OBSERVER_SYSTEM_PROMPT**

Replace the entire `OBSERVER_SYSTEM_PROMPT` constant (lines 5-29) with:

```typescript
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
   - "tone": ton SPECIFIQUE (pas juste "neutre" — sois precis: "sarcastique et joueur", "enthousiaste et direct", "reserve mais bienveillant")
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
```

- [ ] **Step 2: Update LLM call maxTokens**

In the `createObserverNode` function, change `maxTokens: 1024` (line 68) to `maxTokens: 3072`:

```typescript
        maxTokens: 3072,
```

- [ ] **Step 3: Update parsed type**

Replace the parsed type (line 71) with:

```typescript
      let parsed: {
        summary?: string;
        overallTone?: string;
        healthScore?: number;
        engagementLevel?: string;
        conflictLevel?: string;
        dynamique?: string;
        dominantEmotions?: string[];
        profiles?: Record<string, unknown>;
      };
```

- [ ] **Step 4: Add trait extraction in profile mapping**

After line 139 (the closing of the `updatedProfiles[userId] = { ... }` assignment), add trait mapping. Replace the profile assignment block (lines 117-139) with:

```typescript
          const traitCategories = ['communication', 'personality', 'interpersonal', 'emotional'];
          const traits: ToneProfile['traits'] = {};
          for (const cat of traitCategories) {
            const catData = (p as Record<string, unknown>)[cat];
            if (catData && typeof catData === 'object') {
              traits[cat as keyof typeof traits] = catData as Record<string, TraitValue>;
            }
          }

          const profileDominantEmotions = Array.isArray(p.dominantEmotions)
            ? (p.dominantEmotions as unknown[]).filter((e): e is string => typeof e === 'string')
            : undefined;

          const rawRelMap = (p as Record<string, unknown>).relationshipMap;
          const relationshipMap: ToneProfile['relationshipMap'] = (
            rawRelMap && typeof rawRelMap === 'object' && !Array.isArray(rawRelMap)
          ) ? rawRelMap as ToneProfile['relationshipMap'] : existing?.relationshipMap ?? {};

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
            relationshipMap,
            catchphrases: mergeStringArrays(p.catchphrases, existing?.catchphrases),
            responseTriggers: mergeStringArrays(p.responseTriggers, existing?.responseTriggers),
            silenceTriggers: mergeStringArrays(p.silenceTriggers, existing?.silenceTriggers),
            commonEmojis: mergeStringArrays(p.commonEmojis, existing?.commonEmojis),
            reactionPatterns: mergeStringArrays(p.reactionPatterns, existing?.reactionPatterns),
            messagesAnalyzed,
            confidence: Math.min(messagesAnalyzed / 50, 1.0),
            locked: messagesAnalyzed >= 50,
            traits: Object.keys(traits).length > 0 ? traits : existing?.traits,
            dominantEmotions: profileDominantEmotions ?? existing?.dominantEmotions,
            _lastAnalyzedMessageId: latestMessageId,
          } as ToneProfile & { _lastAnalyzedMessageId?: string };
```

- [ ] **Step 5: Add import for TraitValue**

At line 1, update import:

```typescript
import type { ConversationState, ToneProfile, TraitValue } from '../graph/state';
```

- [ ] **Step 6: Update return to include conversation-level metrics**

After the `updatedProfiles` loop (around line 141), add conversation-level data to the return. Update the return block (lines 143-153):

```typescript
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
```

- [ ] **Step 7: Verify build**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/agent && pnpm run build
```

- [ ] **Step 8: Commit**

```bash
git add services/agent/src/agents/observer.ts
git commit -m "feat(agent): enrich observer prompt with 23 psychological dimensions and conversation metrics

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: mongo-persistence.ts — Persist New Fields

**Files:**
- Modify: `services/agent/src/memory/mongo-persistence.ts`

- [ ] **Step 1: Add trait-flattening helper at top of file**

After the imports (line 3), add:

```typescript
type TraitValue = { label: string; score: number };

const TRAIT_FIELDS = [
  'Verbosity', 'Formality', 'ResponseSpeed', 'InitiativeRate', 'Clarity', 'Argumentation',
  'SocialStyle', 'Assertiveness', 'Agreeableness', 'Humor', 'Emotionality', 'Openness',
  'Confidence', 'Creativity', 'Patience', 'Adaptability',
  'Empathy', 'Politeness', 'Leadership', 'ConflictStyle', 'Supportiveness', 'Diplomacy', 'TrustLevel',
  'EmotionalStability', 'Positivity', 'Sensitivity', 'StressResponse',
] as const;

const TRAIT_CATEGORY_MAP: Record<string, readonly string[]> = {
  communication: ['Verbosity', 'Formality', 'ResponseSpeed', 'InitiativeRate', 'Clarity', 'Argumentation'],
  personality: ['SocialStyle', 'Assertiveness', 'Agreeableness', 'Humor', 'Emotionality', 'Openness', 'Confidence', 'Creativity', 'Patience', 'Adaptability'],
  interpersonal: ['Empathy', 'Politeness', 'Leadership', 'ConflictStyle', 'Supportiveness', 'Diplomacy', 'TrustLevel'],
  emotional: ['EmotionalStability', 'Positivity', 'Sensitivity', 'StressResponse'],
};

function flattenTraits(traits?: ToneProfile['traits']): Record<string, string | number | null> {
  const flat: Record<string, string | number | null> = {};
  if (!traits) return flat;
  for (const [category, fields] of Object.entries(TRAIT_CATEGORY_MAP)) {
    const catTraits = traits[category as keyof typeof traits];
    if (!catTraits) continue;
    for (const field of fields) {
      const key = field.charAt(0).toLowerCase() + field.slice(1);
      const value = catTraits[key] as TraitValue | undefined;
      flat[`trait${field}`] = value?.label ?? null;
      flat[`trait${field}Score`] = value?.score ?? null;
    }
  }
  return flat;
}

function unflattenTraits(row: Record<string, any>): ToneProfile['traits'] {
  const traits: NonNullable<ToneProfile['traits']> = {};
  let hasAny = false;
  for (const [category, fields] of Object.entries(TRAIT_CATEGORY_MAP)) {
    const catTraits: Record<string, TraitValue> = {};
    for (const field of fields) {
      const label = row[`trait${field}`];
      const score = row[`trait${field}Score`];
      if (label != null && score != null) {
        const key = field.charAt(0).toLowerCase() + field.slice(1);
        catTraits[key] = { label, score };
        hasAny = true;
      }
    }
    if (Object.keys(catTraits).length > 0) {
      traits[category as keyof typeof traits] = catTraits;
    }
  }
  return hasAny ? traits : undefined;
}

function migrateRelationshipMap(raw: unknown): ToneProfile['relationshipMap'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: ToneProfile['relationshipMap'] = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[key] = { attitude: 'neutre', score: 0, detail: value };
    } else if (value && typeof value === 'object' && 'attitude' in value) {
      result[key] = value as { attitude: string; score: number; detail: string };
    }
  }
  return result;
}
```

- [ ] **Step 2: Update upsertUserRole to include new fields**

Replace the `upsertUserRole` method (lines 21-65) with:

```typescript
  async upsertUserRole(conversationId: string, profile: ToneProfile) {
    const traitData = flattenTraits(profile.traits);
    const baseData = {
      origin: profile.origin,
      archetypeId: profile.archetypeId ?? null,
      personaSummary: profile.personaSummary,
      tone: profile.tone,
      vocabularyLevel: profile.vocabularyLevel,
      typicalLength: profile.typicalLength,
      emojiUsage: profile.emojiUsage,
      topicsOfExpertise: profile.topicsOfExpertise,
      topicsAvoided: profile.topicsAvoided,
      relationshipMap: profile.relationshipMap,
      catchphrases: profile.catchphrases,
      responseTriggers: profile.responseTriggers,
      silenceTriggers: profile.silenceTriggers,
      commonEmojis: profile.commonEmojis,
      reactionPatterns: profile.reactionPatterns,
      messagesAnalyzed: profile.messagesAnalyzed,
      confidence: profile.confidence,
      locked: profile.locked,
      dominantEmotions: profile.dominantEmotions ?? [],
      ...traitData,
    };

    return this.prisma.agentUserRole.upsert({
      where: { userId_conversationId: { userId: profile.userId, conversationId } },
      create: { userId: profile.userId, conversationId, ...baseData },
      update: baseData,
    });
  }
```

- [ ] **Step 3: Update upsertSummary to include new fields**

Replace the `upsertSummary` method (lines 67-73) with:

```typescript
  async upsertSummary(
    conversationId: string,
    summary: string,
    topics: string[],
    tone: string,
    lastMessageId: string,
    messageCount: number,
    extra?: { healthScore?: number; engagementLevel?: string; conflictLevel?: string; dynamique?: string; dominantEmotions?: string[] }
  ) {
    const base = { summary, currentTopics: topics, overallTone: tone, lastMessageId, messageCount };
    const enriched = {
      ...base,
      ...(extra?.healthScore != null && { healthScore: extra.healthScore }),
      ...(extra?.engagementLevel && { engagementLevel: extra.engagementLevel }),
      ...(extra?.conflictLevel && { conflictLevel: extra.conflictLevel }),
      ...(extra?.dynamique && { dynamique: extra.dynamique }),
      ...(extra?.dominantEmotions && { dominantEmotions: extra.dominantEmotions }),
    };
    return this.prisma.agentConversationSummary.upsert({
      where: { conversationId },
      create: { conversationId, ...enriched },
      update: enriched,
    });
  }
```

- [ ] **Step 4: Update getControlledUsers to read and map new fields**

In the `getControlledUsers` method, update the role mapping (around line 142-163). Replace the `role:` object inside the `.map()` callback:

```typescript
      role: {
        userId: r.userId as string,
        displayName: userMap.get(r.userId as string)?.displayName ?? r.userId,
        origin: r.origin as ToneProfile['origin'],
        archetypeId: r.archetypeId ?? undefined,
        personaSummary: r.personaSummary,
        tone: r.tone,
        vocabularyLevel: r.vocabularyLevel,
        typicalLength: r.typicalLength,
        emojiUsage: r.emojiUsage,
        topicsOfExpertise: r.topicsOfExpertise,
        topicsAvoided: r.topicsAvoided,
        relationshipMap: migrateRelationshipMap(r.relationshipMap),
        catchphrases: r.catchphrases,
        responseTriggers: r.responseTriggers,
        silenceTriggers: r.silenceTriggers,
        commonEmojis: r.commonEmojis,
        reactionPatterns: r.reactionPatterns,
        messagesAnalyzed: r.messagesAnalyzed,
        confidence: r.confidence,
        locked: r.locked,
        traits: unflattenTraits(r as Record<string, any>),
        dominantEmotions: (r as any).dominantEmotions ?? [],
      },
```

- [ ] **Step 5: Find the caller of upsertSummary and pass extra fields**

Search for where `upsertSummary` is called. It's likely in the graph's post-processing or in the conversation scanner. The observer returns `_traceExtra` with the new fields. The caller must extract them and pass to `upsertSummary`. Find this call and add the extra parameter:

```typescript
await persistence.upsertSummary(
  conversationId,
  result.summary,
  topics,
  result._traceExtra?.overallTone ?? 'neutre',
  lastMessageId,
  messageCount,
  {
    healthScore: result._traceExtra?.healthScore,
    engagementLevel: result._traceExtra?.engagementLevel,
    conflictLevel: result._traceExtra?.conflictLevel,
    dynamique: result._traceExtra?.dynamique,
    dominantEmotions: result._traceExtra?.dominantEmotions,
  }
);
```

Note: You'll need to find the exact call site. Check `services/agent/src/scheduler/conversation-scanner.ts` or the graph execution code for the `upsertSummary` call.

- [ ] **Step 6: Verify build**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/agent && pnpm run build
```

- [ ] **Step 7: Commit**

```bash
git add services/agent/src/memory/mongo-persistence.ts
git commit -m "feat(agent): persist 46 trait fields, enriched summary, relationshipMap migration

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: ConversationMessageStatsService (Gateway)

**Files:**
- Create: `services/gateway/src/services/ConversationMessageStatsService.ts`

- [ ] **Step 1: Create the service file**

```typescript
import { PrismaClient } from '@meeshy/shared/prisma/client';

interface ParticipantStatEntry {
  messageCount: number;
  wordCount: number;
  characterCount: number;
  imageCount: number;
  audioCount: number;
  videoCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

export class ConversationMessageStatsService {
  private static instance: ConversationMessageStatsService | null = null;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 5 * 60 * 1000; // 5 min

  private constructor() {}

  static getInstance(): ConversationMessageStatsService {
    if (!this.instance) this.instance = new ConversationMessageStatsService();
    return this.instance;
  }

  invalidate(conversationId: string): void {
    this.cache.delete(conversationId);
  }

  async onNewMessage(
    prisma: PrismaClient,
    conversationId: string,
    senderId: string,
    content: string,
    attachmentTypes: string[],
    originalLanguage: string | null,
  ): Promise<void> {
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const charCount = content.length;
    const now = new Date();
    const dateKey = now.toISOString().split('T')[0];
    const hourKey = String(now.getUTCHours());

    const existing = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!existing) {
      await this.recompute(prisma, conversationId);
      return;
    }

    const participantStats = (existing.participantStats as Record<string, ParticipantStatEntry>) ?? {};
    const ps = participantStats[senderId] ?? {
      messageCount: 0, wordCount: 0, characterCount: 0,
      imageCount: 0, audioCount: 0, videoCount: 0,
      firstMessageAt: now.toISOString(), lastMessageAt: null,
    };
    ps.messageCount++;
    ps.wordCount += wordCount;
    ps.characterCount += charCount;
    ps.lastMessageAt = now.toISOString();
    for (const type of attachmentTypes) {
      if (type === 'image') ps.imageCount++;
      else if (type === 'audio') ps.audioCount++;
      else if (type === 'video') ps.videoCount++;
    }
    participantStats[senderId] = ps;

    const dailyActivity = (existing.dailyActivity as Record<string, number>) ?? {};
    dailyActivity[dateKey] = (dailyActivity[dateKey] ?? 0) + 1;

    const hourlyDistribution = (existing.hourlyDistribution as Record<string, number>) ?? {};
    hourlyDistribution[hourKey] = (hourlyDistribution[hourKey] ?? 0) + 1;

    const langDist = (existing.languageDistribution as Record<string, number>) ?? {};
    if (originalLanguage) {
      langDist[originalLanguage] = (langDist[originalLanguage] ?? 0) + 1;
    }

    const imageInc = attachmentTypes.filter(t => t === 'image').length;
    const audioInc = attachmentTypes.filter(t => t === 'audio').length;
    const videoInc = attachmentTypes.filter(t => t === 'video').length;
    const fileInc = attachmentTypes.filter(t => t === 'file').length;
    const locationInc = attachmentTypes.filter(t => t === 'location').length;
    const isTextOnly = attachmentTypes.length === 0;

    await prisma.conversationMessageStats.update({
      where: { conversationId },
      data: {
        totalMessages: { increment: 1 },
        totalWords: { increment: wordCount },
        totalCharacters: { increment: charCount },
        textMessages: isTextOnly ? { increment: 1 } : undefined,
        imageCount: imageInc > 0 ? { increment: imageInc } : undefined,
        audioCount: audioInc > 0 ? { increment: audioInc } : undefined,
        videoCount: videoInc > 0 ? { increment: videoInc } : undefined,
        fileCount: fileInc > 0 ? { increment: fileInc } : undefined,
        locationCount: locationInc > 0 ? { increment: locationInc } : undefined,
        participantStats,
        dailyActivity: this.pruneDailyActivity(dailyActivity),
        hourlyDistribution,
        languageDistribution: langDist,
      },
    });

    this.invalidate(conversationId);
  }

  async onMessageEdited(
    prisma: PrismaClient,
    conversationId: string,
    senderId: string,
    oldContent: string,
    newContent: string,
  ): Promise<void> {
    const oldWords = oldContent.split(/\s+/).filter(Boolean).length;
    const newWords = newContent.split(/\s+/).filter(Boolean).length;
    const oldChars = oldContent.length;
    const newChars = newContent.length;
    const wordDiff = newWords - oldWords;
    const charDiff = newChars - oldChars;

    if (wordDiff === 0 && charDiff === 0) return;

    const existing = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!existing) {
      await this.recompute(prisma, conversationId);
      return;
    }

    const participantStats = (existing.participantStats as Record<string, ParticipantStatEntry>) ?? {};
    const ps = participantStats[senderId];
    if (ps) {
      ps.wordCount = Math.max(0, ps.wordCount + wordDiff);
      ps.characterCount = Math.max(0, ps.characterCount + charDiff);
      participantStats[senderId] = ps;
    }

    await prisma.conversationMessageStats.update({
      where: { conversationId },
      data: {
        totalWords: { increment: wordDiff },
        totalCharacters: { increment: charDiff },
        participantStats,
      },
    });

    this.invalidate(conversationId);
  }

  async onMessageDeleted(
    prisma: PrismaClient,
    conversationId: string,
    senderId: string,
    content: string,
    attachmentTypes: string[],
  ): Promise<void> {
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const charCount = content.length;

    const existing = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!existing) return; // Nothing to decrement

    const participantStats = (existing.participantStats as Record<string, ParticipantStatEntry>) ?? {};
    const ps = participantStats[senderId];
    if (ps) {
      ps.messageCount = Math.max(0, ps.messageCount - 1);
      ps.wordCount = Math.max(0, ps.wordCount - wordCount);
      ps.characterCount = Math.max(0, ps.characterCount - charCount);
      for (const type of attachmentTypes) {
        if (type === 'image') ps.imageCount = Math.max(0, ps.imageCount - 1);
        else if (type === 'audio') ps.audioCount = Math.max(0, ps.audioCount - 1);
        else if (type === 'video') ps.videoCount = Math.max(0, ps.videoCount - 1);
      }
      participantStats[senderId] = ps;
    }

    const imageDec = attachmentTypes.filter(t => t === 'image').length;
    const audioDec = attachmentTypes.filter(t => t === 'audio').length;
    const videoDec = attachmentTypes.filter(t => t === 'video').length;
    const fileDec = attachmentTypes.filter(t => t === 'file').length;
    const locationDec = attachmentTypes.filter(t => t === 'location').length;
    const isTextOnly = attachmentTypes.length === 0;

    await prisma.conversationMessageStats.update({
      where: { conversationId },
      data: {
        totalMessages: { decrement: 1 },
        totalWords: { decrement: wordCount },
        totalCharacters: { decrement: charCount },
        textMessages: isTextOnly ? { decrement: 1 } : undefined,
        imageCount: imageDec > 0 ? { decrement: imageDec } : undefined,
        audioCount: audioDec > 0 ? { decrement: audioDec } : undefined,
        videoCount: videoDec > 0 ? { decrement: videoDec } : undefined,
        fileCount: fileDec > 0 ? { decrement: fileDec } : undefined,
        locationCount: locationDec > 0 ? { decrement: locationDec } : undefined,
        participantStats,
      },
    });

    this.invalidate(conversationId);
  }

  async getStats(prisma: PrismaClient, conversationId: string): Promise<Record<string, unknown>> {
    const cached = this.cache.get(conversationId);
    if (cached && Date.now() < cached.expiresAt) return cached.data;

    let row = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!row) {
      row = await this.recompute(prisma, conversationId);
    }

    const data = {
      conversationId,
      totalMessages: row.totalMessages,
      totalWords: row.totalWords,
      totalCharacters: row.totalCharacters,
      contentTypes: {
        text: row.textMessages,
        image: row.imageCount,
        audio: row.audioCount,
        video: row.videoCount,
        file: row.fileCount,
        location: row.locationCount,
      },
      participantStats: row.participantStats,
      dailyActivity: row.dailyActivity,
      hourlyDistribution: row.hourlyDistribution,
      languageDistribution: row.languageDistribution,
      updatedAt: row.updatedAt.toISOString(),
    };

    this.cache.set(conversationId, { data, expiresAt: Date.now() + this.ttlMs });
    return data;
  }

  async recompute(prisma: PrismaClient, conversationId: string) {
    const messages = await prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      select: {
        content: true,
        senderId: true,
        createdAt: true,
        originalLanguage: true,
        attachments: { select: { type: true } },
        sender: { select: { userId: true } },
      },
    });

    let totalMessages = 0;
    let totalWords = 0;
    let totalCharacters = 0;
    let textMessages = 0;
    let imageCount = 0;
    let audioCount = 0;
    let videoCount = 0;
    let fileCount = 0;
    let locationCount = 0;
    const participantStats: Record<string, ParticipantStatEntry> = {};
    const dailyActivity: Record<string, number> = {};
    const hourlyDistribution: Record<string, number> = {};
    const languageDistribution: Record<string, number> = {};

    for (const msg of messages) {
      totalMessages++;
      const content = msg.content ?? '';
      const words = content.split(/\s+/).filter(Boolean).length;
      const chars = content.length;
      totalWords += words;
      totalCharacters += chars;

      const senderId = msg.sender?.userId ?? msg.senderId;
      if (!participantStats[senderId]) {
        participantStats[senderId] = {
          messageCount: 0, wordCount: 0, characterCount: 0,
          imageCount: 0, audioCount: 0, videoCount: 0,
          firstMessageAt: msg.createdAt.toISOString(), lastMessageAt: null,
        };
      }
      const ps = participantStats[senderId];
      ps.messageCount++;
      ps.wordCount += words;
      ps.characterCount += chars;
      ps.lastMessageAt = msg.createdAt.toISOString();
      if (!ps.firstMessageAt || msg.createdAt.toISOString() < ps.firstMessageAt) {
        ps.firstMessageAt = msg.createdAt.toISOString();
      }

      const attTypes = (msg.attachments ?? []).map(a => a.type);
      if (attTypes.length === 0) textMessages++;
      for (const t of attTypes) {
        if (t === 'image') { imageCount++; ps.imageCount++; }
        else if (t === 'audio') { audioCount++; ps.audioCount++; }
        else if (t === 'video') { videoCount++; ps.videoCount++; }
        else if (t === 'file') { fileCount++; }
        else if (t === 'location') { locationCount++; }
      }

      const dateKey = msg.createdAt.toISOString().split('T')[0];
      dailyActivity[dateKey] = (dailyActivity[dateKey] ?? 0) + 1;

      const hourKey = String(msg.createdAt.getUTCHours());
      hourlyDistribution[hourKey] = (hourlyDistribution[hourKey] ?? 0) + 1;

      if (msg.originalLanguage) {
        languageDistribution[msg.originalLanguage] = (languageDistribution[msg.originalLanguage] ?? 0) + 1;
      }
    }

    return prisma.conversationMessageStats.upsert({
      where: { conversationId },
      create: {
        conversationId,
        totalMessages, totalWords, totalCharacters, textMessages,
        imageCount, audioCount, videoCount, fileCount, locationCount,
        participantStats, dailyActivity: this.pruneDailyActivity(dailyActivity),
        hourlyDistribution, languageDistribution,
      },
      update: {
        totalMessages, totalWords, totalCharacters, textMessages,
        imageCount, audioCount, videoCount, fileCount, locationCount,
        participantStats, dailyActivity: this.pruneDailyActivity(dailyActivity),
        hourlyDistribution, languageDistribution,
      },
    });
  }

  private pruneDailyActivity(daily: Record<string, number>): Record<string, number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const pruned: Record<string, number> = {};
    for (const [date, count] of Object.entries(daily)) {
      if (date >= cutoffStr) pruned[date] = count;
    }
    return pruned;
  }
}

export const conversationMessageStatsService = ConversationMessageStatsService.getInstance();
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add services/gateway/src/services/ConversationMessageStatsService.ts
git commit -m "feat(gateway): add ConversationMessageStatsService with incremental aggregation

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Hook Stats into Message Handlers

**Files:**
- Modify: `services/gateway/src/socketio/handlers/MessageHandler.ts`
- Modify: `services/gateway/src/routes/conversations/messages-advanced.ts`

- [ ] **Step 1: Add import to MessageHandler.ts**

After the existing `conversationStatsService` import (line 33), add:

```typescript
import { conversationMessageStatsService } from '../../services/ConversationMessageStatsService';
```

- [ ] **Step 2: Hook stats after message creation in MessageHandler.ts**

Find the location after `conversationStatsService.updateOnNewMessage(...)` call (around line 377-381). After the `Promise.allSettled` block, add a fire-and-forget stats update:

```typescript
        // Incremental message stats update
        conversationMessageStatsService.onNewMessage(
          this.prisma,
          conversationId,
          userId,
          data.content ?? '',
          [], // text-only message has no attachments
          null,
        ).catch(err => console.error('[MessageHandler] Stats update error:', err));
```

Also find `handleMessageSendWithAttachments` and add a similar hook after message creation, extracting attachment types:

```typescript
        const attachmentTypes = (savedAttachments ?? []).map((a: { type: string }) => a.type);
        conversationMessageStatsService.onNewMessage(
          this.prisma,
          conversationId,
          userId,
          data.content ?? '',
          attachmentTypes,
          null,
        ).catch(err => console.error('[MessageHandler] Stats update error:', err));
```

- [ ] **Step 3: Add import to messages-advanced.ts**

At the top of `messages-advanced.ts`, add:

```typescript
import { conversationMessageStatsService } from '../../services/ConversationMessageStatsService';
```

- [ ] **Step 4: Hook stats on edit in messages-advanced.ts**

In the PUT (edit) handler, after the message update succeeds (around line 470, before the Socket.IO broadcast), add:

```typescript
      // Update message stats for word/char count change
      conversationMessageStatsService.onMessageEdited(
        prisma,
        conversationId,
        userId,
        existingMessage.content ?? '',
        processedContent,
      ).catch(err => logger.error('[MESSAGES] Stats edit update error:', err));
```

- [ ] **Step 5: Hook stats on delete in messages-advanced.ts**

In the DELETE handler, after the soft delete succeeds (around line 610, before the Socket.IO broadcast), add:

```typescript
      // Update message stats for deletion
      const attachmentTypes = (existingMessage.attachments ?? []).map((a: { type?: string }) => a.type ?? 'file');
      conversationMessageStatsService.onMessageDeleted(
        prisma,
        conversationId,
        existingMessage.sender?.userId ?? '',
        existingMessage.content ?? '',
        attachmentTypes,
      ).catch(err => logger.error('[MESSAGES] Stats delete update error:', err));
```

Note: The delete handler already fetches attachments in the existing `include` block (line 548), so `existingMessage.attachments` is available. But the existing select only has `{ id: true }`. Extend it to include `type`:

Change line ~548: `attachments: { select: { id: true } }` to `attachments: { select: { id: true, type: true } }`

Also add `content: true` to the message select if not already included (check the existing `findFirst` query).

- [ ] **Step 6: Verify build**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm run build
```

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src/socketio/handlers/MessageHandler.ts services/gateway/src/routes/conversations/messages-advanced.ts
git commit -m "feat(gateway): hook ConversationMessageStatsService into message new/edit/delete flows

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Stats REST Endpoint

**Files:**
- Create: `services/gateway/src/routes/conversations/stats.ts`
- Modify: `services/gateway/src/routes/conversations/index.ts`

- [ ] **Step 1: Create stats.ts route file**

```typescript
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { conversationMessageStatsService } from '../../services/ConversationMessageStatsService';
import { resolveConversationId, canAccessConversation } from './core';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendNotFound, sendForbidden, sendInternalError } from '../../utils/response';

export function registerStatsRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
) {
  fastify.get<{ Params: { id: string } }>('/conversations/:id/stats', {
    schema: {
      description: 'Get pre-aggregated message statistics for a conversation',
      tags: ['conversations', 'analytics'],
      summary: 'Get conversation message stats',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    preValidation: [requiredAuth],
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      const { id } = request.params;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) return sendNotFound(reply, 'Conversation not found');

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) return sendForbidden(reply, 'Access denied');

      const stats = await conversationMessageStatsService.getStats(prisma, conversationId);

      // Enrich participantStats with usernames
      const rawParticipants = (stats.participantStats ?? {}) as Record<string, any>;
      const userIds = Object.keys(rawParticipants);
      const users = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, displayName: true },
          })
        : [];
      const userMap = new Map(users.map(u => [u.id, u]));

      const participantStats = userIds.map(uid => {
        const user = userMap.get(uid);
        const ps = rawParticipants[uid];
        return {
          userId: uid,
          name: user?.displayName ?? user?.username ?? null,
          messageCount: ps.messageCount ?? 0,
          wordCount: ps.wordCount ?? 0,
          firstMessageAt: ps.firstMessageAt ?? null,
          lastMessageAt: ps.lastMessageAt ?? null,
        };
      });

      const dailyRaw = (stats.dailyActivity ?? {}) as Record<string, number>;
      const dailyActivity = Object.entries(dailyRaw)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      const langRaw = (stats.languageDistribution ?? {}) as Record<string, number>;
      const languageDistribution = Object.entries(langRaw)
        .sort(([, a], [, b]) => b - a)
        .map(([language, count]) => ({ language, count }));

      return sendSuccess(reply, {
        ...stats,
        participantStats,
        dailyActivity,
        languageDistribution,
      });
    } catch (error) {
      console.error('Error fetching conversation stats:', error);
      sendInternalError(reply, 'Error fetching conversation stats');
    }
  });
}
```

- [ ] **Step 2: Register stats routes in index.ts**

In `services/gateway/src/routes/conversations/index.ts`, add import and registration:

After `import { registerBanRoutes } from './ban';` add:
```typescript
import { registerStatsRoutes } from './stats';
```

After `registerBanRoutes(fastify, prisma, optionalAuth, requiredAuth);` add:
```typescript
  registerStatsRoutes(fastify, prisma, requiredAuth);
```

- [ ] **Step 3: Check that `resolveConversationId` and `canAccessConversation` are exported from core.ts**

If they aren't exported, export them. Check `core.ts` for their declarations.

- [ ] **Step 4: Verify build**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm run build
```

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/conversations/stats.ts services/gateway/src/routes/conversations/index.ts
git commit -m "feat(gateway): add GET /conversations/:id/stats endpoint with pre-aggregated message stats

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Enrich /analysis Endpoint

**Files:**
- Modify: `services/gateway/src/routes/conversations/core.ts:1159-1231`

- [ ] **Step 1: Remove select clause from agentUserRole.findMany**

Replace lines 1163-1178 (the `prisma.agentUserRole.findMany` with explicit `select`) — remove the `select` block entirely to fetch all fields:

```typescript
        prisma.agentUserRole.findMany({
          where: { conversationId },
        }),
```

- [ ] **Step 2: Fetch history snapshots in parallel**

Add a third parallel query in the `Promise.all` (line 1159):

```typescript
      const [summary, roles, snapshots] = await Promise.all([
        prisma.agentConversationSummary.findUnique({
          where: { conversationId }
        }),
        prisma.agentUserRole.findMany({
          where: { conversationId },
        }),
        prisma.agentAnalysisSnapshot.findMany({
          where: {
            conversationId,
            snapshotDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { snapshotDate: 'asc' },
        }),
      ]);
```

- [ ] **Step 3: Map traits from flat DB fields to nested structure in participantProfiles**

Replace the `participantProfiles` mapping (lines 1193-1212) to include traits:

```typescript
      const TRAIT_FIELDS_MAP: Record<string, string[]> = {
        communication: ['Verbosity', 'Formality', 'ResponseSpeed', 'InitiativeRate', 'Clarity', 'Argumentation'],
        personality: ['SocialStyle', 'Assertiveness', 'Agreeableness', 'Humor', 'Emotionality', 'Openness', 'Confidence', 'Creativity', 'Patience', 'Adaptability'],
        interpersonal: ['Empathy', 'Politeness', 'Leadership', 'ConflictStyle', 'Supportiveness', 'Diplomacy', 'TrustLevel'],
        emotional: ['EmotionalStability', 'Positivity', 'Sensitivity', 'StressResponse'],
      };

      function buildTraits(role: Record<string, any>) {
        const traits: Record<string, Record<string, { label: string; score: number }>> = {};
        let hasAny = false;
        for (const [cat, fields] of Object.entries(TRAIT_FIELDS_MAP)) {
          const catTraits: Record<string, { label: string; score: number }> = {};
          for (const field of fields) {
            const label = role[`trait${field}`];
            const score = role[`trait${field}Score`];
            if (label != null && score != null) {
              const key = field.charAt(0).toLowerCase() + field.slice(1);
              catTraits[key] = { label, score };
              hasAny = true;
            }
          }
          if (Object.keys(catTraits).length > 0) traits[cat] = catTraits;
        }
        return hasAny ? traits : null;
      }

      const participantProfiles = roles.map((role: Record<string, any>) => {
        const user = userMap.get(role.userId);
        return {
          userId: role.userId,
          username: user?.username ?? null,
          displayName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username : null,
          avatar: user?.avatar ?? null,
          personaSummary: role.personaSummary,
          tone: role.tone,
          vocabularyLevel: role.vocabularyLevel,
          typicalLength: role.typicalLength,
          emojiUsage: role.emojiUsage,
          topicsOfExpertise: role.topicsOfExpertise,
          catchphrases: role.catchphrases,
          commonEmojis: role.commonEmojis,
          reactionPatterns: role.reactionPatterns,
          traits: buildTraits(role),
          dominantEmotions: role.dominantEmotions ?? [],
          relationshipMap: role.relationshipMap ?? {},
          sentimentScore: role.sentimentScore ?? null,
          engagementLevel: role.engagementLevel ?? null,
          messagesAnalyzed: role.messagesAnalyzed,
          confidence: role.confidence,
          locked: role.locked,
        };
      });
```

- [ ] **Step 4: Add enriched summary and history to response**

Replace the return block (lines 1214-1224):

```typescript
      return sendSuccess(reply, {
        conversationId,
        summary: summary ? {
          text: summary.summary,
          currentTopics: summary.currentTopics,
          overallTone: summary.overallTone,
          healthScore: summary.healthScore ?? null,
          engagementLevel: summary.engagementLevel ?? null,
          conflictLevel: summary.conflictLevel ?? null,
          dynamique: summary.dynamique ?? null,
          dominantEmotions: summary.dominantEmotions ?? [],
          messageCount: summary.messageCount,
          updatedAt: summary.updatedAt,
        } : null,
        participantProfiles,
        history: snapshots.map(s => ({
          snapshotDate: s.snapshotDate.toISOString(),
          overallTone: s.overallTone,
          healthScore: s.healthScore,
          engagementLevel: s.engagementLevel,
          conflictLevel: s.conflictLevel,
          topTopics: s.topTopics,
          dominantEmotions: s.dominantEmotions,
          messageCountAtSnapshot: s.messageCountAtSnapshot,
          participantSnapshots: s.participantSnapshots,
        })),
      });
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm run build
```

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/routes/conversations/core.ts
git commit -m "feat(gateway): enrich /analysis endpoint with traits, history snapshots, conversation metrics

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Daily Snapshot Cron (Agent Service)

**Files:**
- Create: `services/agent/src/cron/daily-snapshot.ts`

- [ ] **Step 1: Create the cron file**

```typescript
import { PrismaClient } from '@meeshy/shared/prisma/client';

export async function runDailySnapshot(prisma: PrismaClient): Promise<number> {
  const now = new Date();
  const snapshotDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const summaries = await prisma.agentConversationSummary.findMany({
    where: { updatedAt: { gte: cutoff } },
  });

  let created = 0;

  for (const summary of summaries) {
    try {
      const roles = await prisma.agentUserRole.findMany({
        where: { conversationId: summary.conversationId },
        select: {
          userId: true,
          sentimentScore: true,
          engagementLevel: true,
          traitPositivityScore: true,
          traitSocialStyleScore: true,
          traitAssertivenessScore: true,
          user: { select: { displayName: true, username: true } },
        },
      });

      const messageStats = await prisma.conversationMessageStats.findUnique({
        where: { conversationId: summary.conversationId },
        select: { totalMessages: true },
      });

      const participantSnapshots = roles.map(r => ({
        userId: r.userId,
        displayName: (r as any).user?.displayName ?? (r as any).user?.username ?? null,
        sentimentScore: r.sentimentScore ?? null,
        positivityScore: r.traitPositivityScore ?? null,
        socialStyleScore: r.traitSocialStyleScore ?? null,
        assertivenessScore: r.traitAssertivenessScore ?? null,
        engagementLevel: r.engagementLevel ?? null,
      }));

      await prisma.agentAnalysisSnapshot.upsert({
        where: {
          conversationId_snapshotDate: {
            conversationId: summary.conversationId,
            snapshotDate,
          },
        },
        create: {
          conversationId: summary.conversationId,
          snapshotDate,
          overallTone: summary.overallTone,
          healthScore: (summary as any).healthScore ?? null,
          engagementLevel: (summary as any).engagementLevel ?? null,
          conflictLevel: (summary as any).conflictLevel ?? null,
          topTopics: summary.currentTopics,
          dominantEmotions: (summary as any).dominantEmotions ?? [],
          messageCountAtSnapshot: messageStats?.totalMessages ?? summary.messageCount,
          participantSnapshots,
        },
        update: {
          overallTone: summary.overallTone,
          healthScore: (summary as any).healthScore ?? null,
          engagementLevel: (summary as any).engagementLevel ?? null,
          conflictLevel: (summary as any).conflictLevel ?? null,
          topTopics: summary.currentTopics,
          dominantEmotions: (summary as any).dominantEmotions ?? [],
          messageCountAtSnapshot: messageStats?.totalMessages ?? summary.messageCount,
          participantSnapshots,
        },
      });

      created++;
    } catch (error) {
      console.error(`[DailySnapshot] Error for conversation ${summary.conversationId}:`, error);
    }
  }

  // Cleanup: delete snapshots older than 365 days
  const retentionCutoff = new Date();
  retentionCutoff.setDate(retentionCutoff.getDate() - 365);
  await prisma.agentAnalysisSnapshot.deleteMany({
    where: { snapshotDate: { lt: retentionCutoff } },
  });

  return created;
}
```

- [ ] **Step 2: Register the cron in the agent service entry point**

Find the agent service entry point (likely `services/agent/src/index.ts` or `services/agent/src/server.ts`). Add:

```typescript
import { runDailySnapshot } from './cron/daily-snapshot';

// Schedule daily snapshot at midnight UTC
const SNAPSHOT_INTERVAL = 60 * 60 * 1000; // 1h
let lastSnapshotDate = '';

setInterval(async () => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  if (now.getUTCHours() === 0 && today !== lastSnapshotDate) {
    lastSnapshotDate = today;
    try {
      const count = await runDailySnapshot(prisma);
      console.log(`[DailySnapshot] Created ${count} snapshots for ${today}`);
    } catch (error) {
      console.error('[DailySnapshot] Error:', error);
    }
  }
}, SNAPSHOT_INTERVAL);
```

Note: You'll need to find the actual entry point file and how `prisma` is instantiated there. Adapt accordingly.

- [ ] **Step 3: Verify build**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/agent && pnpm run build
```

- [ ] **Step 4: Commit**

```bash
git add services/agent/src/cron/daily-snapshot.ts
git commit -m "feat(agent): add daily snapshot cron for historical analysis tracking

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Swift SDK Types — Update AgentAnalysisModels

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/AgentAnalysisModels.swift`

- [ ] **Step 1: Replace entire file with enriched types**

Replace the entire content of `AgentAnalysisModels.swift`:

```swift
import Foundation

// MARK: - Conversation Analysis (Agent)

public struct ConversationAnalysis: Codable, Sendable {
    public let conversationId: String
    public let summary: ConversationSummaryAnalysis?
    public let participantProfiles: [ParticipantProfile]
    public let history: [AnalysisSnapshot]

    public init(
        conversationId: String,
        summary: ConversationSummaryAnalysis? = nil,
        participantProfiles: [ParticipantProfile] = [],
        history: [AnalysisSnapshot] = []
    ) {
        self.conversationId = conversationId
        self.summary = summary
        self.participantProfiles = participantProfiles
        self.history = history
    }
}

// MARK: - Conversation Summary

public struct ConversationSummaryAnalysis: Codable, Sendable {
    public let text: String
    public let currentTopics: [String]
    public let overallTone: String
    public let healthScore: Int?
    public let engagementLevel: String?
    public let conflictLevel: String?
    public let dynamique: String?
    public let dominantEmotions: [String]
    public let messageCount: Int
    public let updatedAt: String?

    public init(
        text: String,
        currentTopics: [String] = [],
        overallTone: String = "",
        healthScore: Int? = nil,
        engagementLevel: String? = nil,
        conflictLevel: String? = nil,
        dynamique: String? = nil,
        dominantEmotions: [String] = [],
        messageCount: Int = 0,
        updatedAt: String? = nil
    ) {
        self.text = text
        self.currentTopics = currentTopics
        self.overallTone = overallTone
        self.healthScore = healthScore
        self.engagementLevel = engagementLevel
        self.conflictLevel = conflictLevel
        self.dynamique = dynamique
        self.dominantEmotions = dominantEmotions
        self.messageCount = messageCount
        self.updatedAt = updatedAt
    }
}

// MARK: - Trait Score

public struct TraitScore: Codable, Sendable {
    public let label: String
    public let score: Int

    public init(label: String, score: Int) {
        self.label = label
        self.score = score
    }
}

// MARK: - Trait Categories

public struct CommunicationTraits: Codable, Sendable {
    public let verbosity: TraitScore?
    public let formality: TraitScore?
    public let responseSpeed: TraitScore?
    public let initiativeRate: TraitScore?
    public let clarity: TraitScore?
    public let argumentation: TraitScore?

    public init(verbosity: TraitScore? = nil, formality: TraitScore? = nil,
                responseSpeed: TraitScore? = nil, initiativeRate: TraitScore? = nil,
                clarity: TraitScore? = nil, argumentation: TraitScore? = nil) {
        self.verbosity = verbosity; self.formality = formality
        self.responseSpeed = responseSpeed; self.initiativeRate = initiativeRate
        self.clarity = clarity; self.argumentation = argumentation
    }
}

public struct PersonalityTraits: Codable, Sendable {
    public let socialStyle: TraitScore?
    public let assertiveness: TraitScore?
    public let agreeableness: TraitScore?
    public let humor: TraitScore?
    public let emotionality: TraitScore?
    public let openness: TraitScore?
    public let confidence: TraitScore?
    public let creativity: TraitScore?
    public let patience: TraitScore?
    public let adaptability: TraitScore?

    public init(socialStyle: TraitScore? = nil, assertiveness: TraitScore? = nil,
                agreeableness: TraitScore? = nil, humor: TraitScore? = nil,
                emotionality: TraitScore? = nil, openness: TraitScore? = nil,
                confidence: TraitScore? = nil, creativity: TraitScore? = nil,
                patience: TraitScore? = nil, adaptability: TraitScore? = nil) {
        self.socialStyle = socialStyle; self.assertiveness = assertiveness
        self.agreeableness = agreeableness; self.humor = humor
        self.emotionality = emotionality; self.openness = openness
        self.confidence = confidence; self.creativity = creativity
        self.patience = patience; self.adaptability = adaptability
    }
}

public struct InterpersonalTraits: Codable, Sendable {
    public let empathy: TraitScore?
    public let politeness: TraitScore?
    public let leadership: TraitScore?
    public let conflictStyle: TraitScore?
    public let supportiveness: TraitScore?
    public let diplomacy: TraitScore?
    public let trustLevel: TraitScore?

    public init(empathy: TraitScore? = nil, politeness: TraitScore? = nil,
                leadership: TraitScore? = nil, conflictStyle: TraitScore? = nil,
                supportiveness: TraitScore? = nil, diplomacy: TraitScore? = nil,
                trustLevel: TraitScore? = nil) {
        self.empathy = empathy; self.politeness = politeness
        self.leadership = leadership; self.conflictStyle = conflictStyle
        self.supportiveness = supportiveness; self.diplomacy = diplomacy
        self.trustLevel = trustLevel
    }
}

public struct EmotionalTraits: Codable, Sendable {
    public let emotionalStability: TraitScore?
    public let positivity: TraitScore?
    public let sensitivity: TraitScore?
    public let stressResponse: TraitScore?

    public init(emotionalStability: TraitScore? = nil, positivity: TraitScore? = nil,
                sensitivity: TraitScore? = nil, stressResponse: TraitScore? = nil) {
        self.emotionalStability = emotionalStability; self.positivity = positivity
        self.sensitivity = sensitivity; self.stressResponse = stressResponse
    }
}

public struct ParticipantTraits: Codable, Sendable {
    public let communication: CommunicationTraits?
    public let personality: PersonalityTraits?
    public let interpersonal: InterpersonalTraits?
    public let emotional: EmotionalTraits?

    public init(communication: CommunicationTraits? = nil, personality: PersonalityTraits? = nil,
                interpersonal: InterpersonalTraits? = nil, emotional: EmotionalTraits? = nil) {
        self.communication = communication; self.personality = personality
        self.interpersonal = interpersonal; self.emotional = emotional
    }
}

// MARK: - Relationship

public struct RelationshipAttitude: Codable, Sendable {
    public let attitude: String
    public let score: Int
    public let detail: String

    public init(attitude: String, score: Int, detail: String) {
        self.attitude = attitude; self.score = score; self.detail = detail
    }
}

// MARK: - Participant Profile (Agent Analysis)

public struct ParticipantProfile: Codable, Identifiable, Sendable {
    public var id: String { userId }
    public let userId: String
    public let username: String?
    public let displayName: String?
    public let avatar: String?
    public let personaSummary: String
    public let tone: String
    public let vocabularyLevel: String
    public let typicalLength: String
    public let emojiUsage: String
    public let topicsOfExpertise: [String]
    public let catchphrases: [String]
    public let commonEmojis: [String]
    public let reactionPatterns: [String]
    public let traits: ParticipantTraits?
    public let dominantEmotions: [String]
    public let relationshipMap: [String: RelationshipAttitude]?
    public let sentimentScore: Double?
    public let engagementLevel: String?
    public let messagesAnalyzed: Int
    public let confidence: Double
    public let locked: Bool?

    public init(
        userId: String, username: String? = nil, displayName: String? = nil,
        avatar: String? = nil, personaSummary: String = "", tone: String = "",
        vocabularyLevel: String = "", typicalLength: String = "",
        emojiUsage: String = "", topicsOfExpertise: [String] = [],
        catchphrases: [String] = [], commonEmojis: [String] = [],
        reactionPatterns: [String] = [], traits: ParticipantTraits? = nil,
        dominantEmotions: [String] = [], relationshipMap: [String: RelationshipAttitude]? = nil,
        sentimentScore: Double? = nil, engagementLevel: String? = nil,
        messagesAnalyzed: Int = 0, confidence: Double = 0, locked: Bool? = nil
    ) {
        self.userId = userId; self.username = username
        self.displayName = displayName; self.avatar = avatar
        self.personaSummary = personaSummary; self.tone = tone
        self.vocabularyLevel = vocabularyLevel; self.typicalLength = typicalLength
        self.emojiUsage = emojiUsage; self.topicsOfExpertise = topicsOfExpertise
        self.catchphrases = catchphrases; self.commonEmojis = commonEmojis
        self.reactionPatterns = reactionPatterns; self.traits = traits
        self.dominantEmotions = dominantEmotions; self.relationshipMap = relationshipMap
        self.sentimentScore = sentimentScore; self.engagementLevel = engagementLevel
        self.messagesAnalyzed = messagesAnalyzed; self.confidence = confidence
        self.locked = locked
    }
}

// MARK: - History Snapshot

public struct AnalysisSnapshot: Codable, Identifiable, Sendable {
    public var id: String { snapshotDate }
    public let snapshotDate: String
    public let overallTone: String
    public let healthScore: Int?
    public let engagementLevel: String?
    public let conflictLevel: String?
    public let topTopics: [String]
    public let dominantEmotions: [String]
    public let messageCountAtSnapshot: Int
    public let participantSnapshots: [ParticipantSnapshot]

    public init(
        snapshotDate: String, overallTone: String = "", healthScore: Int? = nil,
        engagementLevel: String? = nil, conflictLevel: String? = nil,
        topTopics: [String] = [], dominantEmotions: [String] = [],
        messageCountAtSnapshot: Int = 0, participantSnapshots: [ParticipantSnapshot] = []
    ) {
        self.snapshotDate = snapshotDate; self.overallTone = overallTone
        self.healthScore = healthScore; self.engagementLevel = engagementLevel
        self.conflictLevel = conflictLevel; self.topTopics = topTopics
        self.dominantEmotions = dominantEmotions
        self.messageCountAtSnapshot = messageCountAtSnapshot
        self.participantSnapshots = participantSnapshots
    }
}

public struct ParticipantSnapshot: Codable, Sendable {
    public let userId: String
    public let displayName: String?
    public let sentimentScore: Double?
    public let positivityScore: Int?
    public let socialStyleScore: Int?
    public let assertivenessScore: Int?

    public init(userId: String, displayName: String? = nil, sentimentScore: Double? = nil,
                positivityScore: Int? = nil, socialStyleScore: Int? = nil,
                assertivenessScore: Int? = nil) {
        self.userId = userId; self.displayName = displayName
        self.sentimentScore = sentimentScore; self.positivityScore = positivityScore
        self.socialStyleScore = socialStyleScore; self.assertivenessScore = assertivenessScore
    }
}

// MARK: - Conversation Stats

public struct ConversationMessageStatsResponse: Codable, Sendable {
    public let conversationId: String
    public let totalMessages: Int
    public let totalWords: Int
    public let totalCharacters: Int
    public let contentTypes: ContentTypeCounts
    public let participantStats: [ParticipantStatEntry]
    public let dailyActivity: [DailyActivityEntry]
    public let hourlyDistribution: [String: Int]
    public let languageDistribution: [LanguageEntry]
    public let updatedAt: String?

    public init(
        conversationId: String, totalMessages: Int = 0, totalWords: Int = 0,
        totalCharacters: Int = 0, contentTypes: ContentTypeCounts = ContentTypeCounts(),
        participantStats: [ParticipantStatEntry] = [],
        dailyActivity: [DailyActivityEntry] = [],
        hourlyDistribution: [String: Int] = [:],
        languageDistribution: [LanguageEntry] = [],
        updatedAt: String? = nil
    ) {
        self.conversationId = conversationId; self.totalMessages = totalMessages
        self.totalWords = totalWords; self.totalCharacters = totalCharacters
        self.contentTypes = contentTypes; self.participantStats = participantStats
        self.dailyActivity = dailyActivity; self.hourlyDistribution = hourlyDistribution
        self.languageDistribution = languageDistribution; self.updatedAt = updatedAt
    }
}

public struct ContentTypeCounts: Codable, Sendable {
    public let text: Int
    public let image: Int
    public let audio: Int
    public let video: Int
    public let file: Int
    public let location: Int

    public init(text: Int = 0, image: Int = 0, audio: Int = 0,
                video: Int = 0, file: Int = 0, location: Int = 0) {
        self.text = text; self.image = image; self.audio = audio
        self.video = video; self.file = file; self.location = location
    }
}

public struct ParticipantStatEntry: Codable, Sendable {
    public let userId: String
    public let name: String?
    public let messageCount: Int
    public let wordCount: Int
    public let firstMessageAt: String?
    public let lastMessageAt: String?

    public init(userId: String, name: String? = nil, messageCount: Int = 0,
                wordCount: Int = 0, firstMessageAt: String? = nil,
                lastMessageAt: String? = nil) {
        self.userId = userId; self.name = name
        self.messageCount = messageCount; self.wordCount = wordCount
        self.firstMessageAt = firstMessageAt; self.lastMessageAt = lastMessageAt
    }
}

public struct DailyActivityEntry: Codable, Sendable {
    public let date: String
    public let count: Int

    public init(date: String, count: Int = 0) {
        self.date = date; self.count = count
    }
}

public struct LanguageEntry: Codable, Sendable {
    public let language: String
    public let count: Int

    public init(language: String, count: Int = 0) {
        self.language = language; self.count = count
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/AgentAnalysisModels.swift
git commit -m "feat(sdk): add trait types, history snapshots, conversation stats response models

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Swift SDK — Add fetchStats Method

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationAnalysisService.swift`

- [ ] **Step 1: Add fetchStats method**

Replace the entire file:

```swift
import Foundation

public final class ConversationAnalysisService: @unchecked Sendable {
    public static let shared = ConversationAnalysisService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func fetchAnalysis(conversationId: String) async throws -> ConversationAnalysis {
        let response: APIResponse<ConversationAnalysis> = try await api.request(
            endpoint: "/conversations/\(conversationId)/analysis"
        )
        return response.data
    }

    public func fetchStats(conversationId: String) async throws -> ConversationMessageStatsResponse {
        let response: APIResponse<ConversationMessageStatsResponse> = try await api.request(
            endpoint: "/conversations/\(conversationId)/stats"
        )
        return response.data
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationAnalysisService.swift
git commit -m "feat(sdk): add fetchStats method to ConversationAnalysisService

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: iOS Dashboard — Use Server Stats + Traits + History

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift`

- [ ] **Step 1: Add new state properties**

After the existing `@State` properties (lines 17-19), add:

```swift
    @State private var serverStats: ConversationMessageStatsResponse?
    @State private var isLoadingStats = true
```

- [ ] **Step 2: Update loadAgentAnalysis to also fetch stats**

Replace the `loadAgentAnalysis` function (lines 604-614) with:

```swift
    private func loadAgentAnalysis() async {
        async let analysisTask: () = loadAnalysis()
        async let statsTask: () = loadStats()
        _ = await (analysisTask, statsTask)
    }

    private func loadAnalysis() async {
        defer { isLoadingAnalysis = false }
        do {
            agentAnalysis = try await ConversationAnalysisService.shared.fetchAnalysis(
                conversationId: conversationId
            )
        } catch {}
    }

    private func loadStats() async {
        defer { isLoadingStats = false }
        do {
            serverStats = try await ConversationAnalysisService.shared.fetchStats(
                conversationId: conversationId
            )
        } catch {}
    }
```

- [ ] **Step 3: Replace client-computed stats with server stats in statsGrid**

The `statsGrid` section (around lines 212-250) uses computed properties like `messages.count`, `totalWords`, `totalCharacters`, `imageCount`, `audioCount`, `videoCount`. Replace with server data when available:

```swift
    private var effectiveTotalMessages: Int {
        serverStats?.totalMessages ?? messages.count
    }

    private var effectiveTotalWords: Int {
        serverStats?.totalWords ?? totalWords
    }

    private var effectiveTotalCharacters: Int {
        serverStats?.totalCharacters ?? totalCharacters
    }

    private var effectiveImageCount: Int {
        serverStats?.contentTypes.image ?? imageCount
    }

    private var effectiveAudioCount: Int {
        serverStats?.contentTypes.audio ?? audioCount
    }

    private var effectiveVideoCount: Int {
        serverStats?.contentTypes.video ?? videoCount
    }
```

Update the `statsGrid` view to use these `effective*` properties instead of the direct computed ones.

- [ ] **Step 4: Replace activityData with server data**

Update `activityData` to prefer server `dailyActivity` when available:

```swift
    private var activityData: [ActivityPoint] {
        if let serverDaily = serverStats?.dailyActivity, !serverDaily.isEmpty {
            let dateFormatter = DateFormatter()
            dateFormatter.locale = Locale(identifier: "fr_FR")
            dateFormatter.dateFormat = chartPeriod == .week ? "EEE" : "dd/MM"
            let isoFormatter = ISO8601DateFormatter()
            isoFormatter.formatOptions = [.withFullDate]

            let now = Date()
            let calendar = Calendar.current
            let cutoff: Date = {
                switch chartPeriod {
                case .week: return calendar.date(byAdding: .day, value: -7, to: now) ?? now
                case .month: return calendar.date(byAdding: .day, value: -30, to: now) ?? now
                case .all: return .distantPast
                }
            }()

            return serverDaily
                .compactMap { entry -> ActivityPoint? in
                    guard let date = isoFormatter.date(from: entry.date),
                          date >= cutoff else { return nil }
                    return ActivityPoint(
                        date: date,
                        label: dateFormatter.string(from: date),
                        count: entry.count
                    )
                }
                .sorted { $0.date < $1.date }
        }

        // Fallback to client-computed
        return clientComputedActivityData
    }
```

Rename the old `activityData` computed property to `clientComputedActivityData` as fallback.

- [ ] **Step 5: Replace participantStats with server data**

Update `participantStats` to prefer server data:

```swift
    private var participantStats: [(name: String, messageCount: Int, wordCount: Int)] {
        if let serverParticipants = serverStats?.participantStats, !serverParticipants.isEmpty {
            return serverParticipants
                .sorted { $0.messageCount > $1.messageCount }
                .prefix(10)
                .map { (name: $0.name ?? "Inconnu", messageCount: $0.messageCount, wordCount: $0.wordCount) }
        }

        // Fallback to client-computed
        return clientComputedParticipantStats
    }
```

Rename the old `participantStats` to `clientComputedParticipantStats`.

- [ ] **Step 6: Add traits section for participant profiles**

In the `agentParticipantProfilesSection`, after the existing profile info (persona, tone, vocabulary, etc.), add a traits radar/grid if available. For each profile that has `traits`:

```swift
    @ViewBuilder
    private func traitsSummaryView(_ traits: ParticipantTraits) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let comm = traits.communication {
                traitCategoryRow("Communication", traits: [
                    comm.verbosity, comm.formality, comm.clarity, comm.argumentation
                ].compactMap { $0 })
            }
            if let pers = traits.personality {
                traitCategoryRow("Personnalite", traits: [
                    pers.socialStyle, pers.humor, pers.openness, pers.confidence
                ].compactMap { $0 })
            }
            if let inter = traits.interpersonal {
                traitCategoryRow("Relations", traits: [
                    inter.empathy, inter.leadership, inter.diplomacy
                ].compactMap { $0 })
            }
            if let emo = traits.emotional {
                traitCategoryRow("Emotionnel", traits: [
                    emo.positivity, emo.emotionalStability, emo.sensitivity
                ].compactMap { $0 })
            }
        }
    }

    @ViewBuilder
    private func traitCategoryRow(_ category: String, traits: [TraitScore]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(category.uppercased())
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(theme.textMuted)
                .tracking(1)

            FlowLayout(spacing: 6) {
                ForEach(traits, id: \.label) { trait in
                    HStack(spacing: 4) {
                        Text(trait.label)
                            .font(.system(size: 11))
                            .foregroundColor(theme.textPrimary)
                        Text("\(trait.score)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(accent.opacity(0.8))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(accent.opacity(0.1))
                    .clipShape(Capsule())
                }
            }
        }
    }
```

Call `traitsSummaryView(profile.traits)` in the participant profile card when `profile.traits != nil`.

- [ ] **Step 7: Add conversation health section in agentSummarySection**

After the existing summary text and topics, add health/engagement/conflict display if available:

```swift
                if let health = summary.healthScore {
                    HStack(spacing: 12) {
                        Label("\(health)/100", systemImage: "heart.fill")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(health > 70 ? .green : health > 40 ? .orange : .red)

                        if let engagement = summary.engagementLevel {
                            Label(engagement.capitalized, systemImage: "bolt.fill")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(theme.textMuted)
                        }

                        if let conflict = summary.conflictLevel {
                            Label(conflict.capitalized, systemImage: "exclamationmark.triangle.fill")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(conflict == "aucun" ? .green : conflict == "leger" ? .yellow : .red)
                        }
                    }
                }

                if let dynamique = summary.dynamique, !dynamique.isEmpty {
                    Text(dynamique)
                        .font(.system(size: 13))
                        .foregroundColor(theme.textSecondary)
                        .italic()
                }

                if !summary.dominantEmotions.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(summary.dominantEmotions, id: \.self) { emotion in
                            Text(emotion)
                                .font(.system(size: 11, weight: .medium))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(accent.opacity(0.12))
                                .clipShape(Capsule())
                        }
                    }
                }
```

- [ ] **Step 8: Verify iOS build**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 9: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift
git commit -m "feat(ios): use server stats, traits, history in conversation dashboard

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Build all services**

```bash
cd /Users/smpceo/Documents/v2_meeshy
pnpm --filter=@meeshy/shared exec prisma generate
cd services/gateway && pnpm run build
cd ../agent && pnpm run build
cd ../../
./apps/ios/meeshy.sh build
```

- [ ] **Step 2: Verify schema push**

```bash
pnpm --filter=@meeshy/shared exec prisma db push
```

- [ ] **Step 3: Run any existing tests**

```bash
cd services/gateway && pnpm test 2>&1 | head -50
cd ../agent && pnpm test 2>&1 | head -50
```

- [ ] **Step 4: Final commit if any fixes needed**

Fix any build/test issues, then commit.
