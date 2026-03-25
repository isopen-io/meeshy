# Meeshy Agent Service — Cycle de Vie Detaille

> Du demarrage a l'arret : chaque etape, chaque dependance, chaque flux.
> Document de reference pour comprendre comment un agent specialise est
> instancie, choisit une conversation, impersonne un utilisateur, et repond.

---

## 1. DEMARRAGE — SEQUENCE D'INITIALISATION

```
process.start()
  |
  |  PHASE 1 — Singletons (synchrone)
  |  server.ts:25-27
  |
  +-- Fastify({ logger: true })        --> serveur HTTP
  +-- new PrismaClient()               --> client MongoDB
  +-- new Redis(env.REDIS_URL)          --> client Redis
  |
  |  PHASE 2 — LLM + Graph (synchrone)
  |  server.ts:46-54
  |
  +-- createLlmProvider({               --> provider OpenAI ou Anthropic
  |     provider: env.LLM_PROVIDER,
  |     apiKey: ...,
  |     model: ...
  |   })
  |
  +-- buildAgentGraph(llm)              --> compile le StateGraph LangGraph
  |     4 noeuds: observe -> strategist -> generator -> qualityGate
  |     Retour: CompiledGraph avec .invoke()
  |
  +-- new RedisStateManager(redis)      --> gestionnaire cache Redis
  +-- new MongoPersistence(prisma)      --> couche persistence MongoDB
  |
  |  PHASE 3 — Transport ZMQ (BLOQUANT, await)
  |  server.ts:56-60
  |
  +-- new ZmqAgentListener(host, 5560)
  |     |
  |     +-- await initialize()
  |           pullSocket = new zmq.Pull()
  |           await pullSocket.bind("tcp://0.0.0.0:5560")
  |           // BLOQUE jusqu'a bind reussi
  |
  +-- new ZmqAgentPublisher(host, 5561)
  |     |
  |     +-- await initialize()
  |           pubSocket = new zmq.Publisher()
  |           await pubSocket.bind("tcp://0.0.0.0:5561")
  |
  |  PHASE 4 — Services applicatifs (partiellement bloquant)
  |  server.ts:62-70
  |
  +-- new ConfigCache(redis, persistence)
  |     |
  |     +-- await startListening()
  |           subscriber = redis.duplicate()
  |           await subscriber.subscribe("agent:config-invalidated")
  |           // Ecoute pub/sub en arriere-plan
  |
  +-- new DailyBudgetManager(redis)
  +-- new DeliveryQueue(zmqPublisher, persistence)
  +-- new ReactiveHandler(llm, persistence, stateManager, deliveryQueue)
  +-- new ConversationScanner(graph, persistence, stateManager,
  |       deliveryQueue, redis, configCache, budgetManager)
  |
  |  PHASE 5 — Enregistrement handlers + routes HTTP
  |  server.ts:41-66, 72-149
  |
  +-- server.register(configRoutes)     --> /api/agent/config/*
  +-- server.register(rolesRoutes)      --> /api/agent/roles/*
  +-- server.register(analyticsRoutes)  --> /api/agent/analytics/*
  |
  +-- zmqListener.onEvent(handler)      --> enregistre le handler ZMQ
  |
  |  PHASE 6 — Demarrage des boucles de fond (NON-BLOQUANT)
  |  server.ts:171-175
  |
  +-- zmqListener.startListening()      --> lance for-await sur PULL socket
  |     .catch(err => log)                  (BACKGROUND, ne bloque pas)
  |
  +-- scanner.start()                   --> setInterval(scanAll, 60_000)
  |     |                                   + scanAll() immediat
  |     +-- this.scanAll()              --> premier scan au boot
  |     +-- setInterval(scanAll, 60s)   --> scans periodiques
  |
  |  PHASE 7 — Log de demarrage (informatif)
  |  server.ts:178-194
  |
  +-- Charge la config globale
  +-- Liste les conversations eligibles
  +-- Log le nombre de conversations monitorees + controlled users
  |
  |  PHASE 8 — Ecoute HTTP (BLOQUANT)
  |  server.ts:196
  |
  +-- await server.listen({ port: 3200, host: '0.0.0.0' })
  |
  +-- "Agent service running on port 3200 with {provider} provider"
```

### Graphe de dependances

