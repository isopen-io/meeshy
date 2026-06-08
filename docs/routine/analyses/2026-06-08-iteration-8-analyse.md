# Analyse Optimisation — Itération 8 (2026-06-08)

**Branche :** `claude/iter8-perf-reliability-HGWPs`

## Contexte

Construit sur les itérations 1–7. Cette itération cible deux optimisations
dans le service de notifications et le schéma Prisma.

## Analyse

### Issue #1 — NotificationService.createMentionNotificationsBatch : loop séquentielle (HAUTE)

**Fichier :** `services/gateway/src/services/notifications/NotificationService.ts:1064`

`createMentionNotificationsBatch` itère sur les `mentionedUserIds` et appelle
`createMentionNotification(...)` pour chaque utilisateur en séquence (`await` dans une boucle `for`).

`createMentionNotification` effectue pour CHAQUE destinataire :
1. `prisma.user.findUnique({ where: { id: mentionerId } })` — MÊME mentionneur pour tous
2. `prisma.conversation.findUnique({ where: { id: conversationId } })` — MÊME conversation pour tous
3. `createNotification(...)` — insert en base

Pour un message avec 10 mentions → **20 queries DB redondantes** + 10 inserts séquentiels.

**Fix :** Filtrer les utilisateurs éligibles synchroniquement, puis passer à `Promise.all()` pour
paralléliser tous les appels à `createMentionNotification`. Les queries internes s'exécutent en
parallèle au lieu d'en séquence.

Note : Une optimisation plus poussée serait de pré-fetcher mentioner+conversation une seule fois et
passer les données à un helper. Le `Promise.all` est plus safe car il ne touche pas à la logique
interne de `createMentionNotification` (rate limit checks, etc.).

**Impact :** Pour 5 mentions, latence 5× lower (5 queries parallèles au lieu de 10 séquentiels).

---

### Issue #2 — Prisma : index composites manquants sur Reaction et Mention (MOYEN)

**Fichier :** `packages/shared/prisma/schema.prisma`

**Reaction model :** Pas d'index sur `(participantId, createdAt DESC)`. Utile pour
"toutes les réactions d'un participant triées par date" — use case de l'historique
réactions dans le profil utilisateur.

**Mention model :** Pas d'index sur `(mentionedParticipantId, mentionedAt DESC)`. Utile pour
"toutes les mentions d'un participant triées par date" — use case de l'inbox des mentions
(feature future ou déjà en place pour certaines requêtes).

**Fix :**
- `Reaction`: `@@index([participantId, createdAt(sort: Desc)])`
- `Mention`: `@@index([mentionedParticipantId, mentionedAt(sort: Desc)])`

**Impact :** Queries "inbox mentions" et "historique réactions" : O(N) full-scan → O(log N).

---

## Issues non retenues

- **TTS blocking inference** : déjà corrigé — tous les backends utilisent `run_in_executor`
- **use-conversations-query staleTime** : déjà couvert globalement (`refetchOnWindowFocus: 'always'`, `refetchOnReconnect: 'always'`)
- **ConversationHandler membership cache** : impact real mais complexité élevée — reporté à iter-9
