# Android iteration — chat vivant : accusés de lecture temps réel + émission de frappe

Contexte : itération /loop Android. Baseline verte (testDebugUnitTest, SDK bootstrappé
dans le conteneur). Le rendu ✓/✓✓ (DeliveryStatusIcon) et l'indicateur de frappe
ENTRANT existent déjà ; il manque le flux temps réel `read-status:updated` → cache
Room et l'émission de frappe SORTANTE (parité iOS ConversationSocketHandler).

## Plan

- [x] RED — MessageRepositoryTest.applyReadReceipt : upgrade des messages propres
      server-acked ≤ frontière (deliveredCount/readCount), peers intouchés,
      bulles pending intouchées, pas de downgrade read→delivered, messages
      postérieurs à la frontière intouchés
- [x] RED — ChatViewModelTest : event read-status de la conversation ouverte →
      applyReadReceipt avec le summary ; event d'une autre conversation ignoré ;
      première frappe → emitTypingStart (une seule fois, throttle) ; re-émission
      après 3 s de frappe continue ; 3 s d'inactivité → emitTypingStop ; draft
      vidé → stop immédiat ; send → stop ; pas de stop si jamais démarré
- [x] GREEN — modèle : ReadStatusSummary + champ `summary` sur ReadStatusUpdatedEvent
      (défaut vide — robustesse décodage)
- [x] GREEN — MessageDao.listForConversation + MessageRepository.applyReadReceipt
      (transactionnel, upgrade monotone, sémantique frontière identique à iOS
      ConversationSyncEngine.applyReadReceipt)
- [x] GREEN — MessageSocketManager.emitTypingStart/emitTypingStop
- [x] GREEN — ChatViewModel : collect readStatusUpdated ; machine d'émission de
      frappe (start once + reemit 3 s + idle 3 s + stop sur send/clear)
- [x] Vérif : testDebugUnitTest + :app:assembleDebug verts
- [x] Commit + push sur claude/awesome-albattani-cecsyc

## Décisions

- Le summary du gateway est autoritaire (counts recalculés serveur) — on l'applique
  tel quel comme iOS, sans filtrer sur l'auteur de l'ack.
- Statut par message : read (readByAllAt non-null ou readCount>0) > delivered
  (deliveredCount>0) > sent. Upgrade only, jamais de downgrade.
- Frontière = event.updatedAt comparée à MessageEntity.createdAt (epoch millis,
  déjà calculé à l'insertion) — pas de re-parse ISO des payloads.
- Émission de frappe : timings iOS (re-emit 3 s, idle 3 s), emit direct sur le
  socket (pas d'outbox — un typing offline n'a aucun sens à rejouer).
- Vérifié côté gateway : getLatestMessageSummary exclut le curseur de l'expéditeur
  du dernier message — ma propre lecture ne marque jamais mes messages « lus ».

## Review

Itération livrée : le chat devient « vivant » des deux côtés du fil.

- core/model : ReadStatusSummary (+ summary sur ReadStatusUpdatedEvent, défaut vide).
- core/database : MessageDao.listForConversation.
- sdk-core : MessageRepository.applyReadReceipt (transactionnel, upgrade monotone
  sent→delivered→read, frontière = updatedAt vs createdAt epoch, 5 tests Robolectric) ;
  MessageSocketManager.emitTypingStart/Stop (payload {conversationId}, parité iOS).
- feature:chat : collect read-status:updated → cache Room (les ✓✓ existants dans
  MessageBubble se mettent à jour en temps réel via l'invalidation Room) ; machine
  d'émission de frappe (start à la 1re frappe, re-emit 3 s, stop après 3 s d'idle /
  draft vidé / send / onCleared), 7 tests ViewModel.
- Zéro changement UI nécessaire : DeliveryStatusIcon et TypingIndicator étaient
  déjà en place, seuls les flux manquaient.
- Suite complète verte : testDebugUnitTest + :app:assembleDebug.

Prochain incrément suggéré : pièces jointes images (picker + upload multipart +
rendu grille), ou présence en ligne (user:status + presence:snapshot → header),
ou recherche dans la conversation (MessageApi.search déjà câblé).
