# Plan d'implémentation Optimisations — 2026-06-08

> **Basé sur** : `docs/routine/analyses/2026-06-08-optimization-analysis.md`  
> **Branche** : `claude/zen-albattani-3NFSb`  
> **Stratégie** : déploiement par phases, du plus impactant au plus complexe

---

## Phase 1 — Activations immédiates (0-effort, max impact)

### 1.1 Activer B1 — Socket language filter
- [ ] Changer défaut `SOCKET_LANG_FILTER` de `OFF` → `ON` dans `docker-compose.dev.yml`, `docker-compose.local.yml`, `docker-compose.prod.yml`
- [ ] Valider en tests : les 7 tests existants `__tests__/message-payload-filter.test.ts` doivent rester verts
- **Impact** : −75 % payload WebSocket pour 80 % des utilisateurs

### 1.2 Accept-Encoding sur web APIService
- [ ] Ajouter `'Accept-Encoding': 'br, gzip'` dans `this.config.headers` d'`ApiService` (`apps/web/services/api.service.ts:63`)
- **Impact** : Active Brotli (déjà configuré côté serveur) sur toutes les requêtes REST web

### 1.3 X-Request-ID tracing middleware (gateway)
- [ ] Créer `services/gateway/src/middleware/request-id.ts` : middleware Fastify qui génère `X-Request-ID` UUID v4 si absent, l'attache à `request.id` et le retourne dans la réponse
- [ ] Enregistrer dans `server.ts` avant tous les plugins
- [ ] Logger le `requestId` dans toutes les lignes de log via `logger.child({ requestId })`
- **Impact** : Debugging distribué complet, corrélation gateway → translator

---

## Phase 2 — UX Feature gaps (features backend ready, UI manquante)

### 2.1 Indicateur "Transféré" dans les bulles
- [ ] Dans `apps/web/components/common/bubble-message/BubbleMessage.tsx` : détecter `forwardedFromId` sur le message
- [ ] Afficher un badge/label "↪ Transféré" au-dessus du contenu (discret, couleur secondaire)
- **Impact** : Parité WhatsApp/Telegram, feature demandée depuis longtemps

### 2.2 UI Recherche de messages dans la conversation
- [ ] Créer `apps/web/components/conversations/MessageSearch.tsx` : input + résultats avec extraits
- [ ] Appeler `GET /api/v1/conversations/:id/messages/search?q=...` (backend déjà présent)
- [ ] Intégrer dans `ConversationLayout.tsx` : bouton loupe dans le header de conversation
- [ ] Scroll-to-message sur clic d'un résultat (utiliser `?around=<messageId>`)
- **Impact** : Feature gap critique vs toute la concurrence

### 2.3 UI Messages épinglés dans la conversation
- [ ] Créer `apps/web/components/conversations/PinnedMessageBanner.tsx` : bannière collante en haut montrant le dernier message épinglé, tap → scroll
- [ ] Appeler `GET /api/v1/conversations/:id/pinned-messages` (backend déjà présent)
- [ ] Écouter Socket.IO `message:pinned` / `message:unpinned` pour mise à jour temps réel
- [ ] Ajouter "Épingler" dans le menu contextuel des messages
- **Impact** : Feature gap critique, backend complet inutilisé

---

## Phase 3 — Optimisations réseau

### 3.1 Présence delta B5 (3h)
- [ ] Ajouter un champ `presenceVersion` dans l'auth socket handshake (envoyé par le client)
- [ ] `_emitPresenceSnapshot` : si `presenceVersion` présent, n'émettre que les contacts dont le statut a changé depuis cette version
- [ ] Versionner la présence en mémoire (Map `userId → {isOnline, version: number}`)
- [ ] Incrémenter la version à chaque changement de statut dans `_updatePresence`
- **Impact** : −95 % sur le burst de reconnexion (~4 KB → ~200 B)

### 3.2 Suppression base64 ZMQ D2 (4h)
- [ ] `services/translator/src/worker/worker_pool.py` : envoyer l'audio comme frame binaire ZMQ directement
- [ ] `services/gateway/src/services/message-translation/MessageTranslationService.ts` : lire frame binaire au lieu de décoder base64
- **Impact** : −33 % sur tous les transferts audio gateway ↔ translator

---

## Phase 4 — Observabilité & qualité (2h)

### 4.1 Métriques socket
- [ ] `MeeshySocketIOManager` : hook `onSend` comptant bytes par type d'event dans un Map en mémoire
- [ ] Endpoint interne `GET /internal/metrics` exposant les compteurs (auth via `ADMIN_SECRET`)

### 4.2 Cleanup dette technique
- [ ] Supprimer références à `conversation-store.ts` dans les docs web
- [ ] Marquer `TranslationCacheRecord` GRDB table comme unused (TODO: remove)
- [ ] Audit et suppression `ThreadView.swift` si non utilisé

---

## Phase 5 — Features avancées (long terme)

### 5.1 Messages éphémères — options durée (5h)
- [ ] UI composer : sélecteur durée (`off`, `15s`, `1min`, `1h`, `1j`, `7j`)
- [ ] API : `PATCH /conversations/:id/settings` avec `ephemeralDuration`
- [ ] Gateway : timer de suppression via Redis TTL + job cron

### 5.2 Opus audio D1 (8h)
- [ ] `services/translator/src/services/audio_pipeline/audio_message_pipeline.py` : output Opus au lieu de MP3
- [ ] iOS : déjà natif `AVPlayer` depuis iOS 11
- [ ] Web : Opus supporté par WebAudio API
- **Impact** : −60 à −80 % sur tous les fichiers audio

### 5.3 Sérialisation binaire Phase C (6+ semaines)
- [ ] C1 : `socket.io-msgpack-parser` sur gateway + web + iOS
- [ ] C3 : Protobuf pour `GET /messages` et `GET /conversations`

---

## Ordre d'exécution

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
  ↑ ce sprint          ↑ ce sprint        ↑ sprints futurs
```

Les phases 1-3 peuvent être exécutées en parallèle (elles touchent des fichiers disjoints).

---

## Fichiers clés touchés

| Phase | Fichiers modifiés |
|---|---|
| 1.1 | `docker-compose.*.yml` (3 fichiers) |
| 1.2 | `apps/web/services/api.service.ts` |
| 1.3 | `services/gateway/src/middleware/request-id.ts` (nouveau), `server.ts` |
| 2.1 | `apps/web/components/common/bubble-message/BubbleMessage.tsx` |
| 2.2 | Nouveau `MessageSearch.tsx`, `ConversationLayout.tsx` |
| 2.3 | Nouveau `PinnedMessageBanner.tsx`, `ConversationLayout.tsx` |
| 3.1 | `MeeshySocketIOManager.ts` |
| 3.2 | `audio_message_pipeline.py`, `MessageTranslationService.ts` |

---

*Plan créé le 2026-06-08*
