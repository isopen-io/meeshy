# Agent Analytics & Deep Profiling — Design Spec

**Date**: 2026-04-01
**Scope**: Prisma schema + Observer LLM enrichi + Pipeline stats serveur + Snapshots historiques
**Depends on**: services/agent, services/gateway, packages/shared/prisma

---

## 1. Problem Statement

The agent observer currently generates **stylistic profiles** (tone, vocabulary, catchphrases) designed to mimic users. The conversation dashboard needs **psychological profiling**, **interpersonal dynamics**, **quantitative stats**, and **historical evolution** — none of which exist today.

Additionally, all quantitative stats (message counts, word counts, content types) are computed **client-side from paginated messages**, which is inaccurate and slow.

## 2. Architecture Overview

```
Message events
  ├─→ Socket.IO message:new → ConversationMessageStats (incremental)
  ├─→ REST PATCH /messages/:id (edit) → ConversationMessageStats (adjust)
  └─→ REST DELETE /messages/:id (delete) → ConversationMessageStats (decrement)

Agent Observer cycle (every ~3min)
  ├─→ LLM: 23 psychological dimensions per participant
  ├─→ LLM: conversation-level analysis (healthScore, conflictLevel, etc.)
  ├─→ relationshipMap per participant (attitude toward others)
  ├─→ AgentConversationSummary (upsert enriched)
  ├─→ AgentUserRole (upsert enriched)
  └─→ Post-observer hook: refresh ConversationMessageStats cache

Daily cron (00:00 UTC)
  └─→ AgentAnalysisSnapshot (freeze current state for history)
```

**Note**: `message:edited` and `message:deleted` flow through REST route handlers only (not Socket.IO listeners). Stats hooks for edit/delete MUST be placed in the REST handlers (`messages-advanced.ts`), not in `MeeshySocketIOManager`.

## 3. Prisma Schema Changes

### 3.1 AgentUserRole — New Fields

Add to the existing model (after `reactionPatterns`):

```prisma
// ── Psychological Dimensions (23 traits) ──
// Each trait: textual category + numeric score 0-100

// Communication
traitVerbosity            String?   // laconique|concis|modere|detaille|prolixe
traitVerbosityScore       Int?      // 0-100
traitFormality            String?   // argotique|familier|courant|soigne|academique
traitFormalityScore       Int?      // 0-100
traitResponseSpeed        String?   // tres_lent|lent|modere|rapide|instantane
traitResponseSpeedScore   Int?      // 0-100
traitInitiativeRate       String?   // passif|reactif|equilibre|proactif|meneur
traitInitiativeRateScore  Int?      // 0-100
traitClarity              String?   // confus|vague|correct|clair|limpide
traitClarityScore         Int?      // 0-100
traitArgumentation        String?   // inexistante|faible|moyenne|structuree|rigoureuse
traitArgumentationScore   Int?      // 0-100

// Personality
traitSocialStyle          String?   // introverti|reserve|ambivert|sociable|extraverti
traitSocialStyleScore     Int?      // 0-100
traitAssertiveness        String?   // timide|discret|mesure|affirme|dominant
traitAssertivenessScore   Int?      // 0-100
traitAgreeableness        String?   // confrontant|critique|neutre|conciliant|bienveillant
traitAgreeablenessScore   Int?      // 0-100
traitHumor                String?   // absent|rare|occasionnel|frequent|omnipresent
traitHumorScore           Int?      // 0-100
traitEmotionality         String?   // stoique|contenu|modere|expressif|debordant
traitEmotionalityScore    Int?      // 0-100
traitOpenness             String?   // ferme|prudent|receptif|curieux|aventurier
traitOpennessScore        Int?      // 0-100
traitConfidence           String?   // insecure|hesitant|modere|assure|inebranlable
traitConfidenceScore      Int?      // 0-100
traitCreativity           String?   // conventionnel|classique|modere|creatif|visionnaire
traitCreativityScore      Int?      // 0-100
traitPatience             String?   // impatient|presse|modere|patient|zen
traitPatienceScore        Int?      // 0-100
traitAdaptability         String?   // rigide|constant|flexible|adaptable|cameleon
traitAdaptabilityScore    Int?      // 0-100

// Interpersonal
traitEmpathy              String?   // indifferent|distant|attentif|empathique|fusionnel
traitEmpathyScore         Int?      // 0-100
traitPoliteness           String?   // abrupt|direct|correct|poli|ceremonieux
traitPolitenessScore      Int?      // 0-100
traitLeadership           String?   // suiveur|discret|participant|influent|leader
traitLeadershipScore      Int?      // 0-100
traitConflictStyle        String?   // evitant|passif|diplomate|confrontant|combatif
traitConflictStyleScore   Int?      // 0-100
traitSupportiveness       String?   // absent|rare|ponctuel|present|pilier
traitSupportivenessScore  Int?      // 0-100
traitDiplomacy            String?   // maladroit|brut|correct|habile|maitre
traitDiplomacyScore       Int?      // 0-100
traitTrustLevel           String?   // mefiant|prudent|neutre|confiant|naif
traitTrustLevelScore      Int?      // 0-100

// Emotional
traitEmotionalStability   String?   // volatile|instable|variable|stable|inebranlable
traitEmotionalStabilityScore Int?   // 0-100
traitPositivity           String?   // pessimiste|negatif|neutre|positif|optimiste
traitPositivityScore      Int?      // 0-100
traitSensitivity          String?   // insensible|epais|modere|sensible|hypersensible
traitSensitivityScore     Int?      // 0-100
traitStressResponse       String?   // panique|anxieux|gerable|calme|imperturbable
traitStressResponseScore  Int?      // 0-100

// ── Dominant emotions ──
dominantEmotions          String[]  @default([])

// ── Engagement (computed by server, not LLM) ──
engagementLevel           String?   // dormant|rare|occasionnel|regulier|tres_actif
sentimentScore            Float?    // -1.0 to 1.0 (computed by server from NLP)
```

