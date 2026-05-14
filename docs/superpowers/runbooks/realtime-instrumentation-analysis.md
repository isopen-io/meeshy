# Runbook — Real-Time Instrumentation Analysis

> Procédure pour mesurer la latence du pipeline d'envoi de message + push APN/FCM en utilisant l'instrumentation Phase A (commits `38b42de4..b4457909`).
>
> **Prérequis** : `jq` installé (`brew install jq`).
>
> **Public** : moi-même (Claude) ou tout opérateur qui veut diagnostiquer la perception de lenteur du chemin `tap → coche` et du delta APN.

## TL;DR

```bash
# 1. Lancer la gateway en mode dev avec sortie stdout capturée
cd services/gateway
pnpm dev 2>&1 | tee /tmp/gw.log

# 2. Déclencher un envoi depuis iOS / curl (voir scénarios ci-dessous)

# 3. Analyser
./scripts/analyze-realtime-logs.sh /tmp/gw.log
# Puis pour le détail d'un envoi précis :
./scripts/analyze-realtime-logs.sh /tmp/gw.log cid_a1b2c3d4-...
```

## Logs produits par l'instrumentation

Tous les events suivent le préfixe `perf:` dans le champ `msg`, et un `step` normalisé dans `data`. La clé de corrélation est `clientMessageId` (côté texte et audio).

| Source | Step (data.step) | Quand |
|---|---|---|
| `routes/conversations/messages.ts` | `http.message.post` | autour du POST REST `/conversations/:id/messages` |
| `socketio/handlers/MessageHandler.ts` | `ws.message.send`, `ws.message.send-with-attachments`, `ws.broadcastNewMessage` | handlers Socket.IO entrants + broadcast aux destinataires |
| `services/messaging/MessagingService.ts` | `messaging.handleMessage`, `messaging.validateRequest`, `messaging.resolveConversationId`, `messaging.participantLookup`, `messaging.detectLanguage`, `messaging.saveMessage`, `messaging.updateConversation`, `messaging.markAsRead`, `messaging.queueTranslation`, `messaging.updateStats` | orchestration complète |
| `services/messaging/MessageProcessor.ts` | `messaging.processLinks`, `messaging.encryptionContext`, `messaging.prismaMessageCreate`, `messaging.dedupFindFirst`, `messaging.handleAttachments`, `messaging.refreshAttachments`, `messaging.trackingLinks`, `messaging.mentionsAndNotifications` | sous-étapes de `saveMessage` |
| `services/PushNotificationService.ts` | `push.sendViaAPNS`, `push.sendViaFCM` + events structurés `push.sendViaAPNS.success/.failure`, `push.sendViaFCM.success/.failure`, `push.token.deactivated` | envoi push + désactivation tokens |

Côté iOS (`Logger.messages` / `Logger.network` / `perfLogger` category `calls`) :

| Source | Log | Quand |
|---|---|---|
| `ConversationViewModel.sendMessage` | `perf:ios.send.start`, `perf:ios.send.ack`, `perf:ios.send.fail` | tap envoi → ACK serveur reçu |
| `AppDelegate.didReceiveRemoteNotification` | `perf:ios.notif.silent-push`, `perf:ios.notif.silent-push.handled` | silent push reçu (delivery receipt) |
| `VoIPPushManager.pushRegistry didReceiveIncomingPush` | `perf:ios.notif.voip-push` | PushKit VoIP (CallKit) |
| `MessageSocketManager` `socket.on("message:new"\|"reaction:added"\|"reaction:removed")` | `perf:ios.notif.socket.message-new`, `.reaction-added`, `.reaction-removed` | Socket.IO event reçu |

## Scénarios

### Scénario 1 — message texte sender→destinataire

**But** : mesurer le delta tap-iOS → ACK serveur, et identifier le step le plus coûteux dans la gateway.

1. Démarrer la gateway en local (depuis tmux `meeshy` window `gateway` ou directement) :
   ```bash
   cd services/gateway && pnpm dev 2>&1 | tee /tmp/gw.log
   ```
2. Lancer l'app iOS : `./apps/ios/meeshy.sh run`.
3. Ouvrir une conversation. Repérer dans la console Xcode (filtre `subsystem:me.meeshy.app category:messages`) la ligne :
   ```
   [INFO] perf:ios.send.start clientMessageId=cid_<UUID>
   ```
4. Envoyer le message. Récupérer la fin :
   ```
   [INFO] perf:ios.send.ack clientMessageId=cid_<UUID> durationMs=NNN
   ```
