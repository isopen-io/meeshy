# Meeshy Agent Service — Architecture Review END-TO-END

> Review approfondi du 25 mars 2026. Analyse complete du fonctionnement reel
> du service agent, ses interfaces, ses donnees, et ses points de defaillance.

---

## 1. VUE D'ENSEMBLE — FLUX COMPLET

```
                                    ADMIN (apps/web)
                                         |
                                   REST /admin/agent/*
                                         |
                                         v
+------------------+    ZMQ PUSH     +------------------+     LLM API      +------------------+
|                  |    port 5560    |                  |  ----------------> |  OpenAI / Claude |
|    GATEWAY       | --------------> |     AGENT        |                   +------------------+
|  (Fastify+SIO)   |                |   (Fastify)      |
|  port 3000       | <------------- |   port 3200      |
|                  |    ZMQ PUB     |                  |
+------------------+    port 5561    +------------------+
         |                                  |
    Socket.IO                          Redis + MongoDB
    (clients)                          (state + config)
         |
    +----------+
    | Web/iOS  |
    | clients  |
    +----------+
```

### Cycle de vie d'un message

```
1. Humain envoie message via Socket.IO
         |
2. Gateway cree le Message en MongoDB
         |
3. Gateway._notifyAgent() --PUSH--> Agent ZMQ Listener (port 5560)
         |                              |
4. Agent met a jour sliding window Redis
         |
5. Agent detecte interpellation?
         |
    +----+----+
    | OUI     | NON
    v         v
6a. ReactiveHandler        6b. ConversationScanner (toutes les 60s)
    (2 appels LLM:              (1 pipeline LangGraph:
     triage + generation)        observe -> strategist -> generator -> qualityGate)
         |                              |
7. Messages/Reactions enqueues dans DeliveryQueue
         |
8. setTimeout(delayMs) --> delivery
         |
9. DeliveryQueue verifie activite humaine recente (>3 msgs/1min = skip)
         |
10. ZmqAgentPublisher --PUB--> Gateway ZMQ SUB (port 5561)
         |
11. Gateway.handleAgentResponse()
    - Cree message via MessagingService.handleMessage() avec asUserId comme sender
    - messageSource = 'agent'
    - Broadcast Socket.IO vers tous les membres
         |
12. Clients recoivent le message comme un message normal
    (aucune distinction visuelle dans l'UI web actuellement)
```

---

## 2. COMMENT L'AGENT CHOISIT LES CONVERSATIONS

### 2.1 Criteres d'eligibilite (findEligibleConversations)

```
MongoDB Query:
  conversation.type IN ['group', 'channel', 'public', 'global']  <-- configurable
  AND conversation.isActive = true
  AND conversation.lastMessageAt >= (now - freshnessHours)        <-- defaut: 24h
  AND (conversation.agentConfig IS NULL                           <-- pas de config = eligible
       OR conversation.agentConfig.enabled != false)              <-- config existe mais pas disabled

Tri: lastMessageAt DESC
Limite: maxConversationsPerCycle (0 = illimite)
```

**Filtres EXCLUS**: Les conversations `direct` (1-a-1) ne sont JAMAIS scannees.

### 2.2 Filtrage par scan (ConversationScanner.scanAll)

```
Pour chaque conversation eligible:
  |
  +-- Redis lock global "agent:scanning:lock" (300s TTL, NX)
  |   Si lock existe: skip tout le cycle
  |
  +-- Verifier last-scan timestamp Redis "agent:last-scan:{convId}"
  |   Si (now - lastScan) < scanIntervalMinutes: skip
  |   Defaut scanIntervalMinutes: 3 min
  |
  +-- Budget global journalier
  |   canScanConversation():
  |     Semaine: max 50 conversations/jour
  |     Weekend: max 100 conversations/jour
  |   Si epuise: STOP tout le cycle (break)
  |
  +-- processConversation(conv)
```

### 2.3 Scoring d'activite (detectActivity)

```
Queries paralleles:
  messagesLast5Min  = Message.count(convId, createdAt >= now-5min)
  messagesLast10Min = Message.count(convId, createdAt >= now-10min)
  authorsLast10Min  = Message.distinct(senderId, convId, createdAt >= now-10min)

Decision:
  SI messagesLast5Min > 5:
    activityScore = 1.0, shouldSkip = true
    Raison: "Conversation deja tres active"
    --> L'agent n'intervient PAS

  SINON:
    messageScore = min(messagesLast10Min / 10, 1.0)
    authorScore  = min(authorsLast10Min / 5, 1.0)
    activityScore = messageScore * 0.6 + authorScore * 0.4

  SI activityScore > 0.7:
    Le strategist decide de ne pas intervenir (hardcode dans strategist.ts)
```

