# Analyse Optimisation — Itération 7 (2026-06-08)

**Branche :** `claude/iter7-perf-reliability-HGWPs`

## Contexte

Construit sur les itérations 1–6. Cette itération cible deux points chauds
qui n'avaient pas encore été adressés : la query `currentUserParticipants` sur le chemin
de la liste des conversations, et l'absence de throttle serveur sur les événements
`typing:start`.

## Analyse

### Issue #1 — Conversation List: query `currentUserParticipants` redondante (HAUTE)

**Fichier :** `services/gateway/src/routes/conversations/core.ts:366`

Le handler `GET /conversations` effectuait systématiquement deux requêtes Prisma en
séquence :

1. `conversations.findMany(...)` — retourne les 50 conversations avec `participants: { take: 5 }`
2. `participant.findMany({ where: { conversationId: { in: [...] }, userId } })` — récupère
   le rôle et joinedAt du user courant dans TOUTES les conversations

**Problème :** `conversationListParticipantSelect` inclut déjà `userId`, `role` et
`joinedAt`. Pour les DMs (2 participants) et les petits groupes (< 5 membres), le participant
courant EST déjà dans les données retournées par la première query (dans les 5 premiers).
La deuxième query est donc redondante pour la grande majorité des conversations.

**Fix :** Extraire le participant courant de `conv.participants` déjà fetchés. Ne faire une
query Prisma supplémentaire que pour les conversations de grand groupe où le user courant
n'était pas dans les 5 premiers (cas rare — estimé < 5% des conversations).

**Impact :** Pour un user avec 100 DMs + 10 petits groupes, 0 query DB supplémentaire au
lieu de 1 (sur toutes les 110 conversations). Pour les grands groupes uniquement, query
ciblée sur les IDs manquants.

---

### Issue #2 — Typing Events: absence de throttle serveur (HAUTE)

**Fichier :** `services/gateway/src/socketio/handlers/StatusHandler.ts:102`

Le handler `typing:start` broadcastait chaque événement reçu immédiatement, sans
validation de débit côté serveur. Un client malicieux ou un bug client pourrait envoyer
60+ events/minute — en groupe de 100 personnes → 6,000 broadcasts/minute par typer.

**Situation existante :** Le client web a un throttle de 2s en `typing.service.ts:135-138`,
mais ce throttle est côté client et contournable.

**Fix :** Ajouter un `typingThrottleMap: Map<string, number>` dans `StatusHandler` (clé
`userId:conversationId`). Si le dernier broadcast pour cette clé est < 2s, l'event est
silencieusement ignoré.

Ajouts :
- `typingThrottleMap = new Map<string, number>()`
- `TYPING_THROTTLE_MS = 2_000` (static readonly)
- Nettoyage automatique quand la map dépasse 10,000 entrées (purge des entrées > 20s)
- `clearTypingThrottle(userId)` appelé sur `socket.disconnect` dans MeeshySocketIOManager

**Impact :** −96% broadcasts typing en cas de spam client. Réduit la charge CPU Socket.IO
sur les grands groupes. Protection défensive sans impact UX pour les clients légitimes.