5. Côté gateway :
   ```bash
   ./scripts/analyze-realtime-logs.sh /tmp/gw.log cid_<UUID>
   ```
6. Le rapport montre :
   - 🟢 / 🟡 / 🔴 par step
   - Total `messaging.handleMessage` (devrait être < `iOS durationMs` modulo RTT)
   - Le step le plus lent en bas

### Scénario 2 — audio (Socket.IO `message:send-with-attachments`)

Identique au scénario 1, mais regarder dans la gateway les events `ws.message.send-with-attachments` au lieu de `http.message.post`. Le step le plus intéressant ici est `messaging.prismaMessageCreate` (include lourd) et `messaging.mentionsAndNotifications` (qui inclut le trigger push).

### Scénario 3 — push APN à un destinataire offline

**But** : détecter les `BadDeviceToken`, `Unregistered`, mauvais env (sandbox vs prod), et mesurer la latence réseau vers Apple/Google.

1. Mettre l'app iOS en background (swipe-away ou backgrounding).
2. Envoyer un message à ce user depuis un autre compte.
3. Côté gateway :
   ```bash
   ./scripts/analyze-realtime-logs.sh /tmp/gw.log
   ```
4. Section **Push events** — chercher :
   - `perf:push.sendViaAPNS` start/end avec `durationMs`
   - `push.sendViaAPNS.success` (OK) ou `push.sendViaAPNS.failure` avec `reason` (e.g. `BadDeviceToken`, `Unregistered`, `TopicDisallowed`)
   - `push.token.deactivated` si le token vient d'être marqué invalide après 3 failures
5. Si `BadDeviceToken` répétitif : vérifier le mismatch `apnsEnvironment` côté `pushToken` en base vs l'env serveur. Si `Unregistered` : token périmé, le user doit relancer l'app pour ré-enregistrer.

### Scénario 4 — VoIP call (PushKit + CallKit)

1. Initier un appel depuis un autre device.
2. Côté gateway, chercher `perf:push.sendViaAPNS` avec `topic` matchant le `voipBundleId` (`me.meeshy.app.voip`).
3. Côté iOS, dans Console.app filtré sur `category:calls`, chercher :
   ```
   perf:ios.notif.voip-push receivedAt=<epoch> callId=<...>
   ```
4. Calculer le delta `gateway perf:push.sendViaAPNS phase=end → iOS perf:ios.notif.voip-push receivedAt`. C'est la latence APNs réelle pour ce push prioritaire.

## Hotspots attendus (à confirmer par la mesure)

D'après l'audit Phase A, les candidats prioritaires :

1. **`messaging.mentionsAndNotifications`** — synchrone et awaité, inclut la création des `Notification` docs en MongoDB + le trigger push (lui-même fire-and-forget). Sortir du chemin bloquant peut économiser plusieurs centaines de ms.
2. **`messaging.prismaMessageCreate`** — `include` lourd (sender + replyTo nested + attachments). Sur réseau lent vers MongoDB, 50-200 ms typiques. Alléger l'include en ne renvoyant que ce dont l'ACK a besoin.
3. **`messaging.participantLookup`** — peut faire jusqu'à 3 queries (findUnique → findFirst fallback → ensureParticipantFromMember). Cache memoizable.
4. **`push.sendViaAPNS` / `push.sendViaFCM`** — latence réseau vers Apple/Google, dégradation visible si Apple throttle ou si token invalide. Tracer ces erreurs explicitement permet de savoir si le délai perçu est dû à des retries OS-side ou à des tokens morts.

**Règle** : ne planifier la Phase B (optimisations) qu'**après** avoir des chiffres réels, pas sur la base de ces suppositions.

## Limites du protocole

- Les logs sont stdout. En prod (Docker), il faut `docker logs meeshy-gateway 2>&1 | tee /tmp/gw.log` puis copier le fichier en local pour `analyze-realtime-logs.sh`.
- Le script déduit la timeline à partir des `phase: 'start'` et `phase: 'end'`. Si la gateway crash en plein step, le `end` manque — c'est visible (pas de durationMs en bout de chaîne) mais le script ne l'imprime pas comme une alerte distincte. À surveiller manuellement.
- iOS et gateway sont sur des horloges potentiellement décalées. Pour les latences APN, comparer plutôt les `durationMs` (intra-process) que les timestamps absolus.

## Quand ré-exécuter ce protocole

- Avant **Phase B** : pour avoir une baseline numérique des hotspots
- Après chaque livraison Phase B : pour mesurer le gain et éviter de prétendre avoir optimisé sans preuve
- Périodiquement (mensuel ?) en prod : pour détecter une régression de latence avant les utilisateurs