**Note**: All trait fields are nullable (`String?`, `Int?`) to allow incremental rollout. Existing rows won't break. The observer fills them progressively as it analyzes more messages.

### 3.2 AgentConversationSummary — New Fields

Add to the existing model:

```prisma
// ── Conversation-level analysis (LLM-generated) ──
healthScore               Int?      // 0-100: overall conversation health
engagementLevel           String?   // dormant|faible|modere|actif|intense
conflictLevel             String?   // aucun|leger|modere|eleve|critique
dynamique                 String?   // short text describing group dynamics
dominantEmotions          String[]  @default([])
```

### 3.3 New Model: AgentAnalysisSnapshot

Daily snapshot for historical evolution tracking.

```prisma
model AgentAnalysisSnapshot {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  conversationId  String   @db.ObjectId
  snapshotDate    DateTime // MUST be normalized to midnight UTC: new Date(Date.UTC(y, m, d))

  // Conversation-level metrics (frozen from AgentConversationSummary)
  overallTone     String
  healthScore     Int?
  engagementLevel String?
  conflictLevel   String?
  topTopics       String[]
  dominantEmotions String[]
  messageCountAtSnapshot Int

  // Per-participant snapshots (frozen from AgentUserRole)
  participantSnapshots Json
  // Structure: [{ userId, displayName, sentimentScore, engagementLevel,
  //               positivityScore, socialStyleScore, assertivenessScore }]

  createdAt       DateTime @default(now())

  conversation    Conversation @relation(fields: [conversationId], references: [id])

  @@unique([conversationId, snapshotDate])
  @@index([conversationId])
  @@index([snapshotDate])
}
```

**Implementation note**: The `snapshotDate` field MUST be normalized to midnight UTC in the cron job: `new Date(Date.UTC(year, month, day))`. Failure to normalize will defeat the `@@unique` constraint and create duplicate snapshots.

### 3.4 New Model: ConversationMessageStats

Pre-aggregated quantitative stats, updated incrementally on every message event. Named `ConversationMessageStats` (not `ConversationComputedStats`) to avoid confusion with the existing `ConversationStatsService` which tracks membership/online/language stats.

