# Meeshy Agent Service — Plan d'Amelioration

> Base exclusivement sur : agent-architecture-review.md, agent-lifecycle-detailed.md,
> et la lecture du code source de services/agent/.
>
> Chaque item reference le probleme identifie, le fichier concerne, et la solution.

---

## PRIORITE 1 — BUGS CRITIQUES (le service ne fonctionne pas correctement)

### 1.1 Auto-pickup mort : AgentGlobalProfile jamais cree

**Probleme** (architecture-review.md §9.2 #2)
`getPotentialControlledUsers()` exige `agentGlobalProfile: { isNot: null }`.
`upsertGlobalProfile()` existe dans `mongo-persistence.ts:158` mais **aucun code ne l'appelle**.
L'Observer extrait les profils de TOUS les participants, les stocke dans Redis (`toneProfiles`),
mais ne les persiste jamais en `AgentGlobalProfile` MongoDB.
Resultat : l'auto-pickup ne trouvera jamais personne.

**Fichiers** : `conversation-scanner.ts`, `mongo-persistence.ts`, `memory/profile-merger.ts`

**Solution** :
Dans `ConversationScanner.processConversation()`, apres l'execution du graph (phase F),
pour chaque profil dans `result.toneProfiles` qui n'est PAS un controlled user :
```
const observedProfiles = result.toneProfiles as Record<string, ToneProfile>
for (const [userId, profile] of Object.entries(observedProfiles)) {
  if (controlledUserIds.has(userId)) continue  // skip agents
  if (profile.messagesAnalyzed < 10) continue  // pas assez de data
  persistence.upsertGlobalProfile(userId, toneProfileToGlobalFields(profile))
    .catch(err => console.error(...))
}
```
Cela alimente progressivement les `AgentGlobalProfile` pour les humains actifs,
rendant l'auto-pickup fonctionnel.

**Tests** : Verifier qu'apres 10+ messages d'un humain dans une conversation scannee,
son `AgentGlobalProfile` est cree en base.

---

### 1.2 Mode reactif sans Quality Gate

**Probleme** (architecture-review.md §9.2 #3, lifecycle-detailed.md §3)
`ReactiveHandler.handleInterpellation()` genere des messages via 2 appels LLM (triage + generation)
puis les enqueue directement dans `DeliveryQueue` **sans passer par le Quality Gate**.
Risque : AI-reveal ("je suis une IA"), incoherence de ton, mauvaise langue, repetition.

**Fichiers** : `reactive/reactive-handler.ts`, `agents/quality-gate.ts`

**Solution** :
Extraire les checks deterministes du Quality Gate dans une fonction reutilisable,
et l'appeler dans le ReactiveHandler avant l'enqueue :

1. Dans `quality-gate.ts`, extraire `runDeterministicChecks()` (deja exporte implicitement,
   il faut l'exporter explicitement).

2. Dans `reactive-handler.ts`, apres la generation et avant l'enqueue :
```
import { runDeterministicChecks, isGreeting, hasRecentGreeting } from '../agents/quality-gate'

// Pour chaque message genere :
const check = runDeterministicChecks(msg.content, minWords, maxWords, recentMessages)
if (!check.ok) { skip }
if (isGreeting(msg.content) && hasRecentGreeting(agentHistory, 240)) { skip }
for (const pattern of AI_REVEAL_PATTERNS) {
  if (pattern.test(msg.content)) { skip }
}
```

Le Quality Gate LLM (coherence/ton) n'est pas necessaire en mode reactif car la latence
serait trop elevee (+2-3s), mais les checks deterministes sont instantanes.

**Tests** : Envoyer un message de triage qui genere "En tant qu'IA, je..." et verifier qu'il est bloque.

---

### 1.3 Persister commonEmojis/reactionPatterns dans AgentUserRole

**Probleme** (architecture-review.md §9.2 #1)
`MongoPersistence.getControlledUsers()` retourne `commonEmojis: []` et `reactionPatterns: []`
car ces champs ne sont pas dans `AgentUserRole` Prisma.
Le fix dans `conversation-scanner.ts` merge depuis Redis, mais Redis a un TTL 1h.
Apres redemarrage ou expiration, les donnees sont perdues.

**Fichiers** : `packages/shared/prisma/schema.prisma` (AgentUserRole), `mongo-persistence.ts`

**Solution** :
1. Ajouter au schema Prisma `AgentUserRole` :
```prisma
commonEmojis    String[]  @default([])
reactionPatterns String[] @default([])
```

2. Dans `MongoPersistence.getControlledUsers()`, inclure ces champs dans le mapping role :
```
commonEmojis: r.commonEmojis,
reactionPatterns: r.reactionPatterns,
```

3. Dans `MongoPersistence.upsertUserRole()`, ajouter dans create et update :
```
commonEmojis: profile.commonEmojis,
reactionPatterns: profile.reactionPatterns,
```

4. `prisma generate` + migration.

**Tests** : Assigner un archetype, verifier que les emojis sont persistes et restores apres restart.

---

## PRIORITE 2 — COMPORTEMENT HUMAIN (le service fonctionne mais pas naturellement)

### 2.1 Multi-message echelonne dans le mode proactif (Scanner)

**Probleme** (architecture-review.md §9.2 #4, lifecycle-detailed.md §4)
Le Scanner genere des messages independants avec des delais fixes (30-180s par le Strategist).
Quand le meme utilisateur produit 2-3 messages, ils arrivent comme des interventions separees
sans notion de "burst conversationnel" (un humain qui tape 2-3 messages courts d'affilee).

Le fix dans le ReactiveHandler (echelonnement 2-5s + typing) ne s'applique PAS au Scanner.

**Fichiers** : `delivery/delivery-queue.ts`, `scheduler/conversation-scanner.ts`

**Solution** :
Dans `DeliveryQueue.enqueue()`, grouper les actions du meme `asUserId` et echelonner :

```typescript
enqueue(conversationId: string, actions: PendingAction[]): void {
  // Grouper par userId
  const byUser = new Map<string, PendingAction[]>()
  for (const a of actions) {
    const list = byUser.get(a.asUserId) ?? []
    list.push(a)
    byUser.set(a.asUserId, list)
  }

  for (const [userId, userActions] of byUser) {
    const sorted = userActions.sort((a, b) => a.delaySeconds - b.delaySeconds)
    let cumulativeDelay = sorted[0].delaySeconds * 1000

    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].type === 'message') {
        // Echelonner les messages du meme user
        const wordCount = (sorted[i] as PendingMessage).content?.split(/\s+/).length ?? 10
        cumulativeDelay += 2000 + Math.random() * 4000 + wordCount * 600
      }
      const delayMs = i === 0 ? sorted[i].delaySeconds * 1000 : cumulativeDelay
      // ... setTimeout(deliver, delayMs)
    }
  }
}
```

**Tests** : Generer 3 messages pour le meme user, verifier que les delais inter-messages sont 2-8s.

---

### 2.2 Cooldown par utilisateur

**Probleme** (architecture-review.md §9.2 #6)
`setCooldown()` et `isOnCooldown()` existent dans `RedisStateManager` (redis-state.ts:37-43)
mais ne sont appeles nulle part. Un meme agent peut intervenir a chaque cycle de 60s
sans aucun cooldown individuel.

**Fichiers** : `scheduler/conversation-scanner.ts`, `delivery/delivery-queue.ts`, `memory/redis-state.ts`

**Solution** :
1. Dans `DeliveryQueue.deliverMessage()`, apres publication reussie :
```
// Cooldown de 5 minutes apres envoi d'un message
await this.stateManager.setCooldown(conversationId, action.asUserId, 300)
```

2. Dans `ConversationScanner.processConversation()`, avant le graph.invoke,
   filtrer les controlled users en cooldown :
```
const activeUsers = []
for (const u of controlledUsers) {
  const onCooldown = await stateManager.isOnCooldown(conversationId, u.userId)
  if (!onCooldown) activeUsers.push(u)
}
// Passer activeUsers au graph au lieu de controlledUsers
```

Cela garantit qu'un utilisateur controle attend au minimum 5 minutes entre deux interventions.

**Injection** : `DeliveryQueue` a besoin d'une reference a `RedisStateManager` (ajouter au constructeur).

**Tests** : Envoyer un message agent, verifier qu'isOnCooldown retourne true pendant 5min.

---

### 2.3 Le Strategist propose toujours le meme nombre de messages

**Probleme** (lifecycle-detailed.md §4.2)
Le Strategist recoit `minResponsesPerCycle` (defaut 2) et `maxResponsesPerCycle` (defaut 12)
mais le LLM tend a toujours proposer un nombre proche du max, surtout quand la conversation
a beaucoup de controlled users. Il n'y a pas de ponderation par l'activityScore.

**Fichiers** : `agents/strategist.ts`

**Solution** :
Ajouter dans `buildStrategistPrompt()` une consigne dynamique basee sur activityScore :

```
const suggestedCount = activityScore < 0.2
  ? `1-2 interventions (conversation calme)`
  : activityScore < 0.5
    ? `2-4 interventions (activite moderee)`
    : `1-2 interventions max (conversation deja animee)`;

// Dans le prompt :
RECOMMANDATION DE VOLUME: ${suggestedCount}
```

Et dans `validateInterventions()`, clamper le nombre effectif par l'activityScore :
```
const dynamicMax = activityScore < 0.3
  ? Math.min(maxMessages, 3)
  : Math.min(maxMessages, Math.ceil(maxMessages * (1 - activityScore)))
```

**Tests** : Verifier qu'avec activityScore=0.6, max 2 messages sont generes meme si maxResponsesPerCycle=12.

---

## PRIORITE 3 — FIABILITE (le service fonctionne mais peut perdre des donnees)

### 3.1 DeliveryQueue volatile (perte au restart)

**Probleme** (lifecycle-detailed.md §7)
`DeliveryQueue` utilise des `setTimeout` en memoire Node.js. Au shutdown, `clearAll()`
detruit tous les timers. Les messages en attente sont perdus sans recours.

**Fichiers** : `delivery/delivery-queue.ts`

**Solution** :
Persister la queue dans Redis et la restaurer au demarrage :

1. A l'enqueue, sauvegarder chaque action dans un sorted set Redis :
```
Redis ZADD "agent:delivery-queue:{convId}" scheduledAt JSON(action)
```

2. Au demarrage, scanner tous les `agent:delivery-queue:*` et re-planifier :
```
for (const key of await redis.keys('agent:delivery-queue:*')) {
  const items = await redis.zrangebyscore(key, '-inf', '+inf', 'WITHSCORES')
  // Re-creer les setTimeout pour les items non expires
}
```

3. Apres livraison reussie, supprimer de Redis :
```
Redis ZREM "agent:delivery-queue:{convId}" JSON(action)
```

**Complexite** : Moyenne. Necessite d'injecter Redis dans DeliveryQueue.

**Tests** : Enqueue 3 messages, kill le process, restart, verifier que les messages sont re-planifies.

---

### 3.2 Profils Observer non persistes en MongoDB

**Probleme** (architecture-review.md §9.2, lifecycle-detailed.md §4.1)
L'Observer met a jour `toneProfiles` dans Redis (TTL 1h) mais ne les persiste pas en MongoDB.
Apres restart ou expiration Redis, tous les profils appris sont perdus.
Seuls les profils des `controlledUsers` (AgentUserRole) survivent, mais sans
`commonEmojis`/`reactionPatterns` (corrige en P1.3).

**Fichiers** : `scheduler/conversation-scanner.ts`, `mongo-persistence.ts`

**Solution** :
Apres chaque scan reussi qui produit des toneProfiles mis a jour,
persister les profils des controlled users mis a jour par l'Observer :

Dans `processConversation()`, phase F :
```
if (result.toneProfiles) {
  const profiles = result.toneProfiles as Record<string, ToneProfile>
  for (const user of controlledUsers) {
    const updated = profiles[user.userId]
    if (updated && updated.messagesAnalyzed > user.role.messagesAnalyzed) {
      persistence.upsertUserRole(conversationId, updated).catch(err => ...)
    }
  }
}
```

Cela synchronise periodiquement les profils enrichis par l'Observer dans MongoDB.

**Tests** : Scanner une conversation, verifier que AgentUserRole.messagesAnalyzed augmente.

---

### 3.3 Pas de reconnection ZMQ Gateway <-> Agent

**Probleme** (lifecycle-detailed.md §8)
Le gateway cree `ZmqAgentClient` au boot. Si l'agent service tombe et redemarre,
les sockets ZMQ ne se reconnectent pas automatiquement (PUSH buffer puis drop).
Pas de health check, pas de retry.

**Fichiers** : `services/gateway/src/services/zmq-agent/ZmqAgentClient.ts`

**Solution** :
ZMQ PUSH et SUB sockets se reconnectent automatiquement par defaut
(propriete `reconnectInterval`). Le vrai probleme est que le gateway
ne detecte pas la perte de connexion pour logger/alerter.

Ajouter un health check periodique cote gateway :
```
setInterval(async () => {
  try {
    const response = await fetch(`http://${agentHost}:3200/health`)
    if (!response.ok) logger.warn('[Agent] Health check failed')
  } catch {
    logger.warn('[Agent] Health check unreachable')
  }
}, 30_000)
```

Et cote agent, ajouter un compteur de messages recus dans le health endpoint
pour confirmer que le PULL socket est actif.

**Tests** : Arreter l'agent, verifier que le gateway log des warnings. Redemarrer, verifier retour.

---

## PRIORITE 4 — AMELIORATIONS (le service fonctionne mais peut etre meilleur)

### 4.1 Scan parallele des conversations

**Probleme** (architecture-review.md §11 #8, lifecycle-detailed.md §4)
`scanAll()` traite les conversations **sequentiellement** (boucle for).
Avec 50 conversations eligibles et 2+2N appels LLM chacune (~5s par conv),
un cycle peut prendre 250s, depassant le lock Redis de 300s.

**Fichiers** : `scheduler/conversation-scanner.ts`

**Solution** :
Utiliser `Promise.allSettled` avec un semaphore de concurrence :

```typescript
const CONCURRENCY = 3

async function processWithConcurrency(
  conversations: EligibleConversation[],
  processor: (conv: EligibleConversation) => Promise<boolean>,
  concurrency: number,
): Promise<void> {
  const queue = [...conversations]
  const running: Promise<void>[] = []

  while (queue.length > 0 || running.length > 0) {
    while (running.length < concurrency && queue.length > 0) {
      const conv = queue.shift()!
      const p = processor(conv).then(() => {
        running.splice(running.indexOf(p), 1)
      })
      running.push(p)
    }
    if (running.length > 0) await Promise.race(running)
  }
}
```

**Risque** : Le lock Redis de 300s doit etre augmente proportionnellement,
ou remplace par un heartbeat (PSETEX + refresh periodique).

**Tests** : Scanner 10 conversations, verifier que le temps total est ~3x plus rapide.

---

### 4.2 Web Search pour Anthropic

**Probleme** (architecture-review.md §9.2 #11)
`webSearchEnabled` ne fonctionne qu'avec OpenAI (tool `web_search_preview`
specifique a l'API Responses). Avec Anthropic, le flag est silencieusement ignore.

**Fichiers** : `llm/providers/anthropic-provider.ts`

**Solution** :
Si `webSearchEnabled` est true et provider est Anthropic, deux options :
1. Ajouter un tool `web_search` via le tool_use Anthropic (beta).
2. Ou pre-fetcher les resultats web via une API tierce (SerpAPI, Brave)
   et les injecter dans le contexte du prompt.

L'option 2 est plus simple et provider-agnostique.

---

### 4.3 Metriques et observabilite

**Probleme** (lifecycle-detailed.md §6)
Le service utilise `console.log`/`console.error` partout au lieu du logger Pino de Fastify.
Pas de metriques structurees (latence LLM, taux de rejet QualityGate, messages delivres).

**Fichiers** : Tous les fichiers du service agent.

**Solution** :
1. Remplacer tous les `console.log` par `server.log.info` (ou passer le logger aux services)
2. Ajouter des compteurs Redis pour les metriques operationnelles :
   - `agent:metrics:llm-calls:{date}` (compteur)
   - `agent:metrics:quality-gate-rejected:{date}` (compteur)
   - `agent:metrics:deliveries:{date}` (compteur)
   - `agent:metrics:skipped-activity:{date}` (compteur)
3. Exposer via `/metrics` endpoint (format Prometheus ou JSON)

---

## ORDRE D'EXECUTION RECOMMANDE

```
Phase 1 — Bugs critiques (sans cela le service est partiellement casse)
  1.1 Auto-pickup: appeler upsertGlobalProfile     ~1h
  1.2 Quality Gate reactif: extraire + reutiliser   ~2h
  1.3 Persister commonEmojis/reactionPatterns        ~1h (+ migration Prisma)

Phase 2 — Comportement humain (rend l'agent plus credible)
  2.1 Multi-message echelonne dans Scanner           ~2h
  2.2 Cooldown par utilisateur                       ~1h
  2.3 Volume dynamique par activityScore             ~1h

Phase 3 — Fiabilite (protege contre les pertes de donnees)
  3.1 Persister DeliveryQueue dans Redis             ~3h
  3.2 Persister profils Observer en MongoDB          ~1h
  3.3 Health check Gateway <-> Agent                 ~1h

Phase 4 — Ameliorations (optimisation)
  4.1 Scan parallele des conversations               ~3h
  4.2 Web Search pour Anthropic                      ~2h
  4.3 Metriques et observabilite                     ~3h

Total estime: ~21h de travail
```

---

## DEPENDANCES ENTRE ITEMS

```
1.3 (schema Prisma) doit etre fait AVANT 3.2 (persist Observer profiles)
1.1 (auto-pickup) est independant
1.2 (quality gate reactif) est independant
2.1 (multi-msg) est independant
2.2 (cooldown) necessite modification du constructeur DeliveryQueue
3.1 (persist queue) necessite Redis dans DeliveryQueue (meme changement que 2.2)

Donc l'ordre optimal est :
  1.3 -> 3.2 (schema d'abord, puis persist)
  1.1, 1.2, 2.1, 2.3 (en parallele)
  2.2 + 3.1 (ensemble car meme refactor DeliveryQueue)
  3.3, 4.1, 4.2, 4.3 (en parallele, independants)
```