```
                    Redis ----+---- PrismaClient
                      |       |         |
                      v       v         v
                RedisState  ConfigCache  MongoPersistence
                      |       |         |
                      v       v         v
           +----------+-------+---------+----------+
           |                                       |
    LlmProvider ----> LangGraph                    |
           |              |                        |
           v              v                        v
    ReactiveHandler    Scanner <---- BudgetManager
           |              |
           v              v
        DeliveryQueue <---+
              |
              v
        ZmqPublisher --PUB--> Gateway

        ZmqListener --PULL<-- Gateway
              |
              v
        Event Handler (server.ts:72)
              |
         +----+----+
         |         |
    Interpellation  Sliding Window
    detectee?       update (Redis)
         |
    ReactiveHandler
```

---

## 2. BOUCLE PRINCIPALE — ZMQ LISTENER

```
zmq-listener.ts: startListening()

  running = true
  heartbeat = setInterval(log, 30_000)    // "loop alive" toutes les 30s

  for await (const [msg] of this.pullSocket) {
    // BLOQUE ICI jusqu'a reception d'un frame ZMQ
    // Un seul message traite a la fois (pas de parallelisme)

    if (!this.running) break              // sortie propre si shutdown

    messageCount++

    raw = JSON.parse(msg.toString())      // deserialisation
    parsed = agentEventSchema.safeParse(raw)  // validation Zod

    if (!parsed.success) continue         // message invalide, skip

    await this.handler(parsed.data)       // BLOQUANT: attend fin du handler
    // --> server.ts:72 (le handler ZMQ)
  }

  clearInterval(heartbeat)

PROPRIETES:
  - Traitement SEQUENTIEL: 1 message a la fois
  - Le handler BLOQUE la reception du prochain message
  - Pas de queue interne: ZMQ gere le buffering
  - Heartbeat toutes les 30s confirme que la boucle tourne
```

### Handler ZMQ (server.ts:72-149)

```
async (event: AgentEvent) => {

  // 1. Filtre: seul 'agent:new-message' est traite
  if (event.type !== 'agent:new-message') return

  // 2. Mise a jour sliding window Redis
  messages = await stateManager.getMessages(convId)
  messages.push(newEntry)
  window = messages.slice(-windowSize)         // configurable, defaut 50
  await stateManager.setMessages(convId, window)  // TTL 1h

  // 3. Charger les utilisateurs controles
  controlledUsers = await persistence.getControlledUsers(convId)
  if (controlledUsers.length === 0) return     // pas d'agent = rien a faire

  // 4. Resolution du replyToUserId
  if (msg.replyToId) {
    // Cherche dans la sliding window d'abord
    repliedMessage = window.find(m => m.id === msg.replyToId)
    if (repliedMessage && controlledUserIds.has(repliedMessage.senderId)) {
      replyToUserId = repliedMessage.senderId
    }
    // Fallback: query MongoDB (non-bloquant si echec)
    else if (!repliedMessage) {
      dbMsg = await prisma.message.findUnique(msg.replyToId)
      if (dbMsg && controlledUserIds.has(dbMsg.senderId)) {
        replyToUserId = dbMsg.senderId
      }
    }
  }

  // 5. Detection d'interpellation
  interpellation = detectInterpellation({
    mentionedUserIds,
    replyToUserId,
    content,
    controlledUserIds,
    controlledUsernames     // Map<lowercase_username, userId>
  })

  // 6. Si interpellation detectee: mode reactif
  if (interpellation.detected) {
    // ASYNC: PAS de await --> handler retourne immediatement
    // La reponse reactive s'execute en arriere-plan
    reactiveHandler.handleInterpellation({
      conversationId,
      triggerMessage,
      mentionedUserIds,
      replyToUserId,
      targetUserIds: interpellation.targetUserIds,
      interpellationType: interpellation.type
    }).catch(err => log.error(...))
  }

  // 7. Si pas d'interpellation: le message est stocke dans Redis
  //    Le ConversationScanner le traitera au prochain cycle
}
```

---

## 3. MODE REACTIF — INTERPELLATION

