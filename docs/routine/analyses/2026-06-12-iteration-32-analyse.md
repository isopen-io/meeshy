# Iteration 32 — Analyse d'optimisation (2026-06-12)

## Contexte
Suite iter 31 (déclarations Fastify complétées, casts `(fastify as any)` éliminés — il ne reste que des mentions en README). Le chantier "type safety routes" est terminé. Conformément à la routine, nouvel audit ciblé : **chemin chaud d'envoi de message** (gateway Socket.IO) + audit bande passante général.

## Audits menés
- Gateway (`services/gateway/src`) : N+1, payloads, pagination, broadcasts.
- Web (`apps/web`) : re-renders, polling, bundle (constats consignés pour itérations futures).

## Constats retenus pour iter 32 (chemin chaud, risque faible, gain mesurable)

### 1. `_autoDeliverToOnlineRecipients` — instanciation par message + N+1 séquentiel (CRITIQUE)
`services/gateway/src/socketio/handlers/MessageHandler.ts:738-759`

Trois défauts cumulés sur CHAQUE message envoyé :
1. **`new PrivacyPreferencesService(this.prisma)` à chaque message** (dynamic import + instanciation). Conséquences :
   - le cache 5 min du service est **inutile** (instance jetable, cache vide à chaque message) ;
   - le constructeur démarre un `setInterval` de cleanup (10 min, `unref`) **jamais arrêté** → fuite de timers + rétention mémoire proportionnelle au nombre de messages envoyés.
   - Le manager possède déjà une instance partagée (`MeeshySocketIOManager.privacyPreferencesService`) injectée dans `StatusHandler`… mais pas dans `MessageHandler`.
2. **Boucle N+1 séquentielle** : `for (recipient) { await shouldShowReadReceipts(...) }` puis `await markMessagesAsReceived(...)` — N destinataires en ligne = 2N awaits séquentiels. À ~30-50 ms/req DB, une conversation de 10 participants bloque ~500 ms-1 s le pipeline d'auto-delivery.
3. **Double requête participants** : `participant.findMany` (destinataires, filtre `id != senderId`) puis un second `participant.findMany` (tous actifs) pour le fan-out des rooms — la première requête contient déjà l'information.

### 2. Validation séquentielle des attachments WS (MOYEN-HAUT)
`services/gateway/src/socketio/handlers/MessageHandler.ts:367-373`

`for (attachmentId) { await getAttachment(id) }` — 5 pièces jointes = 5 requêtes séquentielles (~250 ms) avant tout traitement du message. Parallélisable trivialement (lectures indépendantes).

## Constats consignés pour itérations futures (non traités ici)

| # | Constat | Localisation | Impact | Raison du report |
|---|---------|--------------|--------|------------------|
| F1 | `GET /conversations/:id` : `include participants` sans `take` (groupes 500+ → payload ~500 KB) | `routes/conversations/core.ts:599-633` | CRITIQUE | Changement de forme d'API — nécessite vérif consommation web/iOS avant cap |
| F2 | `SOCKET_LANG_FILTER` (filtrage des traductions par langue du destinataire) **OFF par défaut** — broadcast de toutes les langues à tous | `MessageHandler.ts` (`_buildMessagePayload`) | HAUT (~75 % bande passante multilingue) | Flip de défaut = validation produit/staging requise |
| F3 | Stores Zustand web `Map<string,T>` sans selectors (`user-store`, `conversation-preferences-store`) → re-renders globaux | `apps/web/stores/*` | ÉLEVÉ | Refactor web dédié |
| F4 | Pollings admin (10 s/30 s) remplaçables par events Socket.IO | `apps/web/components/admin/agent/*` | HAUT (admin only) | Nécessite events serveur correspondants |
| F5 | `recharts`/`mermaid` importés statiquement dans pages admin | `RankingStats.tsx`, `MermaidDiagramImpl.tsx` | ÉLEVÉ (bundle) | Itération web dédiée |
| F6 | `validatePagination` sans garde sur offsets extrêmes | `routes/conversations/messages.ts:414` | MOYEN | À traiter avec F1 |

## Décision iter 32
Corriger les constats 1 et 2 (chemin chaud d'envoi, zéro changement de contrat API, tests unitaires existants à étendre) :
- Injection du `PrivacyPreferencesService` partagé dans `MessageHandler` (supprime fuite + réactive le cache).
- Batch privacy via `getPreferencesForUsers` (déjà existant, parallèle + cache).
- `markMessagesAsReceived` en `Promise.allSettled` (upserts de curseurs indépendants par participant — sans contention).
- Une seule requête `participant.findMany` réutilisée pour destinataires + fan-out rooms.
- Validation attachments en `Promise.all`.

**Gain estimé** : latence d'auto-delivery divisée par ~N (participants en ligne) ; -1 requête Mongo/message ; -1 import dynamique + 1 instanciation + 1 timer fuité par message ; -200 ms sur envoi avec 5 attachments. Comportement fonctionnel strictement identique (mêmes events, mêmes payloads).