### 2.4 Budget quotidien par conversation (canSendMessage)

```
Redis key: "agent:budget:{convId}:{YYYY-MM-DD}"
Valeur: compteur increment a chaque message envoye

Limites:
  Semaine (lun-ven): weekdayMaxMessages (defaut: 10)
  Weekend (sam-dim): weekendMaxMessages (defaut: 25)

Si compteur >= limite: conversation skip pour la journee

Budget remaining = max - current (passe au Strategist LLM)
```

### 2.5 Burst cooldown (canBurst)

```
Redis key: "agent:budget:{convId}:last-burst"
Valeur: timestamp du dernier burst

Si (now - lastBurst) < quietIntervalMinutes * 60000:
  Skip cette conversation
  Defaut quietIntervalMinutes: 90 min

Sinon: autoriser le burst
```

### 2.6 Schema de decision complet

```
Conversation eligible?
  |
  +-[type not in eligible list]--------> SKIP
  +-[isActive = false]-----------------> SKIP
  +-[lastMessage > 24h]----------------> SKIP
  +-[agentConfig.enabled = false]------> SKIP
  |
Scan timing OK?
  +-[scanned < 3min ago]---------------> SKIP
  +-[global scan budget epuise]--------> STOP ALL
  |
Activity OK?
  +-[>5 msgs in 5min]-----------------> SKIP (trop active)
  +-[activityScore > 0.7]-------------> SKIP (strategist)
  |
Budget OK?
  +-[daily messages >= max]------------> SKIP
  +-[burst cooldown actif]-------------> SKIP
  |
Controlled users?
  +-[0 controlled users]---------------> SKIP
  |
  v
PROCESS --> LangGraph pipeline
```

---

## 3. COMMENT L'AGENT CHOISIT LES PERSONNES

### 3.1 Sources de controlled users

```
Source 1: AgentUserRole (MongoDB) — "manuel"
  Cree via:
    - Admin UI: POST /admin/agent/roles/:convId/:userId/assign
    - Assign un archetype a un utilisateur dans une conversation
  Champs: userId, conversationId, origin='manual'|'archetype', tone, vocabularyLevel, etc.

Source 2: Auto-pickup — "automatique"
  Condition: agentConfig.autoPickupEnabled = true
  Limite: controlledUsers.length < agentConfig.maxControlledUsers (defaut: 5)

  Query MongoDB:
    User WHERE:
      participations.some(conversationId, isActive=true)
      AND lastActiveAt < (now - inactivityThresholdHours)    -- defaut: 72h
      AND role NOT IN excludedRoles
      AND id NOT IN excludedUserIds
      AND id NOT IN existingAgentUserRoleUserIds
      AND agentGlobalProfile IS NOT NULL                     -- DOIT avoir un profil global
    LIMIT: 1 par cycle (introduction graduelle)

  Resultat: 1 SEUL nouvel utilisateur ajoute par cycle de scan
  Persistence: upsert AgentUserRole pour les cycles suivants
```

### 3.2 Construction du ToneProfile (persona)

```
3 origines possibles:

A. Archetype (assigne manuellement)
   Source: packages/shared/agent/archetypes.ts
   5 archetypes pre-definis:
   +---------------+------------------+---------+--------+----------+
   | ID            | Persona          | Ton     | Longueur| minWords |
   +---------------+------------------+---------+--------+----------+
   | curious       | Le Curieux       | enthou. | moyen  | 20-150   |
   | enthusiast    | L'Enthousiaste   | chaleur.| court  | 5-50     |
   | skeptic       | Le Sceptique     | analyt. | moyen  | 15-120   |
   | pragmatic     | Le Pragmatique   | direct  | court  | 5-60     |
   | social        | Le Social        | amical  | moyen  | 10-100   |
   +---------------+------------------+---------+--------+----------+

B. Observed (appris par l'Observer LLM)
   L'Observer analyse les messages reels de l'utilisateur et extrait:
   tone, vocabularyLevel, typicalLength, emojiUsage,
   topicsOfExpertise, catchphrases, commonEmojis, reactionPatterns
   Confiance augmente: messagesAnalyzed / 50, lock a 1.0 apres 50 msgs

C. Hybrid (archetype + observations)
   Merge via profile-merger.ts:
   Priority: ConversationOverride > GlobalProfile > Default
```

### 3.3 Selection des utilisateurs par le Strategist (LLM)