```
Declencheurs:
  1. @mention d'un controlled user (dans mentionedUserIds OU dans le contenu)
  2. Reply a un message d'un controlled user (replyToId pointe vers un msg agent)
  3. Greeting (@salut, @bonjour) vers un controlled user

detectInterpellation():
  Input: { mentionedUserIds, replyToUserId, content, controlledUserIds, controlledUsernames }

  Etape 1: Verifier les mentions explicites
    pour chaque uid dans mentionedUserIds:
      si controlledUserIds.has(uid): ajouter aux targets

  Etape 2: Verifier le reply
    si replyToUserId && controlledUserIds.has(replyToUserId):
      ajouter aux targets

  Etape 3: Fallback regex (si aucune match)
    chercher /@(\w+)/g dans le contenu
    matcher avec controlledUsernames (case-insensitive)

  Etape 4: Determiner le type
    si targets vide: { detected: false }
    si greeting: { type: 'greeting' }
    si mention dans mentionedUserIds: { type: 'mention' }
    sinon: { type: 'reply' }
```

### ReactiveHandler — Flux complet

```
handleInterpellation(input):
  |
  +-- Charger controlledUsers depuis MongoDB
  |   (refresh, pas depuis le cache du handler ZMQ)
  |
  +-- Filtrer targetUsers = users mentionnes/replies
  |   Si aucun target: STOP
  |
  +-- Charger messages depuis Redis (30 derniers)
  |
  +-- APPEL LLM #1: callTriage()
  |     Temperature: 0.3 (deterministe)
  |     MaxTokens: 256
  |     Prompt:
  |       "INTERPELLATION detectee: {type}"
  |       "Message declencheur: {content} (par {senderName})"
  |       "Utilisateurs controles interpelles: {profiles}"
  |       "Contexte recent: {10 derniers messages}"
  |       "Decide si reponse necessaire"
  |     Reponse attendue:
  |       { shouldRespond, reason, responses: [{ asUserId, urgency, suggestedTopic }] }
  |
  |   Si shouldRespond = false: STOP
  |
  +-- APPEL LLM #2: callGeneration()
  |     Temperature: 0.8 (creatif)
  |     MaxTokens: 1024
  |     Prompt:
  |       "PROFILS: {profiles detailles avec ton, vocabulaire, emoji...}"
  |       "DIRECTIVES: {triage results}"
  |       "MESSAGE DECLENCHEUR: {content}"
  |       "CONTEXTE: {15 derniers messages}"
  |       "REGLES: imiter parfaitement, pas de salutation, pas d'AI-reveal"
  |     Reponse attendue:
  |       { messages: [{ asUserId, content, replyToId?, wordCount }] }
  |
  +-- Construire PendingMessages avec delais echelonnes
  |
  |   Message 1 (premier):
  |     delay = calculateResponseDelay({
  |       interpellationType,
  |       wordCount,
  |       lastUserMessageAgoMs,     // derniere activite de cet agent
  |       unreadMessageCount
  |     })
  |
  |   Message 2+ (suivants):
  |     delay += 2000 + random(0-3000) + wordCount * 800
  |     // Simule un humain qui tape un second message
  |
  +-- Verifier si des messages sont deja programmes pour cet user
  |   Si oui: repousser de +15s (eviter pile-up)
  |
  +-- deliveryQueue.enqueue(conversationId, actions)
  |   // setTimeout pour chaque message
  |
  +-- Mettre a jour agentHistory dans Redis
```

### Calcul des delais (timing-calculator.ts)

```
calculateResponseDelay(input):

  SI type = 'greeting':
    return jitter(max(3s, min(typingDelay(words), 30s)), ±20%)
    // Reponse rapide: 3 a 30 secondes

  SINON:
    apparition = f(lastUserMessageAgoMs):
      < 2 min:   random(0-5s)       // "j'etais la"
      < 30 min:  random(10-30s)     // "je reviens"
      < 2h:      random(30-90s)     // "je reviens doucement"
      > 2h:      random(60-180s)    // "j'etais absent"

    reading = min(unreadCount * 2s, 20s)
      // Simule la lecture des messages non lus

    typing = max(3s, min(wordCount * random(3-4s), 180s))
      // Simule la frappe

    return jitter(apparition + reading + typing, ±20%)

  Exemples:
    Greeting "salut @bot": 3-30s
    Mention recente (2min): 0-5s + 4s lecture + 12s frappe = ~20s
    Reply apres 1h absence: 30-90s + 10s lecture + 20s frappe = ~100s
```