```prisma
model ConversationMessageStats {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  conversationId  String   @unique @db.ObjectId

  // Global counts
  totalMessages   Int      @default(0)
  totalWords      Int      @default(0)
  totalCharacters Int      @default(0)

  // Content type counts
  textMessages    Int      @default(0)
  imageCount      Int      @default(0)
  audioCount      Int      @default(0)
  videoCount      Int      @default(0)
  fileCount       Int      @default(0)
  locationCount   Int      @default(0)

  // Per-participant stats
  // Structure: { [userId]: { messageCount, wordCount, characterCount, imageCount,
  //              audioCount, videoCount, firstMessageAt, lastMessageAt } }
  participantStats Json    @default("{}")

  // Activity timeline (last 90 days, daily buckets)
  // Structure: { "2026-03-15": messageCount, "2026-03-16": messageCount, ... }
  dailyActivity   Json     @default("{}")

  // Hourly distribution (0-23 hour buckets, accumulated)
  // Structure: { "0": count, "1": count, ..., "23": count }
  hourlyDistribution Json  @default("{}")

  // Language distribution
  // Structure: { "fr": count, "en": count, ... }
  languageDistribution Json @default("{}")

  updatedAt       DateTime @updatedAt

  conversation    Conversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId])
}
```

**Relationship with existing `ConversationStatsService`**: The existing service (`services/gateway/src/services/ConversationStatsService.ts`) tracks `messagesPerLanguage`, `participantCount`, `participantsPerLanguage`, and `onlineUsers` — focused on membership/presence. `ConversationMessageStats` tracks message content metrics (words, characters, types, activity, hourly distribution). They coexist as complementary systems. The existing service's Redis caching pattern (1h TTL, `getOrCompute()`) should be used as reference for the new service's implementation.

## 4. Observer LLM Prompt Changes

### 4.1 ToneProfile Type Extension

The `ToneProfile` type in `services/agent/src/graph/state.ts` MUST be extended with optional trait fields:

```typescript
export type ToneProfile = {
  // ... existing fields ...

  // Psychological dimensions (all optional for incremental rollout)
  traits?: {
    communication?: Record<string, { label: string; score: number }>;
    personality?: Record<string, { label: string; score: number }>;
    interpersonal?: Record<string, { label: string; score: number }>;
    emotional?: Record<string, { label: string; score: number }>;
  };
  dominantEmotions?: string[];
};
```

The `getControlledUsers()` method in `mongo-persistence.ts` (line ~142-162) MUST be updated to map the new DB fields back into this structure when loading profiles into graph state.

### 4.2 relationshipMap Migration

**Breaking change**: `relationshipMap` changes from `Record<string, string>` to `Record<string, { attitude: string; score: number; detail: string }>`.

Migration strategy:
1. The Prisma field remains `Json` — accepts both old and new shapes
2. In `getControlledUsers()`, when loading from DB: if a value is a plain string (legacy), convert it to `{ attitude: "neutre", score: 0, detail: value }`
3. In the observer post-processing: always write the new structured format
4. The cast `r.relationshipMap as Record<string, string>` on line 154 of `mongo-persistence.ts` MUST be replaced with proper type-safe parsing that handles both legacy string values and new structured objects

### 4.3 System Prompt (replaces current OBSERVER_SYSTEM_PROMPT)

The new prompt asks the LLM to generate personality dimensions alongside existing stylistic fields. Key changes:

- Add all 23 trait dimensions as `{ label: string, score: number }` pairs
- Add `dominantEmotions: string[]` per participant
- Populate `relationshipMap` with attitude toward each other participant
- Add conversation-level `healthScore`, `engagementLevel`, `conflictLevel`, `dynamique`, `dominantEmotions`
- Increase `maxTokens` from 1024 to 3072 (23 traits x N participants needs room)

### 4.4 Prompt Structure