```
Le Strategist recoit dans son prompt:

UTILISATEURS INACTIFS DISPONIBLES (shuffles aleatoirement):
  - NomAffiche (id: userId) [A DEJA PARLE/N'A PAS ENCORE PARLE]:
    Persona summary. Ton: X. Sujets: Y. Emojis: Z. Reactions: W.

REGLES DE SELECTION (dans le prompt):
  1. Max 2 actions par utilisateur
  2. Priorite ABSOLUE: utilisateur @mentionne dans un message recent
  3. Priorite: utilisateur dont le message a recu une reponse
  4. Poids 3x pour utilisateurs n'ayant pas parle aujourd'hui
  5. Boost reactionBoostFactor (1.5x) pour utilisateurs dont les msgs ont des reactions
  6. INTERDIT de faire parler {todayActiveUserNames} s'il reste des utilisateurs silencieux
  7. VARIER les utilisateurs: chaque cycle DOIT utiliser un utilisateur DIFFERENT

VALIDATION POST-LLM (validateInterventions):
  Pour chaque intervention proposee par le LLM:
    - userId doit etre dans controlledUsers (sinon: drop)
    - Max 2 actions par userId (sinon: drop)
    - Type 'message': messageCount < effectiveMaxMessages (sinon: drop)
    - Type 'reaction': reactionCount < maxReactions ET targetMessageId valide (sinon: drop)
    - delaySeconds clampe: messages [30-180s], reactions [5-30s]
```

### 3.4 Word limits par utilisateur

```
calculateWordLimits(user, isInterpelle, state):

  Priorite (du plus specifique au plus general):
  1. user.role.overrideMinWordsPerMessage / overrideMaxWordsPerMessage
     (override conversation-level depuis AgentUserRole)

  2. archetype.minWords / archetype.maxWords
     (si archetypeId existe sur le role)

  3. state.minWordsPerMessage / state.maxWordsPerMessage
     (config conversation globale)
     Exception: si mode "dynamique" (non-interpelle), maxWords = min(300, global)

  Fallback: minWords=3, maxWords=300
```

---

## 4. PIPELINE LANGGRAPH — 4 NOEUDS

```
+----------+     +-------------+     +-----------+     +-------------+
|          |     |             |     |           |     |             |
| OBSERVE  | --> | STRATEGIST  | --> | GENERATOR | --> | QUALITY     |
|          |     |             |     |           |     | GATE        |
+----------+     +-------------+     +-----------+     +-------------+
  1 LLM call      1 LLM call        N LLM calls       N LLM calls
                                    (1 par message)    (1 par message)

Total LLM calls par cycle: 2 + 2*N (ou N = nombre de messages generes)
```

### 4.1 Observer (1 appel LLM)

```
Input:  messages[] (sliding window)
Output: summary (string), toneProfiles (Record<userId, ToneProfile>)

Prompt: Analyse les messages, extrait un resume + profil par participant
Temperature: 0.3 (deterministe)
MaxTokens: 1024

Logique de merge des profils:
  Pour chaque userId dans la reponse LLM:
    SI profil existant est locked (confidence >= 1.0): SKIP (ne pas ecraser)
    SINON: merger les champs LLM avec les champs existants (LLM prend priorite)
    messagesAnalyzed += count(messages de ce userId)
    confidence = min(messagesAnalyzed / 50, 1.0)
    locked = (messagesAnalyzed >= 50)
```

### 4.2 Strategist (1 appel LLM)

```
Input:  messages[], controlledUsers[], activityScore, budgetRemaining, agentHistory[]
Output: InterventionPlan { shouldIntervene, reason, interventions[] }

Early exits (AVANT appel LLM):
  - controlledUsers.length === 0 --> no intervention
  - activityScore > 0.7 --> conversation already active
  - budgetRemaining <= 0 --> daily budget exhausted

Prompt: ~100 lignes, inclut:
  - Messages recents formates
  - Liste des utilisateurs inactifs (shuffles) avec profils
  - Score d'activite
  - Historique des 20 dernieres interventions agent
  - Budget restant
  - Regles anti-repetition, anti-salutation, rotation utilisateurs
  - Mode burst si actif
  - Instructions specifiques de la conversation

Temperature: 0.7
MaxTokens: 1024

Post-processing: validateInterventions() filtre les interventions invalides
```

### 4.3 Generator (N appels LLM, 1 par MessageDirective)