---

## 4. MODE PROACTIF — CONVERSATION SCANNER

```
ConversationScanner.start():
  |
  +-- scanAll() immediatement (1er scan au boot)
  +-- setInterval(scanAll, 60_000)    // toutes les 60 secondes
```

### scanAll() — Boucle de scan

```
scanAll():
  |
  +-- Acquérir lock Redis "agent:scanning:lock" (NX, TTL 300s)
  |   Si lock existe deja: return (un autre scan est en cours)
  |
  +-- Charger la config globale (depuis cache, TTL 10min)
  |   eligibleTypes: ['group', 'channel', 'public', 'global']
  |   freshnessHours: 24
  |   maxConversationsPerCycle: 0 (illimite)
  |
  +-- findEligibleConversations(persistence, options)
  |   Query MongoDB: conversations actives avec messages recents
  |   Filtre: agentConfig.enabled !== false
  |
  +-- Pour chaque conversation eligible (SEQUENTIEL, pas parallele):
  |     |
  |     +-- Verifier last-scan (Redis "agent:last-scan:{convId}")
  |     |   Si scan < scanIntervalMinutes (defaut 3min): SKIP
  |     |
  |     +-- Verifier budget global de scan journalier
  |     |   Semaine: max 50 convs/jour
  |     |   Weekend: max 100 convs/jour
  |     |   Si epuise: BREAK (stop tout le cycle)
  |     |
  |     +-- processConversation(conv)
  |     |   Si OK: recordScannedConversation()
  |     |
  |     +-- Mettre a jour last-scan timestamp Redis (TTL 24h)
  |
  +-- Relacher le lock Redis
```

### processConversation() — Pipeline complet

```
processConversation(conv):
  |
  |  PHASE A — Verification pre-LLM
  |
  +-- detectActivity(persistence, convId)
  |     messagesLast5Min, messagesLast10Min, authorsLast10Min
  |     Si >5 msgs/5min: shouldSkip=true
  |     Sinon: activityScore = msgScore*0.6 + authorScore*0.4
  |   Si shouldSkip: return false
  |
  +-- Charger en parallele:
  |     messages        (Redis sliding window, fallback MongoDB)
  |     summary         (Redis, TTL 1h)
  |     toneProfiles    (Redis, TTL 1h)
  |     controlledUsers (MongoDB AgentUserRole + User join)
  |     agentHistory    (Redis, TTL 24h)
  |     todayActiveUserIds (Redis set)
  |
  +-- Enrichir controlledUsers avec toneProfiles Redis
  |   (merger commonEmojis, reactionPatterns, personaSummary)
  |
  |  PHASE B — Auto-pickup (si active)
  |
  +-- Si autoPickupEnabled ET controlledUsers < maxControlledUsers:
  |     Query: users inactifs depuis {thresholdHours}h
  |            avec agentGlobalProfile existant
  |            pas deja dans AgentUserRole
  |     Limite: 1 user par cycle (introduction graduelle)
  |     Persistence: upsert AgentUserRole (async, non-bloquant)
  |
  +-- Si controlledUsers vide: return false
  |
  |  PHASE C — Chargement messages
  |
  +-- Si Redis vide: charger 50 derniers messages depuis MongoDB
  |   Transformer: DB message -> MessageEntry
  |   Sauvegarder dans Redis (TTL 1h)
  +-- Si toujours vide: return false
  |
  |  PHASE D — Verification budgets
  |
  +-- canSendMessage(): budget quotidien messages
  |   Semaine: max 10 msgs/jour, Weekend: max 25 msgs/jour
  |   Si epuise: return false
  |
  +-- canBurst(): cooldown de burst
  |   Si dernierBurst < quietIntervalMinutes (90min): return false
  |
  |  PHASE E — Execution pipeline LangGraph
  |
  +-- graph.invoke({
  |     conversationId,
  |     messages,                    // sliding window
  |     summary,                     // resume conversation
  |     toneProfiles,                // profils par userId
  |     controlledUsers,             // users a impersonner
  |     triggerContext: { type: 'scan' },
  |     activityScore,               // 0.0-1.0
  |     budgetRemaining,             // messages restants
  |     todayUsersActive,            // combien ont parle
  |     maxUsersToday,               // limite weekday/weekend
  |     todayActiveUserIds,          // quels users ont parle
  |     agentHistory,                // 100 dernieres interventions
  |     ... (40+ parametres de config)
  |   })
  |
  |   Execution lineaire:
  |   observe -> strategist -> generator -> qualityGate
  |
  |   Retour: {
  |     summary,           // nouveau resume
  |     toneProfiles,      // profils mis a jour
  |     pendingActions,    // messages/reactions a envoyer
  |     agentHistory       // nouvelles entrees historique
  |   }
  |
  |  PHASE F — Post-traitement
  |
  +-- Sauvegarder summary dans Redis (TTL 1h)
  +-- Sauvegarder toneProfiles dans Redis (TTL 1h)
  +-- Merger agentHistory (ancien + nouveau, max 100, Redis TTL 24h)
  |
  +-- Si pendingActions non vide:
  |     deliveryQueue.enqueue(convId, pendingActions)
  |     // setTimeout pour chaque action
  |
  |     Pour chaque message:
  |       budgetManager.recordMessage(convId, userId)
  |       // Incrementer compteur Redis
  |
  |     Si burst: budgetManager.recordBurst(convId)
  |
  |     Mettre a jour analytics MongoDB:
  |       messagesSent, totalWordsSent, avgConfidence
  |
  +-- return true
```

