# Real-Time Baseline — 2026-05-11

> Template — à remplir au moment de la mesure manuelle (Phase A Step 9.6 du plan).
> Référence : `docs/superpowers/plans/2026-05-11-realtime-instrumentation.md`.

## Comment relever les chiffres

1. Démarrer la gateway en local : `cd services/gateway && pnpm dev` (ou via tmux session `meeshy` window 1).
2. Lancer l'app iOS : `./apps/ios/meeshy.sh run`.
3. Envoyer un message texte simple vers `atabeth` depuis le simulateur.
4. Capturer la sortie stdout gateway autour du `clientMessageId` correspondant et la sortie Xcode console filtrée sur `subsystem:me.meeshy.app category:messages`.
5. Reporter les `durationMs` ci-dessous.

## Texte simple (WiFi local, gateway dev, simulateur)

```
clientMessageId: cid_____________________________________
```

| Step (chronological) | durationMs |
|---|---|
| `http.message.post` (total) | XXX |
| ↳ `http.message.post.handle` (effective handleMessage call) | XXX |
| `messaging.handleMessage` (total) | XXX |
| ↳ `messaging.validateRequest` | XXX |
| ↳ `messaging.resolveConversationId` | XXX |
| ↳ `messaging.participantLookup` | XXX |
| ↳ `messaging.detectLanguage` | XXX |
| ↳ `messaging.saveMessage` (total) | XXX |
| ↳↳ `messaging.processLinks` | XXX |
| ↳↳ `messaging.encryptionContext` | XXX |
| ↳↳ `messaging.prismaMessageCreate` | XXX |
| ↳↳ `messaging.handleAttachments` | XXX |
| ↳↳ `messaging.refreshAttachments` | XXX |
| ↳↳ `messaging.trackingLinks` | XXX |
| ↳↳ `messaging.mentionsAndNotifications` | XXX |
| ↳ `messaging.updateConversation` | XXX |
| ↳ `messaging.markAsRead` | XXX |
| ↳ `messaging.queueTranslation` | XXX |
| ↳ `messaging.updateStats` | XXX |
| `iOS perf:ios.send.start → perf:ios.send.ack` (round-trip total) | XXX |

## Audio (Socket.IO `message:send-with-attachments`)

```
clientMessageId: cid_____________________________________
```

| Step | durationMs |
|---|---|
| `ws.message.send-with-attachments` (total) | XXX |
| ↳ `messaging.handleMessage` | XXX |
| `ws.broadcastNewMessage` (post-ACK side effect) | XXX |

## Push (destinataire offline ou backgrounded)

```
tokenId: __________________________________
```

| Step | durationMs |
|---|---|
| `push.sendViaAPNS` | XXX |
| `push.sendViaFCM` | XXX |
| Token deactivated? (`push.token.deactivated` event) | yes/no |

## Observations à reporter dans le résumé final

- Quel est le step le plus coûteux ?
- Y a-t-il une corrélation entre `messaging.prismaMessageCreate` et le delta iOS perçu ?
- Le push APN arrive-t-il dans la seconde ou observable plus tard ?
- Découvre-t-on un step toujours nul (`durationMs: 0`) qui peut être supprimé du logging ?

Ces observations dirigent la planification de la **Phase B** (optimisation critical path).
