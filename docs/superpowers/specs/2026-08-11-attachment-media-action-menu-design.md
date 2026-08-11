# Bouton "média" de la feuille "Plus…" : enregistrer / transférer / supprimer

Date : 2026-08-11
Statut : approuvé (user « Oui »)
Périmètre : 3 fichiers — `MessageMoreSheet.swift` (feuille "Plus…" du menu appui-long : item + dialog), `MessageActionResolver.swift` (renommage de l'enum) et `ConversationView.swift` (câblage du nouveau closure, bloc 728-772 uniquement). L'item `.deleteMedia` devient `.media` et son dialog passe de 1 à 3 actions : Enregistrer / Transférer / Supprimer.

⚠️ **Collision de fichier avec le chantier « Plus… ouvre Vues »** (`2026-08-11-message-more-jumps-to-views-design.md`) : les deux modifient `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`. Ce spec y touche le bloc `MessageMoreSheet(...)` (lignes 728-772, ajout d'un `onSaveMedia:`) ; l'autre y touche les deux call sites de `.more` (1807-1810 et 1976-1982). Zones disjointes, mais **jamais les deux en parallèle dans deux worktrees** sans rebase — ou merger celui-ci en premier.

## Problème constaté (état actuel — vérifié ligne à ligne le 2026-08-11)

`MessageMoreSheet.swift` expose un item `.deleteMedia` (`MessageActionResolver.swift:12`, ajouté aux sections en `:92` sous `ctx.canDelete && ctx.hasMedia`) :
- Icône `paperclip.badge.ellipsis` (`MessageMoreSheet.swift:426`), teinte `MeeshyColors.error` (`:334`), label "Supprimer le média" (`:450`, clé `action.delete_media`).
- Au tap (`handleMoreItemTap`, branche `else if item == .deleteMedia` en `:237-240`) : arme `@State showDeleteMediaConfirm` (`:43`) → `confirmationDialog` (`:94-106`) avec un SEUL bouton destructif "Supprimer le média" + Annuler + un `message:` « Cette action est irréversible. ».
- Handler : `onDeleteMedia` (paramètre `MessageMoreSheet.swift:22`) → `ConversationView.swift:754-758` → `viewModel.deleteAttachment(messageId:attachmentId:)` sur `msg.attachments.first?.id` (PAS de filtre `.location`).

L'item ne sert donc qu'à supprimer, alors que l'icône elle-même ("paperclip.badge.ellipsis") évoque déjà un menu d'actions média générique, pas une suppression. L'utilisateur veut que ce point d'entrée devienne un vrai petit menu d'actions sur la pièce jointe : enregistrer, transférer, supprimer — pas juste supprimer.

## Design cible

### A. Renommage de l'item
- `MoreItem.deleteMedia` → `MoreItem.media`. `MoreItem` est un `enum … : String, Equatable` **interne à l'app** ; vérifié : AUCUN `MoreItem(rawValue:)` nulle part, aucune persistance du rawValue → renommage direct, sans migration.
- Sites à renommer dans le même commit (grep vérifié, liste exhaustive à ce jour) : `MessageActionResolver.swift:12` (déclaration), `:92` (append) ; `MessageMoreSheet.swift:237` (branche de `handleMoreItemTap`), `:324` (`isExploration`), `:334` (`colorFor`), `:416` (`destination`), `:426` (`symbol`), `:450` (`labelText`).
- Icône inchangée (`paperclip.badge.ellipsis`).
- Couleur : `theme.textSecondary`/neutre au lieu de `MeeshyColors.error` — l'action n'est plus intrinsèquement destructive. (`colorFor(_:)` est une méthode d'instance, `theme` y est accessible.)
- Label : "Média" (au lieu de "Supprimer le média").
- **Ne PAS renommer le `@State showDeleteMediaConfirm`** (`MessageMoreSheet.swift:43`) : `ConversationMenuSystemDesignGuardTests.test_deleteMedia_requestsConfirmation_neverDeletesDirectly` grep ce nom littéral (cf. § Tests).

### B. Sous-menu à 3 actions
Le `confirmationDialog` déclenché au tap gagne deux boutons AVANT "Supprimer" (qui reste `role: .destructive`, en dernier — convention HIG : les actions non destructives d'abord) :

1. **Enregistrer** — **nouveau paramètre** `var onSaveMedia: (() -> Void)? = nil` sur `MessageMoreSheet` (à côté de `onDeleteMedia`, `MessageMoreSheet.swift:22`), câblé au call site `MessageMoreSheet(...)` de `ConversationView.swift:728-772`. Zéro nouvelle logique métier : le corps recopie la construction de `MediaSaveRequest` déjà présente **à deux endroits identiques** — `ConversationView.swift:1785-1795` (overlay appui-long, `onSaveMedia`) et `:1935-1947` (menu natif, `case .saveMedia`) :
   ```swift
   onSaveMedia: {
       guard let attachment = msg.attachments.first(where: { $0.type != .location }) else { return }
       HapticFeedback.light()
       mediaSaveCoordinator.requestSave(MediaSaveRequest(
           kind: attachment.kind,
           remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
           suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
           attachmentId: attachment.id.isEmpty ? nil : attachment.id
       ))
   },
   ```
   **Le filtre `.type != .location` est obligatoire** : `.media` apparaît dès `ctx.hasMedia` (= `!msg.attachments.isEmpty`), donc AUSSI pour un message de localisation, qui n'est pas enregistrable. Un message dont le seul attachment est une localisation ne doit pas afficher le bouton « Enregistrer » (garde `first(where:) == nil` → bouton absent, pas un bouton inerte).
2. **Transférer** — réutilise le paramètre `onForward` qui EXISTE DÉJÀ sur `MessageMoreSheet` (`:20`) et est déjà câblé (`composerState.forwardMessage = msg`, `ConversationView.swift:749`). Aucun nouveau paramètre. Un message audio/média est déjà transférable tel quel via ce chemin.
3. **Supprimer** — handler `onDeleteMedia` inchangé (`viewModel.deleteAttachment`).

Titre du dialog : "Ce média" (remplace "Supprimer ce média ?" — plus de question fermée sur une seule issue destructive). `confirmationDialog` de SwiftUI n'a qu'un seul `message:` global (pas par bouton) : il est RETIRÉ (pas de sous-titre) — "Cette action est irréversible" ne s'applique qu'à une des 3 options désormais et serait trompeur affiché pour Enregistrer/Transférer. La distinction se fait par le `role: .destructive` du seul bouton Supprimer (rouge, iconographie système standard).

### B bis. Clés de localisation (règle repo : 0 clé neuve quand une SSOT existe)
- **Réutiliser** : "Transférer" → `message-detail.tab.forward` (déjà utilisé en `MessageMoreSheet.swift:448`) ; "Supprimer le média" → `action.delete_media` (`:99`, inchangé sur le bouton destructif) ; "Annuler" → `common.cancel`.
- **DÉCISION — le bouton s'appelle « Enregistrer » et réutilise la clé existante `media.save.title`** (`ConversationView.swift:1946`, déjà la SSOT de cette action dans le menu natif et dans l'overlay). Pas de clé neuve, et surtout un seul mot dans toute l'app pour une seule action — « Télécharger » aurait créé un second vocabulaire pour un comportement identique. Le closure porte le même nom (`onSaveMedia`), en miroir de `MessageOverlayMenu.onSaveMedia`.
- Clés neuves inévitables : le label de l'item (« Média ») et le titre du dialog (« Ce média »).
- `message-more.delete_media.confirm.message` (« Cette action est irréversible. ») devient ORPHELINE dans `apps/ios/Meeshy/Localizable.xcstrings:100510` → la retirer du catalogue dans le même commit. `message-more.delete_media.confirm.title` (`:100557`) est remplacée par la clé du nouveau titre → idem.

## Non-régression (intouchés)
- `deleteAttachment` (ViewModel), `mediaSaveCoordinator.requestSave`, `composerState.forwardMessage` : signatures et comportements inchangés, seulement de nouveaux call sites.
- Tous les AUTRES items de `MessageMoreSheet` (reply, forward, thread, **edit, copy, share**, pin/unpin, star/unstar, delete message, language, transcription, reactions, views, sentiment, history, report) : inchangés.
- Le tap sur `.media` depuis la **bande d'icônes horizontale** (`explorableTabStrip`, `MessageMoreSheet.swift:162-192`) passe par le même `handleMoreItemTap` et doit ouvrir le même dialog — le `confirmationDialog` est attaché au `VStack` racine (`:94`), donc il fonctionne aussi depuis la bande. À ne pas casser.
- `MessageActionResolver.moreSections` : la liste exhaustive des 8 sites de renommage est en § A (grep re-vérifié à l'implémentation, le repo bouge).

## Tests (TDD)
1. `MessageActionResolverTests` **existe déjà** (`apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift`). Y adapter/ajouter : `moreSections` expose `.media` (plus `.deleteMedia`) quand `ctx.canDelete && ctx.hasMedia`.
2. Pas de `MessageMoreSheetTests` comportemental dans le repo — les closures du `confirmationDialog` vivent dans un `body` SwiftUI non instanciable en XCTest sans harnais. Deux options, à trancher à l'implémentation :
   - **(défaut)** garde de source dans `ConversationMenuSystemDesignGuardTests` (précédent exact, même fichier) : les 3 boutons du dialog appellent respectivement `onSaveMedia?()`, `onForward?()`, `onDeleteMedia?()`, et le bouton Supprimer porte `role: .destructive`.
   - extraire la construction du `MediaSaveRequest` en helper pur testable (ex. `static func saveRequest(for message:) -> MediaSaveRequest?`) et tester le filtre `.location` + le repli `thumbnailUrl` dessus — ce qui a l'avantage de dédupliquer les 3 copies (overlay/natif/`.media`).
3. **Deux tests existants cassent au renommage — les corriger dans la même passe RED-GREEN** (vérifié par grep) :
   - `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift:108-113` — `test_moreSections_deleteMediaBeforeMessageDelete_whenBothPresent` référence `.deleteMedia` → **échec de COMPILE** du bundle de tests (« TEST FAILED »/exit 65, pas un test rouge).
   - `apps/ios/MeeshyTests/Unit/Views/ConversationMenuSystemDesignGuardTests.swift:476-491` — `test_deleteMedia_requestsConfirmation_neverDeletesDirectly` est un test de SOURCE (grep littéral). Il contient `XCTAssertFalse(src.contains("case .deleteMedia: onDeleteMedia?()"))` : après le renommage cette assertion devient **trivialement verte** (la chaîne n'existe plus nulle part) — le garde continue de passer tout en ne gardant plus rien. Le mettre à jour sur `.media` sinon on perd silencieusement l'invariant « jamais de suppression directe ».
   - `MessageMoreSheetAccessibilityTests` : non impacté (il s'ancre sur `pellet(` et sur la première occurrence de `selectedItem = nil`, toutes deux hors du périmètre de ce spec) — vérifié, mais son ancre à fenêtre fixe de 900 caractères reste fragile, ne pas insérer de code entre `selectedItem = nil` et son `.accessibilityLabel(`.
4. Aucun autre test n'assertait sur le libellé « Supprimer le média » (grep vérifié : seules occurrences = `MessageMoreSheet.swift` et le catalogue).