---

## 5. DELIVERY — LIVRAISON DES MESSAGES

```
DeliveryQueue interne (pas Redis, en memoire Node.js):

  queue: DeliveryItem[] = []
  Chaque item: { action, conversationId, scheduledAt, timer }

enqueue(conversationId, actions[]):
  Trier par delaySeconds croissant
  Pour chaque action:
    timer = setTimeout(deliver, delaySeconds * 1000)
    queue.push(item)

deliver(conversationId, action):                    // callback setTimeout
  |
  +-- Retirer l'item de la queue
  |
  +-- ANTI-FLOOD CHECK:
  |   recentCount = MongoDB.count(messages, convId, last 1 min)
  |   Si recentCount > 3 ET type = 'message':
  |     SKIP (humains trop actifs)
  |     return
  |
  +-- Si type = 'message':
  |     Construire AgentResponse:
  |       { type: 'agent:response',
  |         conversationId,
  |         asUserId: action.asUserId,
  |         content: action.content,
  |         originalLanguage: action.originalLanguage,
  |         replyToId,
  |         mentionedUsernames,
  |         messageSource: 'agent',
  |         metadata: { agentType: 'orchestrator', roleConfidence: 1.0 } }
  |
  |     await zmqPublisher.publish(response)
  |     // PUB socket -> Gateway SUB socket
  |
  +-- Si type = 'reaction':
        Construire AgentReaction:
          { type: 'agent:reaction', conversationId, asUserId, targetMessageId, emoji }

        await zmqPublisher.publishReaction(reaction)
```

### Cote Gateway — Reception et Creation

```
Gateway ZmqAgentClient.startListening():
  |
  for await (const [msg] of subSocket):
    parsed = JSON.parse(msg.toString())
    |
    +-- Si type = 'agent:response':
    |     handler = responseHandler  (enregistre au boot)
    |     await manager.handleAgentResponse(parsed)
    |
    +-- Si type = 'agent:reaction':
          handler = reactionHandler
          await manager.handleAgentReaction(parsed)

handleAgentResponse(response):
  |
  +-- Resoudre mentions:
  |   Si mentionedUsernames fournis: lookup userIds en DB
  |   Sinon: extraire @mentions du contenu
  |
  +-- MessagingService.handleMessage({
  |     userId: response.asUserId,          // <-- L'AGENT IMPERSONNE CET USER
  |     conversationId,
  |     content: response.content,
  |     messageType: 'text',
  |     messageSource: 'agent',             // Marque dans la DB
  |     originalLanguage,
  |     replyToId,
  |     mentionedUserIds
  |   })
  |   --> Cree le Message en MongoDB
  |   --> Declenche traduction automatique (translator service)
  |   --> Broadcast Socket.IO vers tous les membres
  |
  +-- _broadcastNewMessage()
  |   --> Les clients recoivent le message comme venant de asUserId
  |   --> Aucune distinction visuelle (messageSource='agent' non affiche)

handleAgentReaction(reaction):
  |
  +-- ReactionService.addReaction({
  |     participantId: reaction.asUserId,   // <-- L'AGENT REAGIT COMME CET USER
  |     messageId: reaction.targetMessageId,
  |     emoji: reaction.emoji
  |   })
  |
  +-- Broadcast REACTION_ADDED via Socket.IO
```

