# Agent Service — Bugs Consolides (5 Analyses Paralleles)

> Resultats des 5 agents d'analyse specialises lances en parallele.
> 55 findings au total. Consolide par severite.

---

## CRITIQUE (5 findings)

### C1. Observer — Empty array du LLM ecrase les donnees accumulees
**observer.ts:62-74**
`(p.topicsOfExpertise as string[]) ?? existing?.topicsOfExpertise ?? []` : si le LLM retourne `[]` (tableau vide), toutes les donnees accumulees precedemment sont ecrasees. Un tableau vide est truthy pour `??`. L'utilisateur qui parlait de cuisine 2 cycles ago perd son expertise.
**Fix** : Merger au lieu de remplacer : `[...new Set([...(existing ?? []), ...(incoming ?? [])])]`

### C2. Observer — JSON.parse crash corrompt le summary
**observer.ts:43,86-89**
Si le LLM retourne du texte invalide, `parseJsonLlm` throw, le catch retourne `{}`. Le reducer de `summary` est `(_current, update) => update`, donc `summary` devient `undefined`. Corruption silencieuse.
**Fix** : Le catch doit retourner `{ summary: state.summary }` pour preserver l'existant.

### C3. Scanner — Lock Redis TTL (300s) < duree max de scan
**conversation-scanner.ts:96**
50 conversations × 10s/conv = 500s. Le lock expire a 300s, un second scan demarre, double deliveries et double budget consumption.
**Fix** : Heartbeat pattern (refresh lock toutes les 60s) ou TTL a 3600s.

### C4. Conversations sans AgentConfig eligibles par defaut
**mongo-persistence.ts:190-193**
`if (!conv.agentConfig) return true` — toute conversation group/channel/public sans config est scannee. L'agent peut poster dans des conversations jamais configurees.
**Fix** : Inverser : `conv.agentConfig?.enabled === true` (opt-in).

### C5. Activity Detector — L'agent se supprime lui-meme
**activity-detector.ts:15-28**
`getRecentMessageCount` compte TOUS les messages, y compris ceux de l'agent. Un burst de 4 messages agent = `messagesLast5Min > 5` = skip. L'agent s'auto-supprime.
**Fix** : Filtrer par `messageSource !== 'agent'` dans les queries d'activite.

---

## HIGH (15 findings)

### H1. Observer — messagesAnalyzed double-compte sur chaque cycle
**observer.ts:54-55**
La sliding window contient les memes messages entre deux cycles. Le compteur augmente a chaque invocation sans deduplication. Un user est `locked` en 5 cycles sans nouveaux messages.
**Fix** : Tracker un high-water mark (dernier messageId analyse) et ne compter que les nouveaux.

### H2. Observer — locked est permanent, le profil se fossilise
**observer.ts:52,77**
Une fois `locked=true` (50 messages analyses, gonfle par H1), le profil ne se met PLUS JAMAIS a jour. Si l'utilisateur change de style, l'agent l'imite mal indefiniment.
**Fix** : Decay de confiance (`confidence -= 0.01` par cycle) ou unlock apres 7 jours.

### H3. Observer — origin archetype ecrase en 'observed'
**observer.ts:60**
Si un profil archetype est dans `controlledUsers` mais pas dans `toneProfiles`, l'Observer le marque `origin: 'observed'` au lieu de preserver `'archetype'`.
**Fix** : Verifier `state.controlledUsers` et preserver l'origin originale.

### H4. Generator — Web Search silencieusement ignore par Anthropic
**generator.ts:131-134, anthropic-provider.ts**
`needsWebSearch=true` construit l'array `tools`, mais le provider Anthropic l'ignore. Pas d'erreur, pas de warning. Le LLM repond sans info factuelle.
**Fix** : Ajouter `supportsWebSearch: boolean` sur `LlmProvider`, garder dans generator.

### H5. QualityGate — Hash incompatibles entre QG et ReactiveHandler
**quality-gate.ts:94-96, reactive-handler.ts:237-244**
QG utilise `content.slice(0,100)`, ReactiveHandler utilise DJB2. Ils n'intersectent JAMAIS. Les messages reactifs echappent totalement au check de repetition historique.
**Fix** : Fonction de hash unique partagee (SHA-256 prefix ou normalisation commune).

### H6. ReactiveHandler — asUserId hallucine tombe sur le mauvais user
**reactive-handler.ts:79**
Si le LLM retourne un `asUserId` invalide, `find` retourne undefined, fallback `targetUsers[0]`. Le mauvais utilisateur repond. Aucun warning log.
**Fix** : `if (!targetUser) { console.warn(...); continue; }` au lieu du fallback.