```
Input:  InterventionPlan.interventions[] (messages + reactions)
Output: PendingAction[] (messages generes + reactions pass-through)

Pour chaque MessageDirective:
  1. Trouver le ControlledUser correspondant
  2. Determiner la langue: user.systemLanguage || detectConversationLanguage()
  3. Construire le prompt avec:
     - Identite complete du personnage (persona, ton, vocabulaire, emojis, catchphrases)
     - Contexte conversation (N derniers messages)
     - Sujet a aborder
     - Regles anti-repetition (sujets deja abordes par cet utilisateur)
     - Contraintes de longueur (minWords-maxWords)
     - LANGUE OBLIGATOIRE
  4. Si needsWebSearch + webSearchEnabled: ajouter tool web_search_preview (OpenAI only)
  5. Appel LLM (temperature configurable, defaut 0.8)
  6. Si reponse = "SKIP" ou vide: null (pas de message)

Pour chaque ReactionDirective:
  Pass-through direct (pas d'appel LLM)
```

### 4.4 Quality Gate (N appels LLM conditionnels)

```
Input:  PendingAction[] (messages + reactions)
Output: PendingAction[] filtres + AgentHistoryEntry[]

Reactions: pass-through (aucune validation)

Pour chaque message:
  CHECKS DETERMINISTES (pas de LLM):
    1. Contenu non-vide
    2. Pas de double @@ (mention malformee)
    3. Pas de patterns AI-reveal:
       "je suis un(e) ia/bot/agent/assistant"
       "as an ai", "i am an ai", "i'm an ai"
    4. Word count dans [minWords, maxWords] (par archetype depuis fix)
    5. Pas de repetition (normalise + compare aux 20 derniers messages)
    6. Pas de doublon dans le batch courant
    7. Pas de doublon avec l'historique agent (contentHash)
    8. Si greeting + greeting recent (<4h dans l'historique): BLOCK

  CHECK LLM (si qualityGateEnabled = true):
    Prompt: Verifie coherence avec profil (ton, vocabulaire, langue)
    Temperature: 0.1 (tres deterministe)
    MaxTokens: 128
    Reponse: { coherent, score 0-1, correctLanguage, reason }

    SI correctLanguage === false: REJECT
    SI score < qualityGateMinScore (defaut 0.5): REJECT

  SI passe tous les checks: ACCEPT
  Ajouter a agentHistory (userId, topic, contentHash, timestamp)
```

---

## 5. DELIVERY QUEUE — TIMING HUMAIN

### 5.1 Mode Proactif (Scanner)

```
Le Strategist LLM definit delaySeconds pour chaque intervention:
  Messages: [30-180s] (clampe par validateInterventions)
  Reactions: [5-30s]

DeliveryQueue.enqueue():
  Trie par delaySeconds croissant
  Pour chaque action: setTimeout(delayMs, deliver)
```

### 5.2 Mode Reactif (Interpellation)

```
calculateResponseDelay():

  SI interpellationType === 'greeting':
    delay = jitter(max(3s, min(typingDelay(wordCount), 30s)))
    --> Reponse rapide: 3-30s

  SINON (mention ou reply):
    apparitionDelay:
      lastMessage < 2min ago:  0-5s      (etait "la")
      lastMessage < 30min ago: 10-30s     (revient rapidement)
      lastMessage < 2h ago:    30-90s     (revient lentement)
      lastMessage > 2h ago:    60-180s    (etait absent)

    readingDelay = min(unreadCount * 2s, 20s)
    typingDelay  = max(3s, min(wordCount * 3-4s, 180s))

    delay = jitter(apparition + reading + typing, ±20%)

Multi-messages echelonnes (fix applique):
  Message 1: delai complet (apparition + reading + typing)
  Message 2: +2-5s + wordCount * 0.8s (simule "tape un second message")
  Message 3: +2-5s + wordCount * 0.8s
```

### 5.3 Anti-flood a la livraison

```
DeliveryQueue.deliver():
  AVANT chaque livraison de message:
    recentCount = Message.count(convId, createdAt >= now-1min)
    SI recentCount > 3:
      SKIP la livraison
      Log: "human activity detected"
```

### 5.4 Reschedule sur interpellation

```
Si un message est deja programme pour userId dans une conversation:
  ET qu'une interpellation arrive pour ce meme userId:
    Les messages programmes existants sont REPOUSSES de +15s
    La nouvelle reponse reactive est ajoutee normalement
```

---

## 6. INTERFACES GATEWAY <-> AGENT

### 6.1 Gateway -> Agent (ZMQ PUSH, port 5560)

```
Declencheur: MeeshySocketIOManager._notifyAgent()
  Appele apres CHAQUE message cree avec succes
  Fire-and-forget (erreurs loggees en warning)

Payload AgentNewMessage:
{
  type: "agent:new-message",
  conversationId: string,           // ObjectId 24-char hex
  messageId: string,                // ObjectId
  senderId: string,                 // ObjectId
  senderDisplayName?: string,       // Display name
  senderUsername?: string,          // Username
  content: string,                  // Texte du message
  originalLanguage: string,         // Code langue (fr, en, etc.)
  replyToId?: string,              // ObjectId du message reply
  mentionedUserIds: string[],       // ObjectIds des @mentions
  timestamp: number                 // Date.getTime()
}
```

