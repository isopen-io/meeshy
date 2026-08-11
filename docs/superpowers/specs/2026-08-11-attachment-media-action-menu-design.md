# Bouton "média" de la feuille "Plus…" : télécharger / transférer / supprimer

Date : 2026-08-11
Statut : approuvé (user « Oui »)
Périmètre : `MessageMoreSheet` (feuille "Plus…" du menu appui-long message). L'item `.deleteMedia` devient `.media`.

## Problème constaté (état actuel)

`MessageMoreSheet.swift` expose un item `.deleteMedia` :
- Icône `paperclip.badge.ellipsis`, teinte `MeeshyColors.error` (rouge), label "Supprimer le média".
- Au tap : `confirmationDialog` avec un SEUL bouton destructif "Supprimer le média" + Annuler.
- Handler : `onDeleteMedia` → `ConversationView.swift:754` → `viewModel.deleteAttachment(messageId:attachmentId:)`.

L'item ne sert donc qu'à supprimer, alors que l'icône elle-même ("paperclip.badge.ellipsis") évoque déjà un menu d'actions média générique, pas une suppression. L'utilisateur veut que ce point d'entrée devienne un vrai petit menu d'actions sur la pièce jointe : télécharger, transférer, supprimer — pas juste supprimer.

## Design cible

### A. Renommage de l'item
- `MoreItem.deleteMedia` → `MoreItem.media` (même rawValue string interdit par compat — c'est un enum interne, renommage direct sans migration).
- Icône inchangée (`paperclip.badge.ellipsis`).
- Couleur : `theme.textSecondary`/neutre au lieu de `MeeshyColors.error` — l'action n'est plus intrinsèquement destructive.
- Label : "Média" (au lieu de "Supprimer le média").

### B. Sous-menu à 3 actions
Le `confirmationDialog` déclenché au tap gagne deux boutons AVANT "Supprimer" (qui reste `role: .destructive`, en dernier — convention HIG : les actions non destructives d'abord) :

1. **Télécharger** — réutilise le handler existant de `.saveMedia` (`ConversationView.swift:1935-1947`, `mediaSaveCoordinator.requestSave(MediaSaveRequest(...))`). Zéro nouvelle logique : le call site `.media` construit le même `MediaSaveRequest` depuis `msg.attachments.first`.
2. **Transférer** — réutilise le handler existant de `.forward` (`composerState.forwardMessage = msg`, `ConversationView.swift:749`). Un message audio/média est déjà transférable tel quel via ce chemin.
3. **Supprimer** — handler `onDeleteMedia` inchangé (`viewModel.deleteAttachment`).

Titre du dialog : "Ce média" (remplace "Supprimer ce média ?" — plus de question fermée sur une seule issue destructive). `confirmationDialog` de SwiftUI n'a qu'un seul `message:` global (pas par bouton) : il est RETIRÉ (pas de sous-titre) — "Cette action est irréversible" ne s'applique qu'à une des 3 options désormais et serait trompeur affiché pour Télécharger/Transférer. La distinction se fait par le `role: .destructive` du seul bouton Supprimer (rouge, iconographie système standard).

## Non-régression (intouchés)
- `deleteAttachment` (ViewModel), `mediaSaveCoordinator.requestSave`, `composerState.forwardMessage` : signatures et comportements inchangés, seulement de nouveaux call sites.
- Tous les AUTRES items de `MessageMoreSheet` (reply, forward, thread, pin, star, delete message, language, transcription, reactions, views, sentiment, history, report) : inchangés.
- `MessageActionResolver.moreSections` : le renommage `.deleteMedia` → `.media` doit se refléter partout où l'enum est référencé (grep exhaustif requis à l'implémentation — au minimum `MessageMoreSheet.swift`, `MessageActionResolver.swift`, tests associés).

## Tests (TDD)
1. `MessageActionResolverTests` (si existant) ou nouveau test : `moreSections` expose bien `.media` (pas `.deleteMedia`) quand `ctx.canDelete && ctx.hasMedia`.
2. `MessageMoreSheetTests` (ou équivalent) : tap sur l'item `.media` déclenche le `confirmationDialog` ; les 3 boutons appellent bien `onDownloadMedia`/`onForwardMedia`(ou `onForward` réutilisé)/`onDeleteMedia` respectivement — vérifier via un mock/spy sur les closures, pas juste l'apparition du dialog.
3. Vérifier qu'aucun autre test n'assertait sur le libellé "Supprimer le média" au niveau de l'item (grep `deleteMedia`/`Supprimer le média` avant de committer — casse potentielle d'un test existant, à corriger dans la même passe TDD).