---

## 6. CONCURRENCE — QUI PEUT S'EXECUTER EN PARALLELE

```
+-------------------+-------------------+-------------------+
| ZMQ Listener Loop | Scanner (60s)     | Delivery Timers   |
| (for-await)       | (setInterval)     | (setTimeout)      |
+-------------------+-------------------+-------------------+
| Sequentiel:       | Sequentiel:       | Concurrent:       |
| 1 msg a la fois   | 1 conv a la fois  | N timers en //    |
| MAIS lance le     | Lock Redis global | Chacun independant|
| ReactiveHandler   | (300s TTL)        | Anti-flood check  |
| en ASYNC          |                   | avant livraison   |
+-------------------+-------------------+-------------------+

Interactions possibles:
  1. ReactiveHandler + Scanner sur la MEME conversation:
     Possible mais rare. Pas de conflit car:
     - ReactiveHandler lit/ecrit Redis (messages, history)
     - Scanner lit/ecrit Redis (messages, history, profiles)
     - Redis ops sont atomiques par key
     - Pire cas: un message apparait deux fois dans des contextes differents

  2. Deux deliveries pour le meme user au meme moment:
     Possible. DeliveryQueue n'a pas de lock per-user.
     Pire cas: deux messages arrivent presque simultanement
     (pas un bug, ressemble a un humain qui tape vite)

  3. Scanner + Delivery pour la meme conversation:
     OK: Scanner enqueue, Delivery execute apres delai
     Anti-flood (>3 msgs/1min) protege contre pile-up
```

---

## 7. ARRET — SEQUENCE DE SHUTDOWN

```
SIGINT ou SIGTERM recu
  |
  |  ETAPE 1 — Stopper les boucles
  |
  +-- scanner.stop()
  |     clearInterval(intervalHandle)
  |     // Plus de nouveaux scans
  |     // Un scan en cours se terminera normalement
  |
  +-- deliveryQueue.clearAll()
  |     Pour chaque item dans queue:
  |       clearTimeout(timer)
  |     queue = []
  |     // TOUS les messages en attente sont PERDUS
  |     // Pas de persistance de la queue
  |
  |  ETAPE 2 — Fermer les transports
  |
  +-- await configCache.stopListening()
  |     subscriber.unsubscribe("agent:config-invalidated")
  |     subscriber.quit()
  |     // Plus de notifications de config
  |
  +-- await zmqListener.close()
  |     running = false
  |     pullSocket.close()
  |     // for-await loop sort au prochain check
  |     // Si un handler est en cours: il se termine avant close
  |
  +-- await zmqPublisher.close()
  |     pubSocket.close()
  |     // Plus de publications possibles
  |
  |  ETAPE 3 — Fermer les connexions
  |
  +-- await redis.quit()
  |     // Ferme la connexion Redis
  |
  +-- await prisma.$disconnect()
  |     // Ferme le pool MongoDB
  |
  +-- process.exit(0)

DONNEES PERDUES AU SHUTDOWN:
  - Messages en attente dans DeliveryQueue (setTimeout pas persistes)
  - Scan en cours interrompu (lock Redis expire apres 300s)
  - Handler reactif en cours (LLM call peut timeout)
```

---

## 8. ACTIVATION COTE GATEWAY

```
Condition: process.env.AGENT_HOST doit etre defini

SI AGENT_HOST est SET:
  +-- new ZmqAgentClient(agentHost, 5560, 5561)
  +-- await initialize()            // Connect PUSH + SUB sockets
  |   Si echec: log warning, agentClient = null (agent desactive)
  |
  +-- Si ok: enregistrer handlers
  |     onResponse(manager.handleAgentResponse)
  |     onReaction(manager.handleAgentReaction)
  |     startListening() en arriere-plan

SI AGENT_HOST n'est PAS SET:
  +-- log info "agent service disabled"
  +-- agentClient = null
  +-- _notifyAgent() retourne immediatement (no-op)
  +-- Aucun impact sur le reste du gateway

PAS DE RECONNECTION AUTOMATIQUE:
  Si l'agent tombe apres le boot:
  - Les PUSH envoyes vont dans le buffer ZMQ (limité)
  - Les SUB ne recoivent plus rien
  - Pas de health check, pas de retry
  - Il faut redemarrer le gateway pour reconnecter
```

