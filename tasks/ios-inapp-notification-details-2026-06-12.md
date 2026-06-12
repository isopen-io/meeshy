# Notifications in-app iOS — précision + overlay aperçu (2026-06-12)

Objectif : rendre les notifications in-app iOS aussi précises que les push iOS
(utilisateur en titre, groupe en sous-titre, avatar user→groupe, phrases
précises pour réactions/commentaires/réponses/reposts/stories/statuts), et
ouvrir un aperçu de conversation en overlay au long-press / glisser sur le toast,
avec un composer simple (pas de pièces jointes fichier/photo, mais effets +
audio + flou / vue unique / éphémère, envoi réel).

## Phase 1 — SDK : précision des toasts ✅
- [x] `SocketNotificationContext.conversationAvatar` (fallback avatar groupe)
- [x] `SocketNotificationEvent+Toast.swift` : `toastTitle` / `toastSubtitle` /
      `toastBody` / `toastAvatarURL` / `toastAvatarName` / `toastAvatarColorSeed`
- [x] `NotificationToastView` : titre user, sous-titre groupe, avatar user→groupe
- [x] Tests SDK `SocketNotificationToastTests`

## Phase 2 — Gateway : avatar de conversation ✅
- [x] `NotificationContext.conversationAvatar` (type partagé)
- [x] `new_message` + `user_mentioned` propagent `conversation.avatar`
- [x] user=title / group=subtitle déjà géré par `buildPushHeader` (vérifié)

## Phase 3 — App : overlay aperçu (long-press + glisser) ✅
- [x] Geste long-press ET drag-down ("tirer à la main") sur le toast (RootView)
      + garde-fou `suppressToastTap` contre le double-déclenchement
- [x] Aperçu = `ConversationView(previewMode:)` présenté en `.sheet` (détents
      large/medium) au-dessus de la page courante → réutilise la liste de
      messages + le composer + l'envoi réel
- [x] `UniversalComposerBar` : `forceHideAttachment` (pas de fichier/photo),
      voix + effets conservés, toggle `showViewOnce` ajouté ; flou + éphémère
      déjà présents
- [x] `ConversationViewModel.isViewOnceEnabled` câblé dans `sendMessage` + reset
- [x] Résolution de la conversation depuis `conversationId` (cache-first :
      in-memory → GRDB → réseau), repli sur navigation normale

## Suites possibles
- iPad : le geste/aperçu n'est branché que dans `RootView` (iPhone). À répliquer
  dans `iPadRootView` si besoin.
- `conversationAvatar` n'est propagé que pour `new_message` et `user_mentioned`
  (les types « message de groupe »). Les autres types n'ont pas d'avatar de
  groupe (non pertinent).

## Contrainte
Environnement Linux sans Xcode : impossible de lancer `./apps/ios/meeshy.sh
build` / XCTest ici. Code écrit en suivant les patterns existants + tests SDK
purs ; **vérification du build à faire côté Mac/CI**.