```
System: Tu es un analyste conversationnel expert en profilage psychologique et stylistique.

Analyse la conversation et retourne un JSON:

1. "summary": resume concis (max 200 mots)
2. "overallTone": ton general
3. "healthScore": sante de la conversation (0-100)
4. "engagementLevel": dormant|faible|modere|actif|intense
5. "conflictLevel": aucun|leger|modere|eleve|critique
6. "dynamique": description courte de la dynamique de groupe (1-2 phrases)
7. "dominantEmotions": emotions dominantes de la conversation (array)
8. "profiles": { [userId]: {
     // Stylistique (existant)
     tone, vocabularyLevel, typicalLength, emojiUsage,
     topicsOfExpertise, catchphrases, responseTriggers, silenceTriggers,
     commonEmojis, reactionPatterns, personaSummary,

     // Psychologique (nouveau) — chaque trait: { label: string, score: 0-100 }
     communication: { verbosity, formality, responseSpeed, initiativeRate, clarity, argumentation },
     personality: { socialStyle, assertiveness, agreeableness, humor, emotionality, openness,
                    confidence, creativity, patience, adaptability },
     interpersonal: { empathy, politeness, leadership, conflictStyle, supportiveness,
                      diplomacy, trustLevel },
     emotional: { emotionalStability, positivity, sensitivity, stressResponse },

     dominantEmotions: string[],
     relationshipMap: { [otherUserId]: { attitude: string, score: -100 to 100, detail: string } }
   }}

REGLES:
- Chaque trait: { "label": "une des 5 categories", "score": 0-100 }
- relationshipMap: attitude parmi hostile|froid|distant|neutre|cordial|amical|chaleureux
  score: -100 (haine) a 100 (adoration), detail: 1 phrase explicative
- scores bases sur des PREUVES dans les messages, pas des suppositions
- healthScore: 0=toxique, 50=neutre, 100=sain et dynamique
```

### 4.5 Post-LLM Processing

After receiving LLM response, the observer:

1. Maps trait `{ label, score }` to flat DB fields: `traitSocialStyle = "extraverti"`, `traitSocialStyleScore = 82`
2. Serializes `relationshipMap` as structured JSON into the existing field (new format)
3. Upserts `AgentUserRole` with all existing + new trait fields
4. Upserts `AgentConversationSummary` with healthScore, engagementLevel, conflictLevel, dynamique, dominantEmotions
5. Triggers `ConversationMessageStats` cache refresh

### 4.6 mongo-persistence.ts Changes

The `upsertUserRole` method MUST be extended to include all 46 new trait fields (23 labels + 23 scores) in both `create` and `update` blocks. The fields should be passed as optional — if the LLM didn't generate a trait (e.g., not enough data), the field stays `null`.

The `getControlledUsers` method MUST be extended to:
1. Read all new trait fields from DB
2. Map flat `traitX`/`traitXScore` fields back into the `traits` nested structure on `ToneProfile`
3. Handle `relationshipMap` migration (string values → structured objects)

## 5. Server-Side Stats Pipeline

### 5.1 Incremental Updates

**On `message:new`** (Socket.IO handler in `MeeshySocketIOManager`, message handler):
```
1. Increment ConversationMessageStats.totalMessages
2. Count words in content → increment totalWords, totalCharacters
3. Count attachments by type → increment imageCount/audioCount/etc.
4. Update participantStats[senderId] (messageCount++, wordCount+=, etc.)
5. Update dailyActivity[today] (messageCount++)
6. Update hourlyDistribution[currentHour]++
7. If message.originalLanguage → update languageDistribution
8. Invalidate Redis cache for this conversationId
```

**On `message:edited`** (REST handler in `messages-advanced.ts`, PATCH route):
```
1. Diff old/new content → adjust totalWords, totalCharacters
2. Adjust participantStats[senderId].wordCount
3. Invalidate Redis cache
```

**On `message:deleted`** (REST handler in `messages-advanced.ts`, DELETE route):
```
1. Decrement totalMessages, totalWords, totalCharacters
2. Decrement attachment type counts
3. Decrement participantStats[senderId] counters
4. Invalidate Redis cache
```

### 5.2 Cold Start / Recomputation

For conversations without a `ConversationMessageStats` row (migration), or when forced:

```
1. MongoDB aggregate on Message collection:
   - $match: { conversationId }
   - $group: count, sum words, sum characters, count by type, group by sender, group by day
2. Create/replace ConversationMessageStats row
3. Cache in Redis (TTL 5min)
```

### 5.3 Post-Observer Refresh

