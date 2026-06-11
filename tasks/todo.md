# Android iteration — chat message actions (reactions, edit, delete)

Contexte : itération /loop Android. Baseline verte (testDebugUnitTest + assembleDebug).
La couche outbox (ADD_REACTION/REMOVE_REACTION/EDIT_MESSAGE/DELETE_MESSAGE senders +
coalescing) existe déjà ; il manque les mutations optimistes Room, le ViewModel et l'UI.

## Plan

- [x] Audit état Android vs iOS (agent) — cible retenue : réactions + édition + suppression dans le chat
- [x] RED — tests MessageRepository : toggleReactionOptimistic (add/remove, reactionSummary ±1),
      editOptimistic (content + isEdited + translations purgées + outbox EDIT_MESSAGE,
      refus des bulles pending), deleteOptimistic (deletedAt + outbox DELETE_MESSAGE)
- [x] RED — tests BubbleContentBuilder : ownReactions → ReactionEntry.includesMe
- [x] RED — tests ChatViewModel : long-press ouvre la feuille + hydrate ownReactions via
      ReactionRepository.fetchDetails ; toggleReaction décide add/remove ; startEdit remplit
      le draft avec le contenu original ; send() en mode édition appelle editOptimistic ;
      deleteMessage délègue ; cancelEdit nettoie ; events socket des pairs → delta Room,
      échos de soi ignorés (pas de double comptage)
- [x] GREEN — MessageRepository : toggleReactionOptimistic / applyReactionDelta /
      editOptimistic / deleteOptimistic (updateCachedMessage transactionnel partagé)
- [x] GREEN — BubbleContentBuilder param ownReactions ; ReactionChip highlight indigo + tap
- [x] GREEN — ChatViewModel : actionMessageId, editingMessageId, ownReactions (optimiste +
      hydratation fetchDetails + socket reaction:added/removed des autres → delta Room)
- [x] GREEN — ChatScreen : ModalBottomSheet actions (rangée emoji rapide ❤️😂🔥👏😮😢🥰👍,
      Copier/Modifier/Supprimer), bandeau mode édition dans le composer (icône check),
      bulles long-press + chips tappables
- [x] i18n EN + FR (feature:chat strings.xml)
- [x] Vérif : testDebugUnitTest + :app:assembleDebug verts (BUILD SUCCESSFUL)
- [x] Commit + push sur claude/wonderful-noether-gmdqqj

## Décisions

- Réactions "à moi" : pas dans le payload message REST (gateway n'envoie que reactionSummary) →
  état session dans le ViewModel, hydraté de façon autoritaire par fetchDetails(messageId)
  à l'ouverture de la feuille d'actions, mis à jour par les toggles optimistes ; les échos
  socket de ses propres réactions sont ignorés (déjà comptés optimistiquement).
- Édition/suppression : uniquement messages propres, server-acked (sendState == null),
  non supprimés. Lane = message:{conversationId} (FIFO avec les sends ; le coalescer gère
  déjà edit-merge et delete-supersedes-edit). Réactions sur lane partagée `reaction`
  (toggle annihilé par le coalescer).
- Édition purge les translations en cache (le Prisme ne doit jamais montrer une traduction
  périmée de l'ancien texte) ; la retraduction arrive par socket message:translated.
- Suppression = tombstone local immédiat (content + translations vidés — invariant de
  rétention ARCHITECTURE.md §18).
- Payloads outbox partagés (ReactionPayload public dans OutboxModel, EditMessageRequest
  réutilisé) au lieu des duplications privées du worker.

## Review

Itération livrée : les trois actions de message du chat (réagir, modifier, supprimer)
fonctionnent en optimistic-first avec file offline et temps réel.

- sdk-core : 4 nouvelles mutations repository, transactionnelles, testées (7 tests Robolectric).
- sdk-ui : ReactionChip interactif avec état "ma réaction" (indigo, charte respectée),
  bulle long-press via combinedClickable. 1 test builder.
- feature:chat : feuille d'actions bottom-sheet, mode édition du composer, 11 nouveaux
  tests ViewModel. Réactions des pairs appliquées en delta cache sans refetch complet.
- Suite complète verte : testDebugUnitTest + :app:assembleDebug.

Prochain incrément suggéré : filtres + recherche de la liste de conversations, ou
affichage de l'original sur bulle traduite (toggle Prisme), ou vue détail des réactions
(la plomberie fetchDetails est déjà en place).
