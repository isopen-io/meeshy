# Fixes rendu conversation iOS — 2026-05-19

Worktree : `.claude/worktrees/feat+ios-conversation-rendering-fixes`
Branche : `worktree-feat+ios-conversation-rendering-fixes` (depuis `main` HEAD)
Méthode : TDD (RED → GREEN → REFACTOR), `./apps/ios/meeshy.sh test` vert avant commit.

## Décisions (validées par l'utilisateur)
- P1 : emoji-réponse en grande taille 90/60/45pt (comme les emojis libres)
- P3b : indicateur de frappe en bulle alignée expéditeur (gauche, avatar + animation de points)
- P4 : corriger le compteur — récupération des orphelins `.inflight`

## Problème 1 — Emoji-réponse en bulle, centré, agrandi
Cause : `BubbleContentBuilder.swift:57-64` — garde `message.replyTo == nil` désactive la
détection emoji pour toute réponse → emoji-réponse rendu texte 15pt.

- [ ] RED : test `BubbleContent` — emoji-only détecté même avec `replyTo != nil`
- [ ] Détecter emoji-only sur `message.content` indépendamment de `replyTo` (garder garde `attachments.isEmpty`)
- [ ] `BubbleStandardLayout` : `isEmojiOnly && reply == nil` → `emojiOnlyContent` (libre, inchangé) ;
      `isEmojiOnly && reply != nil` → bulle avec quote + emoji 90/60/45pt centré
- [ ] Nouvelle sous-vue `BubbleEmojiReply.swift` (Equatable, inputs primitifs) — quote en haut + emoji centré
- [ ] Entrées pbxproj pour le nouveau fichier (objectVersion 63, 4 entrées + 2 UUID)
- [ ] Non-régression : emoji non-réponse reste libre/hors bulle

## Problème 2 — Transcriptions audio instantanées (SWR inline)
Cause : transcriptions dans dico latéral `messageTranscriptions[msgId]`, peuplé après le
tableau des messages → flash.

- [ ] RED : test ViewModel — transcription disponible dès le 1er rendu (cache GRDB) sans 2e passe
- [ ] Hydrater `messageTranscriptions` depuis GRDB de façon atomique avec la pose des messages
- [ ] Garder `scheduleTranscriptionRetry` uniquement pour les transcriptions réellement absentes
- [ ] Vérifier le chemin `BubbleStandardLayout.transcription`

## Problème 3a — Typing dans le « dernier message » de la liste
Cause : `typingUsernames[conversation.id]` revient `nil` (`ThemedConversationRow.swift:446`).

- [ ] Runtime : instrumenter la souscription `typingStarted`/`typingStopped` du ViewModel liste
- [ ] Confirmer : souscription non câblée OU `scheduleTypingCleanup` trop agressif
- [ ] RED + fix selon cause confirmée

## Problème 3b — Indicateur de frappe dans le flux (bulle alignée expéditeur)
Cause : `ConversationView.swift:993-1004` — overlay position absolue → rogne le dernier message.

- [ ] Retirer l'overlay `inlineTypingIndicator`
- [ ] Rendre l'indicateur comme dernier élément DANS le contenu scrollable, bulle alignée gauche
- [ ] Vérifier : dernier message non masqué + scroll-to-bottom inclut l'indicateur

## Problème 3c — Composant retour-au-bas : doublon + débordement + suffixe
Cause : `ConversationScrollControlsView.swift:66-73` suffixe codé en dur ; label dupliqué.

- [ ] RED : test `typingLabel` — auteur seul, sans « écrit »
- [ ] Retirer le suffixe « écrit »/« écrivent »
- [ ] Corriger le doublon (double alimentation array vs dict)
- [ ] `lineLimit(1)` + troncature

## Problème 4 — Bandeau « Synchronisation… » bloqué
Cause : `ConnectionBanner` lié à `OfflineQueue.pendingCount > 0` ; orphelin `.inflight` jamais résolu.

- [ ] Runtime : instrumenter `OfflineQueue.refreshPendingCount()` — logguer le compte + dump records
- [ ] Confirmer la cause exacte du compteur bloqué
- [ ] RED : test — un orphelin `.inflight` ne doit pas bloquer le compteur indéfiniment
- [ ] Fix : recovery des orphelins `.inflight` au cold start (et que `flush()` les reprenne)

## Vérification finale
- [ ] `./apps/ios/meeshy.sh test` vert
- [ ] `./apps/ios/meeshy.sh run` + smoke visuel des 6 cas
- [ ] Section revue ajoutée en bas de ce fichier

---

## Avancement (2026-05-19)

### Fait
- **Déblocage** : `applyEditedAudio` a été livré entre-temps sur `main` par le commit
  `601bd8eb` (parallèle). Mon implémentation locale (doublon) a été retirée ; on
  rebase sur `main` pour reprendre la version canonique.
- **P1** : garde `replyTo == nil` retiré (`BubbleContentBuilder`) + branche emoji-réponse
  dans `BubbleStandardLayout` (emoji 90/60/45pt centré en bulle, quote au-dessus).
  4 tests `BubbleContentMatrixTests` verts. Rendu visuel à smoke-tester.
- **P3c** : `ConversationScrollControlsView.typingLabel` → `static func` testable,
  sans suffixe « écrit », dédupliqué (ordre préservé), compacté. 6 tests `MeeshyUITests`
  écrits (à exécuter via scheme `MeeshySDK-Package`).
- **P2** : `loadMessages` (.fresh/.stale) + `refreshMessagesFromAPI` réordonnés —
  transcriptions peuplées sans `await` intercalé → atomiques avec la pose des messages.
  Vérif visuelle (pas de flash) à faire.

### Suite — nécessite session runtime
- **P3b** : déplacer l'indicateur de frappe hors de l'overlay absolu. Bulle alignée
  expéditeur + réservation d'espace bas pour ne plus rogner le dernier message.
- **P3a** : `typingUsername` nil au runtime — Equatable de `ThemedConversationRow`
  inclut bien `typingUsername` (pas un bug d'Equatable). Instrumenter la souscription.
- **P4** : compteur `OfflineQueue.pendingCount` bloqué — instrumenter `refreshPendingCount`,
  confirmer l'orphelin `.inflight`, corriger la recovery.