After each agent observer cycle completes for a conversation:
1. Revalidate `ConversationMessageStats` (in case messages were missed)
2. Compute server-side metrics that complement LLM analysis:
   - `sentimentScore` per participant (NLP aggregation, not LLM)
   - `engagementLevel` per participant (from participantStats message frequency)
   - `peakActivityHours` per participant (from hourlyDistribution)
   - `avgWordsPerMessage` per participant (wordCount / messageCount)
   - `topicDiversity` per participant (unique topics ratio)
3. Update `AgentUserRole` with these computed fields

## 6. Daily Snapshot Mechanism

### 6.1 Cron Job

Runs daily at 00:00 UTC (can be a node-cron in the agent service or a gateway scheduled task).

### 6.2 Logic

```
For each conversation with an AgentConversationSummary updated in last 48h:
  1. Read current AgentConversationSummary
  2. Read all AgentUserRole for this conversation
  3. Normalize snapshotDate: new Date(Date.UTC(year, month, day))
  4. Create AgentAnalysisSnapshot:
     - snapshotDate = normalized midnight UTC
     - overallTone, healthScore, engagementLevel, conflictLevel from summary
     - topTopics = summary.currentTopics
     - dominantEmotions = summary.dominantEmotions
     - messageCountAtSnapshot = ConversationMessageStats.totalMessages
     - participantSnapshots = roles.map(r => ({
         userId, displayName,
         sentimentScore: r.sentimentScore,
         engagementLevel: r.engagementLevel,
         positivityScore: r.traitPositivityScore,
         socialStyleScore: r.traitSocialStyleScore,
         assertivenessScore: r.traitAssertivenessScore
       }))
  5. Upsert (unique on conversationId + snapshotDate)
```

### 6.3 Retention

Keep snapshots for 365 days. Cron cleans up older entries monthly.

## 7. API Changes

### 7.1 GET /conversations/:id/analysis (enriched)

The existing `/analysis` endpoint in `core.ts` uses an explicit `select` block on `prisma.agentUserRole.findMany`. This `select` MUST be either removed (fetch all fields) or extended to include all 46 new trait fields + `dominantEmotions`, `engagementLevel`, `sentimentScore`, `locked`. Similarly for `AgentConversationSummary`: add `healthScore`, `engagementLevel`, `conflictLevel`, `dynamique`, `dominantEmotions`.

The endpoint MUST also fetch `AgentAnalysisSnapshot` entries (last 90 days) for the `history` array.

Response:
```json
{
  "conversationId": "...",
  "summary": {
    "text": "...",
    "currentTopics": ["..."],
    "overallTone": "...",
    "healthScore": 72,
    "engagementLevel": "actif",
    "conflictLevel": "leger",
    "dynamique": "Groupe anime avec un leader naturel et des echanges vifs mais respectueux",
    "dominantEmotions": ["humour", "curiosite"],
    "messageCount": 1247,
    "updatedAt": "..."
  },
  "participantProfiles": [{
    "userId": "...",
    "username": "...",
    "displayName": "...",
    "avatar": "...",
    "personaSummary": "...",
    "tone": "...",
    "vocabularyLevel": "...",
    "typicalLength": "...",
    "emojiUsage": "...",
    "topicsOfExpertise": ["..."],
    "catchphrases": ["..."],
    "commonEmojis": ["..."],
    "reactionPatterns": ["..."],
    "traits": {
      "communication": {
        "verbosity": { "label": "detaille", "score": 72 },
        "formality": { "label": "courant", "score": 50 },
        "responseSpeed": { "label": "rapide", "score": 78 },
        "initiativeRate": { "label": "proactif", "score": 68 },
        "clarity": { "label": "clair", "score": 81 },
        "argumentation": { "label": "structuree", "score": 65 }
      },
      "personality": {
        "socialStyle": { "label": "sociable", "score": 75 },
        "assertiveness": { "label": "affirme", "score": 70 },
        "agreeableness": { "label": "conciliant", "score": 62 },
        "humor": { "label": "frequent", "score": 80 },
        "emotionality": { "label": "expressif", "score": 68 },
        "openness": { "label": "curieux", "score": 85 },
        "confidence": { "label": "assure", "score": 73 },
        "creativity": { "label": "creatif", "score": 67 },
        "patience": { "label": "modere", "score": 50 },
        "adaptability": { "label": "adaptable", "score": 71 }
      },
      "interpersonal": {
        "empathy": { "label": "empathique", "score": 76 },
        "politeness": { "label": "poli", "score": 65 },
        "leadership": { "label": "influent", "score": 72 },
        "conflictStyle": { "label": "diplomate", "score": 55 },
        "supportiveness": { "label": "present", "score": 69 },
        "diplomacy": { "label": "habile", "score": 63 },
        "trustLevel": { "label": "confiant", "score": 70 }
      },
      "emotional": {
        "emotionalStability": { "label": "stable", "score": 68 },
        "positivity": { "label": "positif", "score": 74 },
        "sensitivity": { "label": "sensible", "score": 62 },
        "stressResponse": { "label": "calme", "score": 66 }
      }
    },
    "dominantEmotions": ["humour", "empathie", "curiosite"],
    "relationshipMap": {
      "userId2": { "attitude": "amical", "score": 65, "detail": "Toujours encourageant" },
      "userId3": { "attitude": "cordial", "score": 30, "detail": "Echanges polis mais superficiels" }
    },
    "sentimentScore": 0.45,
    "engagementLevel": "regulier",
    "messagesAnalyzed": 87,
    "confidence": 1.0,
    "locked": true
  }],
  "history": [{
    "snapshotDate": "2026-03-31T00:00:00Z",
    "overallTone": "decontracte",
    "healthScore": 70,
    "engagementLevel": "actif",
    "conflictLevel": "aucun",
    "topTopics": ["tech", "gaming"],
    "dominantEmotions": ["humour"],
    "messageCountAtSnapshot": 1200,
    "participantSnapshots": [
      { "userId": "...", "displayName": "...", "sentimentScore": 0.4, "positivityScore": 72, "socialStyleScore": 75 }
    ]
  }]
}
```

