# Real-Time Hotspots — Analyse heuristique pré-mesure (2026-05-11)

> Cette analyse précède les mesures réelles. Elle identifie les hotspots **probables**
> à partir du code instrumenté en Phase A. Les chiffres absolus seront obtenus en
> exécutant le runbook (`docs/superpowers/runbooks/realtime-instrumentation-analysis.md`).
> Cette analyse oriente Phase B en attendant les chiffres.

## Méthode

Pour chaque step instrumenté, on note :
- **I/O profile** : DB query, ZMQ push, HTTP externe, ou pur CPU
- **Bloquant pour le sender ?** : awaité dans le chemin avant l'ACK ?
- **Complexité observable** : nombre de queries Prisma, taille de l'`include`, présence de calls externes
- **Hot/cold** : appelé pour chaque message (hot) ou conditionnel (cold)

Les évaluations sont des **prior probabilities**, pas des mesures.

## Pipeline sender (REST POST + Socket.IO `message:send-with-attachments`)

| Step | I/O | Bloquant | Complexité | Probabilité d'être un hotspot |
|---|---|---|---|---|
| `messaging.validateRequest` | None (Zod local) | ✓ | O(1) | **🟢 Faible** |
| `messaging.resolveConversationId` | Cache + Prisma `findUnique` (cache miss) | ✓ | O(1) | 🟢 Faible (cache mémo) |
| `messaging.participantLookup` | **2-3 queries Prisma** | ✓ | O(1) × N queries | **🔴 Élevée** — voir Hotspot #2 |
| `messaging.detectLanguage` | franc local OU translator ZMQ | ✓ | dépend du contenu | 🟡 Moyenne — voir Hotspot #5 |
| `messaging.saveMessage` (total) | composite | ✓ | — | (somme des sous-steps) |
| ↳ `messaging.processLinks` | Prisma `findMany` + `create` par lien | ✓ | O(L) avec L = nb de liens | 🟢 Faible (la plupart des messages n'ont pas de lien) |
| ↳ `messaging.encryptionContext` | Prisma `findUnique` conversation | ✓ | O(1) | 🟢 Faible |
| ↳ `messaging.prismaMessageCreate` | **Prisma `create` + include lourd** | ✓ | O(1) avec 20+ join fields | **🔴 Élevée** — voir Hotspot #1 |
| ↳ `messaging.handleAttachments` | Prisma `updateMany`/`create` si attachments | ✓ | O(A) avec A = nb attachments | 🟡 Moyenne (pour messages texte = 0) |
| ↳ `messaging.refreshAttachments` | Prisma `findMany` | ✓ | O(A) | 🟡 Moyenne (seulement si attachments) |
| ↳ `messaging.trackingLinks` | Prisma `updateMany` | ✓ | O(L) | 🟢 Faible |
| ↳ `messaging.mentionsAndNotifications` | **MentionService + NotificationService + push trigger** | ✓ | O(M) avec M = nb mentions, + queries DB | **🔴 Élevée** — voir Hotspot #3 |
| `messaging.updateConversation` | Prisma `update` `lastMessageAt` | ✓ | O(1) | 🟢 Faible |
| `messaging.markAsRead` | Prisma `update` + diff status | ✓ | O(1-2) | 🟡 Moyenne |
| `messaging.queueTranslation` | ZMQ `push` (fire-and-forget côté ZMQ) | ✓ | O(1) | 🟢 Faible (le PUSH est local) |
| `messaging.updateStats` | Prisma `update` Stats agregate | ✓ | O(1) | 🟡 Moyenne (peut dégrader sur 100k+ msg) |

Total estimé pour un envoi texte simple (réseau MongoDB local) :
- 🟢 Baseline optimiste : ~50-80 ms
- 🟡 Cas attendu : ~150-300 ms (dominé par prismaMessageCreate + mentionsAndNotifications)
- 🔴 Cas pathologique : 500-1000 ms (notifications nombreuses, MongoDB lent)

## Top 5 hotspots probables

### Hotspot #1 — `messaging.prismaMessageCreate` 🔴

**Pourquoi** : c'est un `prisma.message.create()` avec un `include` à 20+ champs incluant nested `replyTo.sender.user` et `attachments`. MongoDB doit produire l'agrégation côté serveur DB avant retour. Sur réseau cellular ou MongoDB lent, ce step domine.

**Mesure attendue** : 50-200 ms en local sain, 300-800 ms en condition dégradée.

**Origine** : l'ACK Socket.IO callback / REST 200 OK est construit à partir de cet objet enrichi, donc le sender attend que TOUT le payload retourne avant de voir la coche.

**Pistes de fix (priorisées)** :
1. **Alléger l'include** : créer le message avec un `select` minimal (id, conversationId, senderId, createdAt, clientMessageId) pour l'ACK, puis charger les relations en arrière-plan pour le broadcast `message:new` aux destinataires.
2. **Séparer create from read** : `prisma.message.create({ data, select: { id: true } })` pour l'ACK, puis un `findUnique` enrichi dans `broadcastNewMessage` (en background après ACK).
3. **Index review** : vérifier que `(conversationId, clientMessageId)` est bien indexé (déjà fait via `partial index` per CLAUDE.md).

**Risque** : aucun fonctionnel — le client REST/Socket attend déjà l'objet enrichi seulement pour l'affichage optimiste, qu'il a déjà construit lui-même côté iOS (`MessageRecord.insertOptimistic`).

### Hotspot #2 — `messaging.participantLookup` 🔴

**Pourquoi** : 2-3 queries Prisma séquentielles (`findUnique` → `findFirst` fallback → `ensureParticipantFromMember`). Le legacy `userId-as-participantId` fallback fait un `console.error` deprecated mais reste en place pour compat.

**Mesure attendue** : 20-60 ms typique. Peut grimper si auto-création.

**Origine** : code de migration ConversationMember → Participant qui se déclenche encore en production pour les conversations anciennes.

**Pistes de fix** :
1. **Memoization in-memory** : un cache `Map<(participantId, conversationId), isActive>` avec TTL court (30s). Invalidé sur `participant:left`.
2. **Suppression du legacy fallback** : forcer le caller à passer le bon `Participant.id` partout. Le `console.error('DEPRECATED')` peut être promu en erreur après audit des callsites.
3. **Single combined query** : remplacer findUnique + findFirst par un seul `findFirst` qui couvre les deux cas.

### Hotspot #3 — `messaging.mentionsAndNotifications` 🔴

**Pourquoi** : ce step est awaité dans `saveMessage`. Il fait :
- Résolution des mentions (`MentionService`)
- Création d'un doc `Notification` en DB pour chaque destinataire
- Trigger push (lui-même fire-and-forget)

Pour un DM 1-1 c'est 1-2 documents. Pour un groupe de 50 utilisateurs c'est 50 `notification.create` séquentiels ou en `createMany`.

**Mesure attendue** : 30 ms pour DM, 200-500 ms pour groupes moyens, **possiblement plus** si encore en séquentiel.

**Origine** : le but original était de ne pas perdre les notifications. Mais elles n'ont PAS besoin d'être créées avant l'ACK sender.

**Pistes de fix (priorisées)** :
1. **Sortir du chemin bloquant** : remplacer `await handleMentionsAndNotifications(...)` par `setImmediate(() => handleMentionsAndNotifications(...).catch(logger.error))`. Le sender reçoit son ACK ; les notifications fan-out en background.
2. **Batch `createMany`** : si la fonction crée notifications séquentiellement, passer en `prisma.notification.createMany({ data: [...] })`.
3. **Idempotency** : si fan-out async, attention à la garantie at-least-once vs at-most-once en cas de crash gateway entre ACK et création — utiliser `MutationLog` (déjà disponible per commit `690c0a0e`).

### Hotspot #4 — `push.sendViaAPNS` / `push.sendViaFCM` 🟡

**Pourquoi** : HTTP/2 round-trip vers Apple/Google. Latence variable (typiquement 50-500 ms, mais Apple peut throttle).

**Mesure attendue** : 100-300 ms moyenne, plusieurs secondes si Apple lent ou retry.

**Origine** : fire-and-forget côté handler → **n'impacte pas l'ACK sender** mais détermine quand le destinataire voit la notif système.

**Pistes de fix** (déjà identifiés Phase A) :
1. **Retry exponentiel** sur erreurs transitoires (`InternalServerError`, `ServiceUnavailable`).
2. **Cleanup token agressif** : invalider après 1-2 failures `BadDeviceToken` / `Unregistered` au lieu de 3 — sinon 3 messages successifs vers un token mort = 3 round-trips ratés.
3. **`collapse-id` systématique** sur les notifs message d'une même conversation pour éviter les pile-ups.
4. **Vérifier `apnsEnvironment` mismatch** : si beaucoup de `BadDeviceToken`, c'est probablement un Debug build qui envoie sandbox alors que la clé est en prod.

### Hotspot #5 — `messaging.detectLanguage` 🟡

**Pourquoi** : si l'utilisateur ne fournit pas `originalLanguage`, on appelle un détecteur. Implémentation actuelle utilise `franc` local (rapide), mais peut hit le translator via ZMQ dans certains paths.

**Mesure attendue** : <5 ms si franc local, 50-200 ms si ZMQ.

**Origine** : client envoie souvent `originalLanguage` (via `detectKeyboardLanguage()` iOS), donc ce step n'est pas systématique.

**Pistes de fix** :
1. **Skip if `originalLanguage` provided** : déjà fait (`if request.content && !request.originalLanguage`).
2. **Forcer le client à toujours envoyer `originalLanguage`** : déjà le cas iOS.

## Notifications iOS (post-Phase A iOS instrumentation)

Logs nouveaux côté client :
- `perf:ios.notif.silent-push` + `.handled` : permet de mesurer le delta `gateway perf:push.sendViaAPNS phase=end → iOS perf:ios.notif.silent-push` (= latence APN réelle).
- `perf:ios.notif.voip-push` : pareil pour VoIP, et capture les phantom-pushes pour debugger les CallKit drops.
- `perf:ios.notif.socket.message-new` / `.reaction-added` / `.reaction-removed` : delta `gateway ws.broadcastNewMessage phase=end → iOS socket arrival` (= latence Socket.IO).

**Hypothèse à confirmer** : la coche horloge → ✓ que l'utilisateur perçoit est dominée par le RTT POST `/conversations/:id/messages` (env. iOS round-trip), pas par le broadcast Socket. Donc Hotspot #1 + #3 sont prioritaires devant #4.

## Phase B — propositions ordonnées

Une fois la baseline numérique remplie dans `tasks/realtime-baseline.md`, Phase B devrait s'attaquer (en évaluant le gain mesuré contre le risque) :

1. **B.1 — Sortir `mentionsAndNotifications` du chemin bloquant** (Hotspot #3) — gain estimé : 50-500 ms selon taille de la conversation. Risque : nécessite garantie de durabilité (MutationLog déjà en place pour ça).
2. **B.2 — Alléger l'include de `prismaMessageCreate`** (Hotspot #1) — gain estimé : 30-150 ms. Risque : aucune (le client a déjà l'optimistic).
3. **B.3 — Memoization `participantLookup`** (Hotspot #2) — gain estimé : 15-40 ms. Risque : invalidation cache à gérer.
4. **B.4 — UX iOS : implémenter `.invisible` / `.clock` / `.slow` states** dans `CoreModels.swift:365-395` (déjà définis, pas branchés). Masque l'horloge sur les envois < 200 ms — gain perçu immédiat, indépendant du backend.
5. **B.5 — Fiabilisation push** (Hotspot #4) — retry exponentiel + cleanup tokens agressif + collapse-id systématique.

Chacun de ces points devient un sous-plan `docs/superpowers/plans/2026-05-XX-realtime-phase-B-{N}.md` une fois la baseline confirmée.

## Avant Phase B — exécuter le protocole

```bash
# 1. Démarrer la gateway en local (tmux meeshy window 1) avec capture
cd services/gateway && pnpm dev 2>&1 | tee /tmp/gw.log

# 2. ./apps/ios/meeshy.sh run, envoyer 5-10 messages tests (texte + audio + groupe)

# 3. Analyser
./scripts/analyze-realtime-logs.sh /tmp/gw.log

# 4. Remplir tasks/realtime-baseline.md avec les durationMs réels

# 5. Confirmer ou infirmer chaque hotspot ci-dessus
```