### 6.2 Agent -> Gateway (ZMQ PUB, port 5561)

```
A. Agent Response:
{
  type: "agent:response",
  conversationId: string,
  asUserId: string,                 // User ID a impersonner
  content: string,                  // Message genere
  originalLanguage: string,         // Langue du message
  replyToId?: string,              // Reply a un message specifique
  mentionedUsernames?: string[],    // @usernames a mentionner
  messageSource: "agent",
  metadata: {
    agentType: "orchestrator",      // Toujours "orchestrator" actuellement
    roleConfidence: 1.0,
    archetypeId?: string
  }
}

Traitement Gateway (handleAgentResponse):
  1. Resoudre mentionedUsernames -> mentionedUserIds
  2. MessagingService.handleMessage(asUserId, content, ...)
     --> Cree Message en MongoDB avec messageSource='agent'
  3. _broadcastNewMessage() --> Socket.IO vers tous les membres
  4. Notifications push declenchees normalement

B. Agent Reaction:
{
  type: "agent:reaction",
  conversationId: string,
  asUserId: string,                 // User ID qui reagit
  targetMessageId: string,          // Message cible
  emoji: string                     // Emoji de reaction
}

Traitement Gateway (handleAgentReaction):
  1. ReactionService.addReaction(asUserId, targetMessageId, emoji)
  2. Broadcast REACTION_ADDED via Socket.IO
```

---

## 7. MODELES DE DONNEES

### 7.1 Schema complet des tables Agent

```
+-------------------------+     +------------------------+
| AgentGlobalConfig       |     | AgentLlmConfig         |
| (singleton)             |     | (singleton)            |
+-------------------------+     +------------------------+
| enabled: bool           |     | provider: string       |
| defaultProvider: string |     | model: string          |
| defaultModel: string    |     | apiKeyEncrypted: str   |
| globalDailyBudgetUsd    |     | maxTokens: int         |
| maxConcurrentCalls: int |     | temperature: float     |
| eligibleConvTypes: str[]|     | dailyBudgetUsd: float  |
| messageFreshnessHours   |     | maxCostPerCall: float  |
| maxConvsPerCycle: int   |     | fallback*: optional    |
| weekday/weekendMaxConvs |     +------------------------+
+-------------------------+

+-------------------------------+
| Conversation                  |
+-------------------------------+
| id, type, isActive, title,    |
| description, lastMessageAt    |
|                               |
| agentConfig? ----+            |
| agentAnalytic? --+--+         |
+------------------+  |         |
                   |  |         |
    +--------------+  |         |
    v                 v         |
+---------------------------+   |
| AgentConfig               |   |
| (1:1 Conversation)        |   |
+---------------------------+   |
| conversationId (unique)   |   |
| enabled: bool             |   |
| agentType: string         |   |
| contextWindowSize: int    |   |
| autoPickupEnabled: bool   |   |
| scanIntervalMinutes: int  |   |
| min/maxResponsesPerCycle  |   |
| reactionsEnabled: bool    |   |
| weekday/weekendMaxMessages|   |
| weekday/weekendMaxUsers   |   |
| burstEnabled/Size/Interval|   |
| qualityGateEnabled: bool  |   |
| qualityGateMinScore: float|   |
| minWordsPerMessage: int   |   |
| maxWordsPerMessage: int   |   |
| generationTemperature     |   |
| agentInstructions?: str   |   |
| webSearchEnabled: bool    |   |
| excludedRoles: str[]      |   |
| excludedUserIds: str[]    |   |
| ... (40+ champs)          |   |
+---------------------------+   |
                                |
+---------------------------+   |
| AgentAnalytic             | <-+
| (1:1 Conversation)        |
+---------------------------+
| conversationId (unique)   |
| messagesSent: int         |
| totalWordsSent: int       |
| avgConfidence: float      |
| lastResponseAt?: DateTime |
+---------------------------+

+------------------------------------+
| User                               |
+------------------------------------+
| id, username, displayName          |
| systemLanguage, lastActiveAt, role |
|                                    |
| agentGlobalProfile? ----+         |
+-------------------------+         |
                          |         |
    +---------------------+         |
    v                               |
+---------------------------+       |
| AgentGlobalProfile        |       |
| (1:1 User)               |       |
+---------------------------+       |
| userId (unique)           |       |
| personaSummary?: string   |       |
| tone?: string             |       |
| vocabularyLevel?: string  |       |
| typicalLength?: string    |       |
| emojiUsage?: string       |       |
| catchphrases: str[]       |       |
| topicsOfExpertise: str[]  |       |
| topicsAvoided: str[]      |       |
| commonEmojis: str[]       |       |
| reactionPatterns: str[]   |       |
| messagesAnalyzed: int     |       |
| confidence: float         |       |
| locked: bool              |       |
+---------------------------+       |
                                    |
+-----------------------------------+
| AgentUserRole                      |
| (composite unique: userId+convId)  |
+------------------------------------+
| userId + conversationId            |
| origin: 'manual'|'archetype'|     |
|         'auto_rule'|'observed'     |
| archetypeId?: string               |
| personaSummary, tone, vocabulary   |
| typicalLength, emojiUsage          |
| topicsOfExpertise: str[]           |
| topicsAvoided: str[]               |
| catchphrases: str[]                |
| responseTriggers: str[]            |
| silenceTriggers: str[]             |
| relationshipMap: Json              |
| overrideTone?: string              |
| overrideVocabularyLevel?: string   |
| overrideMinWordsPerMessage?: int   |
| overrideMaxWordsPerMessage?: int   |
| messagesAnalyzed: int              |
| confidence: float                  |
| locked: bool                       |
+------------------------------------+

+---------------------------+
| AgentConversationSummary  |
| (1:1 Conversation)        |
+---------------------------+
| conversationId (unique)   |
| summary: string           |
| currentTopics: str[]      |
| overallTone: string       |
| lastMessageId: string     |
| messageCount: int         |
+---------------------------+

+---------------------------+
| Message                   |
+---------------------------+
| ...                       |
| messageSource: string     | <-- 'user'|'system'|'agent'|...
| ... (indexe)              |
+---------------------------+
```