### 7.2 GET /conversations/:id/stats (new)

Response:
```json
{
  "conversationId": "...",
  "totalMessages": 1247,
  "totalWords": 45230,
  "totalCharacters": 234567,
  "contentTypes": {
    "text": 1100,
    "image": 89,
    "audio": 34,
    "video": 12,
    "file": 8,
    "location": 4
  },
  "participantStats": [
    { "userId": "...", "name": "atabeth", "messageCount": 456, "wordCount": 18900,
      "firstMessageAt": "...", "lastMessageAt": "..." },
    { "userId": "...", "name": "jcharlesnm", "messageCount": 312, "wordCount": 12100 }
  ],
  "dailyActivity": [
    { "date": "2026-03-25", "count": 45 },
    { "date": "2026-03-26", "count": 67 }
  ],
  "hourlyDistribution": {
    "0": 12, "1": 5, "14": 89, "15": 102, "23": 23
  },
  "languageDistribution": [
    { "language": "fr", "count": 980 },
    { "language": "en", "count": 267 }
  ],
  "updatedAt": "..."
}
```

## 8. Swift SDK Types

### 8.1 New/Updated Types in AgentAnalysisModels.swift

```swift
// MARK: - Trait Score

public struct TraitScore: Codable, Sendable {
    public let label: String
    public let score: Int
}

// MARK: - Trait Categories

public struct CommunicationTraits: Codable, Sendable {
    public let verbosity: TraitScore?
    public let formality: TraitScore?
    public let responseSpeed: TraitScore?
    public let initiativeRate: TraitScore?
    public let clarity: TraitScore?
    public let argumentation: TraitScore?
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
}

public struct InterpersonalTraits: Codable, Sendable {
    public let empathy: TraitScore?
    public let politeness: TraitScore?
    public let leadership: TraitScore?
    public let conflictStyle: TraitScore?
    public let supportiveness: TraitScore?
    public let diplomacy: TraitScore?
    public let trustLevel: TraitScore?
}

public struct EmotionalTraits: Codable, Sendable {
    public let emotionalStability: TraitScore?
    public let positivity: TraitScore?
    public let sensitivity: TraitScore?
    public let stressResponse: TraitScore?
}

public struct ParticipantTraits: Codable, Sendable {
    public let communication: CommunicationTraits?
    public let personality: PersonalityTraits?
    public let interpersonal: InterpersonalTraits?
    public let emotional: EmotionalTraits?
}

// MARK: - Relationship

public struct RelationshipAttitude: Codable, Sendable {
    public let attitude: String
    public let score: Int
    public let detail: String
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
}

public struct ParticipantSnapshot: Codable, Sendable {
    public let userId: String
    public let displayName: String?
    public let sentimentScore: Double?
    public let positivityScore: Int?
    public let socialStyleScore: Int?
    public let assertivenessScore: Int?
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
}

public struct ContentTypeCounts: Codable, Sendable {
    public let text: Int
    public let image: Int
    public let audio: Int
    public let video: Int
    public let file: Int
    public let location: Int
}

public struct ParticipantStatEntry: Codable, Sendable {
    public let userId: String
    public let name: String?
    public let messageCount: Int
    public let wordCount: Int
    public let firstMessageAt: String?
    public let lastMessageAt: String?
}

public struct DailyActivityEntry: Codable, Sendable {
    public let date: String
    public let count: Int
}

public struct LanguageEntry: Codable, Sendable {
    public let language: String
    public let count: Int
}
```

