## 2026-05-16 : Double coche pilotee par push pour les destinataires hors-ligne

**Contexte** : Le flux de statut message (sent -> delivered -> read) ne couvrait que les destinataires EN LIGNE. `MessageHandler._autoDeliverToOnlineRecipients` marque un message livre pour chaque destinataire ayant une socket active et emet `read-status:updated` -> l'auteur voit la double coche immediatement. Mais un destinataire HORS-LIGNE qui recoit seulement un push notification ne declenche aucune transition : l'extension iOS `MeeshyNotificationExtension` pre-enregistre le message localement mais ne rappelle jamais le gateway. Resultat : l'auteur reste sur simple coche jusqu'a ce que le destinataire ouvre l'app.

**Decision** :
- Nouvel endpoint `POST /api/v1/conversations/:conversationId/messages/:messageId/delivery-receipt` (`routes/message-read-status.ts`). Il resout la conversation, verifie l'appartenance, valide que le message existe et appartient bien a cette conversation (rejet d'un messageId spoofe/cross-conversation), puis delegue a `MessageReadStatusService.markMessagesAsReceived(participantId, conversationId, messageId)` et diffuse `read-status:updated` via le helper existant `broadcastReadStatusUpdate`.
- Comportement calque sur le sibling `mark-as-received` : le curseur de livraison est avance dans tous les cas (coherence `unreadCount`), mais le broadcast `read-status:updated` est supprime quand le destinataire a desactive `showReadReceipts`. No-op si l'appelant est l'auteur du message.
- Cote iOS, l'extension `NotificationService` appelle `NSEDataSync.postDeliveryReceipt` a reception d'un push de type message (`new_message`, `message_reply`, `reply`, `message_forwarded`, `new_conversation*`, `added_to_conversation`).
- `NSEDataSync.enqueueBackgroundPost` route l'appel via une **`URLSession` background** (`URLSessionConfiguration.background`, `sharedContainerIdentifier` = App Group). Le daemon systeme `nsurlsessiond` termine le transfert meme apres le teardown de l'extension (declenche par `contentHandler`), sans jamais retarder la banniere. Token Bearer lu depuis le Keychain partage, base URL resolue depuis l'allowlist (jamais depuis le payload push — coherent avec l'audit SSRF 2026-05-11).

**Alternatives rejetees** :
- **Reutiliser `POST /conversations/:id/mark-as-received`** : fonctionnellement equivalent (curseur time-based), mais pas de messageId explicite ni d'observabilite dediee au flux push-delivery. Un endpoint dedie clarifie la semantique.
- **`URLSession.shared` dans le `DispatchGroup` de l'extension** : plus simple mais (a) une requete reseau lente retarderait l'affichage de la banniere, (b) les tasks foreground meurent avec le process si `contentHandler` est appele avant la fin. La session background decouple totalement le receipt du rendu de la banniere et survit au teardown.
- **Capter les delivery-receipts APNs/FCM** : aucun lien fiable cote serveur entre un receipt APNs et un message ; APNs ne garantit pas la livraison.

**Consequences** :
- Le `read-status:updated` emis par l'endpoint est identique a celui du chemin online — l'auteur (iOS/web) le consomme deja, aucune modification client cote auteur.
- Livraison non garantie : si APNs ne delivre pas le push, ou si l'extension n'a pas de token valide, aucun receipt n'est emis ; la double coche apparaitra a l'ouverture de l'app. Acceptable et documente.
- Sur-comptage en groupe : `markMessagesAsReceived` avance un curseur time-based (`lastDeliveredAt = now`), donc tout message `createdAt <= now` est compte livre. Comportement pre-existant, identique au chemin online auto-deliver — accepte.
- `showReadReceipts` respecte cote serveur : la confidentialite du destinataire est preservee meme si le receipt est poste.

**Tests** : 9 tests route gateway (`__tests__/routes/delivery-receipt.test.ts`) — curseur avance + broadcast, 404 conversation/message, 403 non-membre, message cross-conversation, message supprime, `showReadReceipts` off (curseur sans broadcast), no-op self-sender, 400 messageId invalide. Cote iOS, l'extension NSE n'a pas de cible de tests dans le repo (comme `NSEDataSync.syncMessage` / `NSEDecryptor` pre-existants) ; verification via `./apps/ios/meeshy.sh build` (macOS requis).