### H7. Timing — 3-4s/mot est 3-4x trop lent
**timing-calculator.ts:22-25**
`perWord = randomBetween(3000, 4000)` = 15-20 WPM. Un humain tape 40-80 WPM (800-1500ms/mot). Un message de 10 mots prend 40s de "frappe".
**Fix** : `perWord = randomBetween(800, 1500)`, cap a 60s au lieu de 180s.

### H8. Scanner — `as any` cast sur deliveryQueue.enqueue
**conversation-scanner.ts:334**
`pendingActions as any` bypasse la validation de type. Si le graph retourne un objet sans `delaySeconds`, `setTimeout(fn, NaN)` fire immediatement.
**Fix** : Valider avec un schema Zod avant enqueue, supprimer le cast.

### H9. Budget — Reset UTC cause un reset a midi pour UTC+12
**daily-budget.ts:6-13**
`toISOString().slice(0,10)` et `getUTCDay()` sont en UTC. Pour NZ (UTC+12), le budget reset a midi local et vendredi soir compte comme samedi.
**Fix** : Documenter explicitement ou ajouter un timezone configurable.

### H10. Budget — Compteur stale, messages en vol non comptes
**daily-budget.ts:37-43**
`canSendMessage` lit le compteur Redis AVANT que `recordMessage` (fire-and-forget) ait incremente. Le cycle suivant pense qu'il reste plus de budget.
**Fix** : Awaiter `recordMessage` ou pre-incrementer a l'enqueue.

### H11. RedisState — JSON.parse sans try/catch sur tous les getters
**redis-state.ts:13,29,46**
Donnees Redis corrompues = crash du handler ZMQ entier. Aucun fallback.
**Fix** : try/catch sur chaque `JSON.parse`, fallback `[]` ou `{}`, log + delete key corrompue.

### H12. MongoPersistence — Double cast `as unknown as any[]` sur enum role
**mongo-persistence.ts:114,139**
Bypass complet de la type safety Prisma. Une typo dans `excludedRoles` ne matche rien silencieusement.
**Fix** : Importer le type `Role` Prisma et typer `excludedRoles: Role[]`.

### H13. MongoPersistence — updateAnalytics read-then-write race
**mongo-persistence.ts:232-262**
Deux scans concurrents lisent la meme valeur, ecrivent chacun `existing + N`, le second ecrase le premier. Un increment est perdu.
**Fix** : `prisma.agentAnalytic.upsert` avec `{ increment: data.messagesSent }`.

### H14. DeliveryQueue — rescheduleForUser drift temporel
**delivery-queue.ts:128-133**
Deux appels `Date.now()` dans le calcul. `scheduledAt` derive legerement a chaque reschedule. Sous charge, le drift s'accumule.
**Fix** : Capturer `const now = Date.now()` une seule fois.

### H15. ReactiveHandler — Double echec JSON.parse = perte silencieuse
**reactive-handler.ts:173-178,229-234**
Si `JSON.parse` ET `parseJsonLlm` echouent, l'exception monte au catch global qui log seulement. Aucune reponse, aucun retry, aucun fallback.
**Fix** : Retourner `{ shouldRespond: false }` / `{ messages: [] }` en fallback.

---

## MEDIUM (18 findings)

| # | Fichier | Ligne(s) | Description |
|---|---------|----------|-------------|
| M1 | observer.ts | 5-21 | Prompt francais only, enum values non normalises pour conversations non-FR |
| M2 | observer.ts | 48-79 | LLM peut halluciner des userIds inexistants, cree des profils fantomes |
| M3 | parse-json-llm.ts | 6-8 | Regex `^` ne matche pas si du texte precede le code fence |
| M4 | generator.ts | 8-12 | Fallback `'fr'` quand aucun `originalLanguage` — mauvais pour non-FR |
| M5 | generator.ts | 113 | `maxTokens = maxWords*1.5` trop bas pour scripts non-latins (arabe, chinois) |
| M6 | generator.ts | 151 | SKIP case-sensitive : `"skip"`, `"SKIP."`, `"Skip"` passent |
| M7 | quality-gate.ts | 141-151 | Prompt de validation en francais, degrade l'evaluation pour contenu non-FR |
| M8 | quality-gate.ts | 6-14 | AI-reveal patterns FR+EN seulement, 0 couverture ES/DE/PT/IT/AR |
| M9 | quality-gate.ts | 122,188 | contentHash = prefix 100 chars, collision sur messages avec meme debut |
| M10 | reactive-handler.ts | 58 | Double query DB pour controlledUsers (deja fetch dans server.ts:96) |
| M11 | reactive-handler.ts | 127 | Un seul topic pour tous les history entries (mauvais pour multi-user) |
| M12 | reactive-handler.ts | 237-245 | DJB2 hash: collisions 32-bit possible, suppression silencieuse |
| M13 | interpellation-detector.ts | 41 | Regex `\w` exclut accents et non-ASCII (`@etienne` non detecte) |
| M14 | interpellation-detector.ts | 17-21 | Greeting detection echoue pour multi-addressee (>4 mots apres strip) |
| M15 | config-cache.ts | 23-26 | Config `null` non cachee, chaque miss touche MongoDB |
| M16 | scanner.ts | 236 | Cold-start hard-code 50 msgs, ignore `contextWindowSize` config |
| M17 | scanner.ts | 175 | Double fetch `getAgentConfig` (deja dans eligible query) |
| M18 | daily-budget.ts | 45-49 | `canAddUser` jamais appele, limite user quotidienne non-enforced |

