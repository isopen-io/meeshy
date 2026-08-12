# Flow d'envoi de message — échec, retry, historique des tentatives

Date : 2026-07-08
Plateformes : iOS (implémenté), Android (à répliquer à l'identique)
Fichiers sources de vérité :
- État persisté : `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageState.swift`
- État d'affichage : `MeeshyMessage.DeliveryStatus` (`CoreModels.swift`)
- Machine à états : `MessageStateMachine.swift` (`maxRetries = 3`)
- Outbox durable : `OfflineQueue.swift` + `OutboxFlusher.swift` (`maxAttempts = 5`, backoff expo 2→30s)
- Historique des tentatives : `SendAttemptRecord.swift` + table GRDB `send_attempts`

## Principe

**Un message envoyé apparaît instantanément dans le flux, et n'affiche JAMAIS
d'aperçu d'échec tant que le budget de re-tentatives automatiques n'est pas
épuisé.** Le seul indicateur pendant la phase d'envoi est l'horloge (ou le
sablier hors-ligne). L'indicateur d'échec (badge « ! » rouge + barre retry
orange) est un état TERMINAL, atteint uniquement après épuisement des
tentatives automatiques ou sur rejet permanent du serveur.

## Cycle de vie

```
Composer ⏎
   │
   ▼
[optimistic insert GRDB, state=.sending]  ← bulle visible INSTANTANÉMENT
   │                                        glyphe : rien (<200ms) puis 🕐 clock
   │                                        hors-ligne : ⏳ hourglass
   │  (n messages enchaînables — envois concurrents, aucune sérialisation)
   ▼
Transport (texte) : socket-first `message:send` (~200ms ACK)
                    → REST POST /messages (timeout 12s)
                    → socket-fallback (ACK ≤10s)
Transport (média) : TUS upload → REST POST /messages (visuel)
                    ou `message:send-with-attachments` (audio)
   │
   ├─ ACK/200 ─────────────► [state=.sent] ✓  puis ✓✓ (delivered) / ✓✓ indigo (read)
   │                          `sentAt` = date serveur affichée dans la bulle
   │
   └─ échec de TOUS les transports du tour
        │
        ▼
      [applyEvent(.sendFailed) → state=.queued]   glyphe : 🕐 clock (teinte warning)
        │                                          PAS de badge exclamation,
        │                                          PAS d'aperçu d'échec
        ▼
      Outbox durable (OfflineQueue → OutboxFlusher)
        • 5 tentatives max, backoff expo 2s→30s + jitter
        • exemptions de budget : 401/session expirée, erreurs de TRANSPORT
          (avion, DNS, timeout, gateway injoignable) — deferred sans consommer
        • rejet permanent 4xx (400/403/404/413/422) → exhausted immédiat
        │
        ├─ succès ──────────► [.serverAck → .sent] ✓ (+ date serveur)
        │
        └─ épuisement ──────► [retryExhausted → state=.failed]
                               glyphe : ❗ rouge + BubbleFailedRetryBar (orange, ↻)
                               │
                               │  tap ↻ (retry manuel)
                               ▼
                             [.retry → .queued, budget réinitialisé]
                             → re-passe par sendMessage avec le MÊME
                               clientMessageId (dedup gateway
                               `(conversationId, clientMessageId)` → jamais
                               de doublon même si un envoi précédent avait
                               atteint le serveur avec ACK perdu)
```

## Règles non négociables

1. **Affichage instantané** : insert optimiste GRDB avant tout réseau ; la
   bulle apparaît immédiatement, la conversation remonte en tête de liste.
   Autant de messages consécutifs que la mémoire le permet (envois
   concurrents, dedup double-tap 600ms par contenu).
2. **Horloge tant que non envoyé** : `.sending`/`.clock`/`.slow`/`.queued`
   affichent une horloge simple (debounce 200ms pour ne pas flasher sur les
   envois rapides). Aucun glyphe évoquant un échec (pas de
   `clock.badge.exclamationmark`) tant que l'état n'est pas `.failed`.
3. **Échec = état terminal après retries** : `.failed` uniquement après
   épuisement du budget outbox (5 tentatives + backoff), ou rejet permanent
   4xx, ou blocage utilisateur. Jamais sur un premier échec transitoire.
4. **Tous les chemins passent par l'outbox** : texte ET médias. Un échec
   d'upload TUS en ligne ré-enfile le message dans l'outbox durable
   (`enqueueAudios`/`enqueueMedia`) — il ne bascule PAS directement en
   `.failed`.
5. **Idempotence** : le `clientMessageId` (`cid_<uuidv4>`) est généré une
   fois et réutilisé sur TOUTES les tentatives (socket, REST, outbox, retry
   manuel). Le gateway dédup via l'index partiel unique
   `(conversationId, clientMessageId)`.
6. **Retry manuel en place** : le tap sur la barre retry ré-émet le message
   EXISTANT (pas de delete/réinsert, pas de flash), remet le budget à zéro,
   et le glyphe repasse à l'horloge. Au succès, coches + date d'envoi serveur.

## Historique des tentatives (local)

Chaque tentative de transport est journalisée localement dans la table GRDB
`send_attempts` (SDK, `SendAttemptRecord`) :

| Colonne | Contenu |
|---|---|
| `localId` | `clientMessageId` du message (clé de jointure) |
| `attemptNumber` | 1..n, croissant sur toute la vie du message |
| `transport` | `socket-first` / `rest` / `socket-fallback` / `outbox` |
| `startedAt` / `finishedAt` | horodatage de la tentative |
| `outcome` | `success` / `failure` |
| `errorMessage` | description de l'échec (nil si succès) |

- Les détails du PREMIER envoi sont conservés après le succès (l'historique
  n'est jamais purgé au `serverAck`) — le soft-delete du message n'efface pas
  l'historique, la purge suit celle des messages.
- Sites d'enregistrement : `ConversationViewModel.sendMessage` (3 transports
  du tour initial et du retry manuel) + `OutboxFlusher.processRecord`
  (tentatives automatiques, kind `.sendMessage` uniquement).

### Affichage — vue détails (« Vues », sous-filtre Envoyé)

`MessageViewsDetailView` affiche pour les messages sortants une carte
« Historique d'envoi » : première tentative, chaque tentative (n°, heure,
transport, résultat, erreur), et l'heure d'envoi serveur au succès.

## Données de lecture des médias (vue détails)

Déjà en place — vérifié 2026-07-08 :
- Écriture : `POST /attachments/:id/status` avec `action`
  `listened`/`watched`/`viewed`/`downloaded` + positions
  (`AudioPlayerView`, `MeeshyVideoPlayer+Renderers`, `SharedAVPlayerManager`,
  `ImageViewerView`, `DocumentViewerView`, `MediaSaveCoordinator`).
- Modèle : `AttachmentStatusEntry` (Prisma) — `listenedAt`, `watchedAt`,
  positions, compteurs, complétion.
- Lecture : `GET /attachments/:id/status-details` → cartes de consommation
  et sous-filtres `Écouté`/`Regardé` de `MessageViewsDetailView`.

## Parité Android (à venir)

Répliquer : mêmes états (`sending/queued/failed/sent/delivered/read`), même
budget (state machine 3 + outbox 5, backoff 2→30s), mêmes exemptions
(transport/session), même `clientMessageId` de bout en bout, même table
locale d'historique des tentatives, même UI (horloge simple → ❗ + barre
retry orange terminale).