### 8.2 Updated ConversationSummaryAnalysis

Add: `healthScore: Int?`, `engagementLevel: String?`, `conflictLevel: String?`, `dynamique: String?`, `dominantEmotions: [String]`

### 8.3 Updated ParticipantProfile

Add: `traits: ParticipantTraits?`, `dominantEmotions: [String]`, `relationshipMap: [String: RelationshipAttitude]`, `sentimentScore: Double?`, `engagementLevel: String?`, `locked: Bool?`

### 8.4 Updated ConversationAnalysis

Add: `history: [AnalysisSnapshot]`

### 8.5 Updated ConversationAnalysisService

Add method: `fetchStats(conversationId:) -> ConversationMessageStatsResponse` hitting `GET /conversations/:id/stats`

## 9. Files to Create/Modify

### New Files
| File | Purpose |
|---|---|
| `services/gateway/src/services/ConversationMessageStatsService.ts` | Incremental stats aggregation + Redis cache |
| `services/gateway/src/routes/conversations/stats.ts` | GET /conversations/:id/stats endpoint |
| `services/agent/src/cron/daily-snapshot.ts` | Daily snapshot cron job |

### Modified Files
| File | Changes |
|---|---|
| `packages/shared/prisma/schema.prisma` | 46 new fields on AgentUserRole, 5 on AgentConversationSummary, 2 new models |
| `services/agent/src/agents/observer.ts` | Enriched LLM prompt (23 traits + conversation metrics), maxTokens 3072 |
| `services/agent/src/graph/state.ts` | Extended ToneProfile type with optional `traits` + `dominantEmotions` |
| `services/agent/src/memory/mongo-persistence.ts` | Persist 46 new trait fields, relationshipMap migration, getControlledUsers mapping |
| `services/gateway/src/routes/conversations/core.ts` | Extend /analysis select to include all new fields + history array |
| `services/gateway/src/routes/conversations/index.ts` | Register stats routes |
| `services/gateway/src/socketio/MeeshySocketIOManager.ts` | Hook ConversationMessageStats increment on message:new |
| `services/gateway/src/routes/conversations/messages-advanced.ts` | Hook ConversationMessageStats adjust on edit/delete REST handlers |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/AgentAnalysisModels.swift` | Add TraitScore, trait category structs, AnalysisSnapshot, ConversationMessageStatsResponse |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationAnalysisService.swift` | Add fetchStats() method |
| `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift` | Use server stats + traits + history |

## 10. Migration Strategy

1. **Schema migration**: `prisma db push` — all new fields are nullable, zero downtime
2. **relationshipMap migration**: In-code — `getControlledUsers()` handles both legacy string and new structured format
3. **Stats cold start**: First call to GET /stats triggers full recomputation for that conversation
4. **Observer rollout**: Deploy new prompt — existing profiles get traits filled on next analysis cycle
5. **Snapshot backfill**: Not needed — snapshots accumulate from deployment date forward
6. **iOS dashboard**: Falls back gracefully — nil traits show existing UI, server stats replace client computation when available