---

## LOW (12 findings)

| # | Fichier | Description |
|---|---------|-------------|
| L1 | observer.ts:68-69 | `topicsAvoided`/`relationshipMap` jamais peuples (absents du prompt) |
| L2 | generator.ts:33,119 | `conversationContext` param mort dans `buildGeneratorPrompt` |
| L3 | quality-gate.ts:86-109 | ReactiveHandler genere sans limites archetype, QG rejette apres |
| L4 | reactive-handler.ts:61 | `includes()` O(n) au lieu de Set |
| L5 | reactive-handler.ts:110-120 | +15s reschedule constant, ne scale pas avec la profondeur |
| L6 | interpellation-detector.ts:58-59 | Type 'reply' supprime quand mention co-existe |
| L7 | timing-calculator.ts:7-9 | Jitter sur base ~0 peut produire delai 0s |
| L8 | scanner.ts:220 | Mutation d'array (push) contraire au principe immutabilite |
| L9 | zmq-listener.ts:31 | Double appel startListening() cree heartbeat orphelin |
| L10 | config-cache.ts:50-51 | Connection subscriber orpheline si subscribe() throw |
| L11 | config-cache.ts:53-67 | Erreur Redis loggee comme erreur de parse JSON |
| L12 | eligible-conversations.ts:59 | `memberCount` toujours 0 (query sans _count) |

---

## STATISTIQUES

```
Total findings: 50
  CRITIQUE: 5
  HIGH:     15
  MEDIUM:   18
  LOW:      12

Par composant:
  Observer:               5 (1C, 3H, 1M)
  Generator:              5 (0C, 1H, 3M, 1L)
  QualityGate:            4 (0C, 1H, 2M, 1L)
  ReactiveHandler:        7 (0C, 2H, 3M, 2L)
  InterpellationDetector: 3 (0C, 0H, 2M, 1L)
  TimingCalculator:       2 (0C, 1H, 0M, 1L)
  ConversationScanner:    6 (1C, 1H, 2M, 2L)
  DailyBudget:            4 (0C, 2H, 1M, 1L)  (note: L12 moved to eligible)
  ActivityDetector:       2 (1C, 0H, 1M, 0L)  (note: M finding is part of C5)
  EligibleConversations:  2 (1C, 0H, 0M, 1L)
  RedisState:             1 (0C, 1H, 0M, 0L)
  MongoPersistence:       3 (0C, 2H, 0M, 1L)
  ConfigCache:            3 (0C, 0H, 1M, 2L)
  ZMQ:                    2 (0C, 0H, 1M, 1L)  (note: PUB/SUB is by design)
  DeliveryQueue:          1 (0C, 1H, 0M, 0L)
```

---

## DEJA CORRIGE DANS CETTE SESSION

| Finding | Fix applique |
|---------|-------------|
| Auto-pickup mort | P1.1: `upsertGlobalProfile` appele dans scanner |
| QG reactif absent | P1.2: checks deterministes dans ReactiveHandler |
| commonEmojis non persistes | P1.3: champs ajoutes dans Prisma + persistence |
| Multi-msg proactif | P2.1: echelonnement dans DeliveryQueue.enqueue |
| Cooldown user absent | P2.2: setCooldown apres delivery + filtrage pre-graph |
| Volume non-dynamique | P2.3: clampage par activityScore dans strategist |
| Observer profiles non persistes | P3.2: upsertUserRole dans scanner post-graph |
| Aleatoire insuffisant | Jitter ajoute sur tous les delais, cooldowns, scan intervals |