---

## 9. DOCKER — TOPOLOGIE RESEAU

```
docker-compose (dev ou prod):

  +----meeshy-network (bridge)--------------------------------------+
  |                                                                  |
  |  +------------------+     ZMQ PUSH     +------------------+     |
  |  | meeshy-gateway   | ---- 5560 ----> | meeshy-agent     |     |
  |  | port 3000        | <--- 5561 ----- | port 3200        |     |
  |  |                  |     ZMQ SUB      |                  |     |
  |  | AGENT_HOST=agent |                  | ZMQ_HOST=0.0.0.0|     |
  |  +------------------+                  +------------------+     |
  |         |                                      |                |
  |    Socket.IO                              +----+----+           |
  |    port 3000                              |         |           |
  |         |                           +-----+   +----+------+    |
  |  +------+------+                    | Redis|  | MongoDB    |   |
  |  | Traefik     |                    | 6379 |  | 27017      |   |
  |  | 80/443      |                    +------+  +-----------+    |
  |  +-------------+                                               |
  +----------------------------------------------------------------+

Dev:  agent est dans le profil "full" (docker compose --profile full up)
Prod: agent est un service normal (toujours demarre si dans le compose)

Variables d'environnement cle:
  Gateway:  AGENT_HOST=agent (nom DNS du container)
  Agent:    ZMQ_HOST=0.0.0.0
            ZMQ_PULL_PORT=5560
            ZMQ_PUB_PORT=5561
            DATABASE_URL=mongodb://...
            REDIS_URL=redis://redis:6379
            OPENAI_API_KEY=sk-...
```

---

## 10. RESUME — CYCLE COMPLET D'UNE INTERVENTION

```
T=0:00  Humain envoie "Salut @agentbot, tu penses quoi du match ?"
        Gateway cree le message, broadcast Socket.IO
        Gateway._notifyAgent() PUSH vers agent:5560

T=0:01  Agent recoit le message via ZMQ PULL
        Met a jour sliding window Redis
        detectInterpellation() -> type='mention', target='agentbot-userId'
        Lance ReactiveHandler.handleInterpellation() en ASYNC

T=0:02  ReactiveHandler.callTriage()
        LLM (GPT-4o-mini, temp=0.3): "Oui, repondre, urgence=medium"

T=0:04  ReactiveHandler.callGeneration()
        LLM (GPT-4o-mini, temp=0.8):
          Message 1: "Ah le match d'hier ? Enorme 😄"
          Message 2: "Le but de Mbappe a la 78e c'etait quelque chose"

T=0:05  Calcul des delais:
          Message 1: apparition(5s) + reading(4s) + typing(8s) = 17s ±20% -> ~15s
          Message 2: +2s + random(0-3s) + 8*0.8s = ~11s -> cumul ~26s

T=0:05  deliveryQueue.enqueue([msg1@15s, msg2@26s])

T=0:20  setTimeout callback pour msg1
        Anti-flood check: 1 message/1min (OK)
        zmqPublisher.publish(agentResponse) PUB vers gateway:5561
        Gateway.handleAgentResponse():
          MessagingService.handleMessage(asUserId='agentbot-userId', "Ah le match...")
          Message cree en MongoDB (messageSource='agent')
          Broadcast Socket.IO vers tous les membres
          >> Les clients voient le message comme venant de @agentbot

T=0:31  setTimeout callback pour msg2
        Anti-flood check: 2 messages/1min (OK, < 3)
        Meme flux: message "Le but de Mbappe..."
        >> Les clients voient un second message quelques secondes apres
        >> Comportement humain naturel: 2 messages d'affilee

T=60:00 ConversationScanner.scanAll()
        Cette conversation n'est PAS re-scannee car:
        - Activite recente (messages dans les 5 dernieres min)
        - activityScore > 0.7 -> "conversation already active"
```
