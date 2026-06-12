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

## Phase 3 — App : overlay aperçu (long-press + glisser)
- [ ] Geste long-press ET drag-down sur le toast (RootView)
- [ ] `NotificationPreviewOverlay` : réutilise la liste de messages de la conv
- [ ] `UniversalComposerBar` : showAttachment=false, showVoice=true, effets,
      flou / vue unique / éphémère, envoi réel via `ConversationViewModel`
- [ ] Résolution de la conversation depuis `conversationId` (cache-first)

## Contrainte
Environnement Linux sans Xcode : impossible de lancer `./apps/ios/meeshy.sh
build` / XCTest ici. Code écrit en suivant les patterns existants + tests SDK
purs ; **vérification du build à faire côté Mac/CI**.