### 7.2 State Redis (cache chaud)

```
+------------------------------------------+--------+-------------------+
| Key Pattern                              | TTL    | Contenu           |
+------------------------------------------+--------+-------------------+
| agent:messages:{convId}                  | 1h     | MessageEntry[]    |
|                                          |        | (sliding window)  |
+------------------------------------------+--------+-------------------+
| agent:profiles:{convId}                  | 1h     | {userId:          |
|                                          |        |  ToneProfile}     |
+------------------------------------------+--------+-------------------+
| agent:summary:{convId}                   | 1h     | string (resume)   |
+------------------------------------------+--------+-------------------+
| agent:history:{convId}                   | 24h    | AgentHistory      |
|                                          |        | Entry[] (max 100) |
+------------------------------------------+--------+-------------------+
| agent:budget:{convId}:{YYYY-MM-DD}       | 48h    | int (compteur     |
|                                          |        | messages du jour) |
+------------------------------------------+--------+-------------------+
| agent:budget:{convId}:{date}:users       | 48h    | Set<userId>       |
|                                          |        | (users actifs)    |
+------------------------------------------+--------+-------------------+
| agent:budget:{convId}:last-burst         | 48h    | timestamp (ms)    |
+------------------------------------------+--------+-------------------+
| agent:cooldown:{convId}:{userId}         | var    | "1" (flag)        |
+------------------------------------------+--------+-------------------+
| agent:last-scan:{convId}                 | 24h    | timestamp (ms)    |
+------------------------------------------+--------+-------------------+
| agent:scanning:lock                      | 300s   | "1" (mutex)       |
+------------------------------------------+--------+-------------------+
| agent:config:{convId}                    | 300s   | AgentConfig JSON  |
+------------------------------------------+--------+-------------------+
| agent:global-config                      | 600s   | GlobalConfig JSON |
+------------------------------------------+--------+-------------------+
| agent:budget:global:scanned-convs:{date} | 48h    | int (compteur)    |
+------------------------------------------+--------+-------------------+
```

---

## 8. ADMIN UI (apps/web)

```
/admin/agent
  |
  +-- Tab "Overview"
  |     Stats: totalConfigs, activeConfigs, totalRoles, totalArchetypes
  |     Actions: Reset all / Reset conversation / Reset user
  |
  +-- Tab "Conversations"
  |     Liste des conversations configurees
  |     Search, filter active/inactive
  |     Toggle enable/disable
  |     Edit config (AgentConfigDialog - 50+ parametres)
  |     Manage roles (assign archetype, unlock)
  |
  +-- Tab "Global"
  |     AgentGlobalConfig (singleton)
  |     eligibleConversationTypes, freshnessHours, maxConversations
  |     weekday/weekendMaxConversations
  |
  +-- Tab "Config LLM"
  |     AgentLlmConfig
  |     Provider, model, API key, temperature, budget, cost limits
  |
  +-- Tab "Archetypes"
  |     Liste des 5 archetypes predefinis (read-only depuis shared)
  |     curious, enthusiast, skeptic, pragmatic, social
  |
  +-- Tab "Live"
        Etat temps reel par conversation:
        - Tone profiles Redis
        - Controlled users
        - Cached messages count
        - Activity score
        - Analytics (messages sent, words, confidence)

API Service: agentAdminService (apps/web/services/agent-admin.service.ts)
  17 methodes HTTP vers /admin/agent/*
  Passent via le gateway /api/v1/admin/agent/* (routes/admin/agent.ts)
```

