# Plan d'Implémentation — Optimisations Globales
**Date :** 2026-06-08  
**Source :** `docs/routine/analyses/2026-06-08-optimisation-globale.md`  
**Branche :** `claude/zen-albattani-UuWH7`

---

## PHASE 1 — Corrections Critiques Gateway (≈ 4h)

### P1-A : Fix pingTimeout (30 min)
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:195`  
- Passer `pingTimeout: 20000 → 60000`  
- Ajouter commentaire explicatif sur la valeur choisie

### P1-B : Batch N+1 unreadCount dans socket broadcast (1h)
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:1540-1570`  
- Extraire tous les `participant.id` du groupe avant la loop  
- Utiliser `Promise.all(participants.map(p => readStatusService.getUnreadCount(p.id, normalizedId)))`  
- Émettre en parallèle (pas séquentiel)

### P1-C : ZMQ retry — nouveau taskId (2h)
**Fichier :** `services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts`  
- Générer nouveau UUID à chaque retry : `taskId = `retry_${originalTaskId}_${attempt}``  
- Tracker `originalTaskId` dans le context pour le dedup côté translator  
- Augmenter timeout initial à 45s (actuel 30s)

### P1-D : Indexes Prisma manquants (30 min)
**Fichier :** `packages/shared/prisma/schema.prisma`  
- Ajouter `@@index([conversationId, userId, isActive])` sur Participant  
- Ajouter `@@index([senderId, createdAt(sort: Desc)])` sur Message  
- Ajouter `@@index([userId, expiresAt])` sur Notification  
- Ajouter `@@index([participantId, conversationId])` sur MessageReadCursor (si absent)

---

## PHASE 2 — Performance Web & UX (≈ 6h)

### P2-A : Clés de liste stables (30 min)
**Fichier :** `apps/web/components/conversations/conversation-item/ConversationItem.tsx` + `ConversationList`  
- Remplacer `key={`${group.type}-${conversation.id}-${convIndex}`}` par `key={conversation.id}`  
- Remplacer `key={`group-${group.type}-${groupIndex}`}` par `key={group.categoryId || group.type}`

### P2-B : Virtualisation liste de messages (2h)
**Fichier :** Composant affichage des messages  
- `@tanstack/react-virtual` est déjà installé  
- Wrapper la liste de messages avec `useVirtualizer`  
- Inverser le sens (messages du bas) via `estimateSize` + `scrollToIndex` on mount

### P2-C : Cache de traductions LRU borné (1h)
**Fichier :** `apps/web/services/message-translation.service.ts`  
- Remplacer le `Map<>` non borné par une implémentation LRU (max 500 entrées)  
- Clé : `${messageId}:${targetLanguage}`  
- Évinction automatique sur overflow (LRU = plus ancienne entrée)

### P2-D : Indicateur de frappe animé (1h)
**Fichier :** Composant typing indicator  
- Remplacer le texte statique par 3 dots SVG avec animation CSS `pulse`  
- Délai de disparition progressif (grace period 2 s après dernier event)

### P2-E : États visuels des messages (1h30)
**Fichiers :** `BubbleMessage`, `MessageStatus` composants  
- Ajouter icône selon état : `⌛` (optimistic) → `✓` (sent) → `✓✓` (delivered) → `✓✓` bleu (read)  
- Dériver l'état du champ `_tempId` (optimistic) ou `deliveredAt`/`readAt` du message

---

## PHASE 3 — ETag & Caching Réseau (≈ 3h)

### P3-A : ETag sur routes manquantes (2h)
**Fichiers :** Routes gateway non couvertes  
- `GET /notifications` — ajouter `sendWithETag()`  
- `GET /users/:id/profile` — ajouter `sendWithETag()`  
- `GET /posts/feed` — ajouter `sendWithETag()`  
- `GET /conversations/:id` (detail) — ajouter `sendWithETag()`

### P3-B : Cache-Control headers optimaux (1h)
**Fichiers :** Routes statiques / semi-statiques  
- Profil utilisateur : `private, max-age=60, stale-while-revalidate=300`  
- Feed posts : `private, max-age=30, stale-while-revalidate=120`  
- Données statiques (enum lookup) : `public, max-age=3600`