---

## 9. ANALYSE DE FONCTIONNEMENT — EST-CE QUE CA MARCHE REELLEMENT ?

### 9.1 CE QUI FONCTIONNE

| Aspect | Status | Detail |
|--------|--------|--------|
| ZMQ Gateway->Agent | OK | Fire-and-forget, Zod validation cote agent |
| ZMQ Agent->Gateway | OK | PUB/SUB, gateway cree message comme asUserId |
| Sliding window Redis | OK | TTL 1h, taille configurable 1-250 |
| Scanner periodique | OK | Interval 60s, lock Redis NX, budget checks |
| Detection interpellation | OK | @mentions, replies, greetings |
| Quality gate deterministe | OK | AI-reveal, word count, repetition |
| Budget quotidien | OK | Redis counters avec TTL 48h |
| Admin UI | OK | 50+ params configurables, 6 tabs |
| Archetypes | OK | 5 predefinis avec minWords/maxWords |

### 9.2 PROBLEMES REELS IDENTIFIES

```
CRITIQUE:
---------

1. DESYNCHRONISATION PROFILS Redis/MongoDB
   Probleme: MongoPersistence.getControlledUsers() retourne TOUJOURS
   commonEmojis=[] et reactionPatterns=[] car ces champs ne sont pas
   stockes dans AgentUserRole.
   Impact: Le Strategist n'a jamais acces aux emojis/reactions appris
   par l'Observer, sauf si le cache Redis est encore chaud (TTL 1h).
   Fix applique: Merge Redis profiles dans conversation-scanner.ts.
   Reste a faire: Persister commonEmojis/reactionPatterns dans AgentUserRole.

2. AUTO-PICKUP REQUIERT agentGlobalProfile
   Probleme: L'auto-pickup ne fonctionne QUE si l'utilisateur a deja
   un AgentGlobalProfile en base.
   Question: QUI cree ces profils globaux?
   Reponse: profile-merger.ts a toneProfileToGlobalFields() et
   MongoPersistence.upsertGlobalProfile() MAIS aucun endroit dans le
   code n'appelle upsertGlobalProfile() automatiquement!
   --> Les profils globaux ne sont JAMAIS crees automatiquement.
   --> L'auto-pickup est effectivement MORT sauf creation manuelle.

3. OBSERVER ECRASE les profils de TOUS les participants
   Probleme: L'Observer analyse TOUS les messages et met a jour les
   profils de TOUS les participants (pas juste les controlledUsers).
   Impact: Les profils d'utilisateurs humains sont aussi extraits et
   stockes dans Redis. Pas un bug en soi (utile pour l'analyse), mais
   le merge avec controlledUsers ne filtre que les users qui ont un
   AgentUserRole.

IMPORTANT:
----------

4. PAS DE MULTI-MESSAGE DANS LE SCANNER
   Probleme: Le mode proactif (scanner) genere 1 message par directive.
   Le Strategist peut proposer 2-3 messages du MEME utilisateur, mais
   ils arrivent comme des messages independants avec des delais fixes
   (30-180s). Il n'y a pas de notion de "burst conversationnel"
   ou un utilisateur envoie 2-3 messages courts d'affilee.
   Fix partiel: Le ReactiveHandler a ete corrige pour echelonner les
   messages reactifs. Le Scanner ne l'a pas encore.

5. MESSAGES AGENT INVISIBLES DANS L'UI
   Probleme: messageSource='agent' est stocke en base mais AUCUNE
   distinction visuelle n'existe dans le chat web.
   Impact: Pour le moment c'est voulu (les messages agent doivent
   paraitre humains), mais il n'y a aucun moyen pour un admin de
   distinguer visuellement un message agent d'un message humain
   dans l'interface de chat.

6. COOLDOWN PAR USER JAMAIS UTILISE
   Probleme: RedisStateManager a setCooldown() et isOnCooldown()
   mais AUCUN code ne les appelle.
   Impact: Un meme utilisateur controle peut etre sollicite a chaque
   cycle sans cooldown individuel (juste le max 2 actions/cycle).

MINEUR:
-------

7. QUALITY GATE UTILISE GLOBAL minWords/maxWords
   (Fix applique: utilise maintenant l'archetype si disponible)

8. JSON.parse non protege dans ReactiveHandler
   (Fix applique: fallback parseJsonLlm)

9. Logger type error dans server.ts startup
   (Fix applique)

10. Anthropic provider filtre les system messages
    L'Anthropic provider retire les messages system du tableau
    et les passe via le champ `system` de l'API. C'est correct
    pour l'API Anthropic mais cela signifie que si un prompt
    utilise plusieurs system messages, seul le systemPrompt est
    utilise (les messages system dans messages[] sont drops).

11. Web Search uniquement OpenAI
    Le tool web_search_preview est specifique a OpenAI Responses API.
    Si le provider est Anthropic, webSearchEnabled est ignore.
```

### 9.3 FLUX DE DONNEES — POINTS DE VERITE

```
+-------------------+--------------------------------------------------+
| Donnee            | Source de verite                                 |
+-------------------+--------------------------------------------------+
| Config conv.      | MongoDB AgentConfig --> cache Redis 5min         |
| Config globale    | MongoDB AgentGlobalConfig --> cache Redis 10min  |
| Controlled users  | MongoDB AgentUserRole (+ merge Redis profiles)  |
| Messages recents  | Redis sliding window (TTL 1h, fallback MongoDB) |
| Tone profiles     | Redis (TTL 1h, ecrit par Observer LLM)          |
| Summary           | Redis (TTL 1h, ecrit par Observer LLM)          |
| Agent history     | Redis (TTL 24h, ecrit par QualityGate)           |
| Budget quotidien  | Redis counters (TTL 48h)                         |
| Analytics         | MongoDB AgentAnalytic (ecrit par Scanner)        |
| Profil global     | MongoDB AgentGlobalProfile (JAMAIS ecrit auto)   |
+-------------------+--------------------------------------------------+
```

---

## 10. COUT LLM PAR CYCLE

```
1 cycle de scan pour 1 conversation:
  Observer:    1 appel  (~1024 tokens output)
  Strategist:  1 appel  (~1024 tokens output)
  Generator:   N appels (~maxWords*1.5 tokens chacun)
  QualityGate: N appels (~128 tokens chacun)

  Total: 2 + 2*N appels LLM

Exemple: N=4 messages generes = 10 appels LLM par conversation par cycle
  Avec GPT-4o-mini (~$0.15/1M input, ~$0.60/1M output):
    ~$0.005 par cycle par conversation
    10 conversations x 20 cycles/jour = ~$1/jour

1 interpellation reactive:
  Triage:     1 appel  (~256 tokens output)
  Generation: 1 appel  (~1024 tokens output)

  Total: 2 appels LLM (pas de quality gate LLM!)

  ATTENTION: Le mode reactif n'a PAS de quality gate LLM,
  seulement le quality gate deterministe implicite dans le
  code du ReactiveHandler (qui n'existe pas actuellement).
  --> Les messages reactifs ne passent PAS par le quality gate.
```

---

## 11. CONCLUSIONS & RECOMMANDATIONS

### Fonctionnel

1. **L'agent fonctionne** pour le mode proactif (scanner) avec des utilisateurs
   assignes manuellement via l'admin UI.

2. **L'auto-pickup est casse** : `agentGlobalProfile` n'est jamais cree
   automatiquement. Il faut soit creer les profils manuellement, soit
   ajouter un appel a `upsertGlobalProfile()` dans le Scanner apres
   que l'Observer extrait les profils.

3. **Le mode reactif fonctionne** mais les messages ne passent pas par le
   Quality Gate LLM (risque de AI-reveal ou incoherence).

4. **Le multi-message humain** est partiellement implemente : OK pour le
   mode reactif (fix applique), pas encore pour le mode proactif.

### Fiabilite

5. **Le TTL Redis de 1h** signifie que si le service agent redemarre,
   il perd tous les profils, summaries et messages en cache. Le fallback
   MongoDB existe pour les messages mais PAS pour les profils Observer.

6. **Le lock Redis de 300s** pour le scan protege contre les scans
   concurrents mais si le service crash pendant un scan, le lock reste
   300s avant expiration.

### Performance

7. **2+2N appels LLM par conversation par cycle** est raisonnable avec
   GPT-4o-mini mais pourrait devenir couteux avec Claude Opus.

8. **Le scan sequentiel** des conversations (boucle for) limite le throughput.
   Pas de parallelisme entre conversations (un scan a la fois).