---

## PHASE 4 — Features Compétitives (≈ 12h)

### P4-A : Messages épinglés par conversation (3h)
**Gateway :** Nouvelle route `POST /conversations/:id/pin-message`, `GET /conversations/:id/pinned-messages`  
**Web :** UI dans le header de conversation, panneau "messages épinglés"  
**Schéma :** Ajouter `pinnedMessages PinnedMessage[]` sur `Conversation` ou champ `pinnedAt` sur `Message`

### P4-B : "Qui a réagi" — modal détail des réactions (2h)
**Web :** Composant `ReactionDetailModal`  
- Au clic sur une réaction, ouvrir modal avec liste des utilisateurs par emoji  
- Requête `GET /messages/:id/reactions` existante à consommer

### P4-C : Messages programmés / scheduled (4h)
**Gateway :**  
- Champ `scheduledAt: DateTime?` sur `Message` (Prisma schema)  
- Job `scheduled-messages.ts` — poll toutes les minutes, envoie les messages dont `scheduledAt <= now()`  
- Route `POST /conversations/:id/messages` accepte `scheduledAt`  
**Web :**  
- Bouton "Programmer" dans le composer avec date-picker  
- Section "Messages programmés" dans les infos de conversation

### P4-D : Typographie animée indicateur de frappe (30 min)
_(inclus dans P2-D, marqué ici pour traçabilité feature)_

---

## PHASE 5 — Architecture & Qualité (≈ 6h)

### P5-A : Activer TypeScript strict au build (2h)
**Fichier :** `apps/web/next.config.ts`  
- Désactiver `ignoreBuildErrors` et `eslint.ignoreDuringBuilds`  
- Corriger les erreurs de type révélées (≈ 50-100 attendues)

### P5-B : Singletons de services gateway (2h)
**Fichier :** `services/gateway/src/services/index.ts` (créer)  
- Exporter instances partagées : `attachmentService`, `trackingLinkService`, `mentionService`  
- Mettre à jour les imports dans routes et socketio handlers

### P5-C : `reply.send()` → `sendSuccess()` unification (1h)
**Fichiers :** Routes gateway utilisant encore l'ancien pattern  
- Grep pattern : `reply.send({` ou `reply.status(200).send({`  
- Remplacer par appels `sendSuccess(reply, data, options)`

### P5-D : Batch Socket.IO cache sync (1h)
**Fichier :** `apps/web/hooks/queries/use-socket-cache-sync.ts`  
- Introduire un debounce de 30ms sur les updates de cache  
- Regrouper les events Socket.IO arrivés dans la même fenêtre en une seule mutation React Query

---

## ORDONNANCEMENT D'IMPLÉMENTATION

```
Jour 1 matin  : Phase 1 complète (P1-A, B, C, D) — corrections critiques
Jour 1 après  : Phase 2 (P2-A, B, C) — performance web
Jour 2 matin  : Phase 2 (P2-D, E) + Phase 3 complète
Jour 2 après  : Phase 4 (P4-A, B) — features compétitives prioritaires
Jour 3 matin  : Phase 4 (P4-C, D) — scheduled messages
Jour 3 après  : Phase 5 complète — architecture & qualité
```

---

## CRITÈRES DE SUCCÈS

| Métrique | Avant | Objectif |
|----------|-------|----------|
| Requêtes DB par message reçu (groupe 10) | 10 (N+1) | 1 (Promise.all) |
| Faux `ping timeout` / heure | ~5 | 0 |
| Temps réponse `GET /conversations` (P95) | ~800ms | <300ms |
| Taille DOM liste de messages (1000 messages) | 1000 nodes | ~20 nodes (virtual) |
| Cache traductions — memory growth | Illimité | Max 500 entrées |
| Builds avec erreurs TS masquées | Fréquent | 0 (strict) |

---

## FICHIERS NON MODIFIÉS (scope protégé)

- `services/translator/` — ML models, pipelines audio (scope séparé)
- `packages/MeeshySDK/` — SDK iOS (scope iOS)
- `apps/ios/` — Application iOS (scope iOS)
- `infrastructure/` — Docker, Traefik (scope DevOps)
