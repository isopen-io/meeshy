# "Plus…" ouvre directement "Vues"

Date : 2026-08-11
Statut : approuvé (user « Oui », choix confirmé par question de clarification)
Périmètre : `ConversationView.swift`, action `.more` — **les DEUX menus appui-long**, cf. ci-dessous.

⚠️ **Collision de fichier avec le chantier « bouton média »** (`2026-08-11-attachment-media-action-menu-design.md`) : les deux modifient `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`. Zones disjointes (celui-ci : 1807-1810 + 1976-1982 ; l'autre : le bloc `MessageMoreSheet(...)` 728-772), mais **jamais les deux en parallèle dans deux worktrees** sans rebase.

## Comportement actuel (vérifié ligne à ligne le 2026-08-11)

Il y a **DEUX** points d'entrée « Plus… », pas un seul — les deux posent `moreSheetInitialItem = nil` aujourd'hui, les deux doivent changer, sinon la feature n'apparaît que sur la moitié des appareils :

**1. Overlay appui-long custom** (`MessageOverlayMenu`) — `ConversationView.swift:1807-1810`, dans `overlayMenuContent` :
```swift
onShowMore: {
    overlayState.moreSheetInitialItem = nil
    overlayState.detailSheetMessage = msg
},
```
(déclenché par `MessageOverlayMenu.handlePrimaryAction` → `case .more: onShowMore?()`, `MessageOverlayMenu.swift:185-186`.)

**2. Menu contextuel NATIF iOS 26** (`buildNativeMessageMenu` → `nativeMenuButton`) — `ConversationView.swift:1976-1982` :
```swift
case .more:
    Button {
        overlayState.moreSheetInitialItem = nil
        overlayState.detailSheetMessage = msg
    } label: { ... }
```

`moreSheetInitialItem = nil` fait afficher `MessageMoreSheet` sur sa grille complète (`glassGridCard`, `MessageMoreSheet.swift:74-78`) — toutes les sections (actions + infos + modération) visibles d'emblée.

## Comportement cible

Aux DEUX sites : `overlayState.moreSheetInitialItem = nil` → `.views`. "Plus…" ouvre directement le détail "Vues" (accusés de lecture), exactement comme le fait déjà le tap sur le compteur de vues ailleurs dans l'app (`ConversationView.swift:1259` `onShowMessageInfo` et `:1267` `onShowReadStatus` — mécanisme `initialItem` déjà en production, inchangé ; `MessageMoreSheet.onAppear:88-93` consomme `initialItem` si `isExploration`, ce qui est le cas de `.views`).

**Rien d'autre ne change** — vérifié à l'investigation, pas supposé :
- La bande d'icônes horizontale (`explorableTabStrip`, `MessageMoreSheet.swift:162-192`) affiche TOUJOURS `allMoreItems` (`:153-157` = le flatMap des 3 sections : répondre, transférer, discussion, éditer, copier, partager, épingler/désépingler, favori, **média**, supprimer, langue, transcription, réactions, vues, sentiment, historique, **signaler** — TOUT, pas seulement les items explorables). Chaque action reste donc accessible en 1 tap depuis la bande, qu'on soit entré par "Vues" ou par la grille.
  (Note : le commentaire de `MessageActionResolver.swift:9-10` et `:79` affirme que `.language` « n'apparaît jamais dans `moreSections` » — c'est PÉRIMÉ, `:100` l'ajoute bien. Ne pas s'y fier ; ne pas le corriger ici non plus, hors périmètre.)
- Le bouton "x" de fermeture de la sous-vue (`inlineContent(for:)`, `MessageMoreSheet.swift:366-378`) est déjà `.adaptiveGlass(in: Circle())` (`:376`) et remet déjà `selectedItem = nil` (`:368`), ce qui réaffiche `glassGridCard` (la grille complète). Ce point d'entrée/sortie existe et fonctionne déjà tel quel — pas une régression à corriger, un fait à ne pas casser.

**Décision explicite pour le cas `showReadReceipts == false`** (l'utilisateur ne partage pas ses accusés de lecture — `MessageActionResolver.swift:55` + `:103`) : dans ce cas `.views` n'apparaît pas dans `moreSections(_:)`.

Ce que fait le code AUJOURD'HUI avec un `initialItem` absent de `sections` (vérifié, pas supposé) : `MessageMoreSheet.onAppear` (`:88-93`) ne teste QUE `isExploration(initialItem)` — il ne vérifie pas l'appartenance à `sections`. `.views` étant explorable, la feuille afficherait `MessageViewsDetailView` (`:404`) et une bande d'icônes où aucun onglet n'est sélectionné. **Pas de crash, donc — mais une fuite d'UX/confidentialité** : on ouvrirait l'écran « Qui a vu » précisément à l'utilisateur qui a désactivé la réciprocité, sur une feuille que le serveur ne remplira pas. Le repli n'est donc pas une protection anti-crash, c'est une exigence de correction.

Les DEUX call sites doivent construire `initialItem` conditionnellement. **`ctx` n'est PAS en portée à ces endroits** (vérifié) :
- `nativeMenuButton(_ action:msg:)` a la signature `(PrimaryAction, Message)` — le `ctx` est construit dans `buildNativeMessageMenu` (`:1833-1848`) et n'est pas passé.
- `onShowMore` est une closure de `overlayMenuContent` (`:1740+`), qui ne construit aucun `MessageMenuContext` ; celui de l'overlay vit dans `MessageOverlayMenu.menuContext` (privé, autre fichier).

Source de vérité à lire directement aux deux sites : `UserPreferencesManager.shared.privacy.showReadReceipts` — c'est exactement ce que font déjà `ConversationView.swift:736`, `:1847` et `MessageOverlayMenu.swift:163`.

```swift
// site 1 — ConversationView.swift:1807-1810
onShowMore: {
    overlayState.moreSheetInitialItem =
        UserPreferencesManager.shared.privacy.showReadReceipts ? .views : nil
    overlayState.detailSheetMessage = msg
},

// site 2 — ConversationView.swift:1976-1982
case .more:
    Button {
        overlayState.moreSheetInitialItem =
            UserPreferencesManager.shared.privacy.showReadReceipts ? .views : nil
        overlayState.detailSheetMessage = msg
    } label: { ... }
```
Repli explicite sur la grille complète (`nil`) quand Vues n'est pas disponible, jamais un `initialItem` pointant vers un item absent de `sections`.

*(Alternative plus élégante, à trancher : passer `ctx` — ou juste `showReadReceipts: Bool` — en paramètre à `nativeMenuButton`, et remonter le booléen dans `overlayMenuContent`. Évite le troisième call site du singleton, mais élargit deux signatures. Le lot minimal ci-dessus est le défaut.)*

## Tests (TDD)
1. Les deux actions sont des closures inline dans des `body`/`@ViewBuilder` privés de `ConversationView` — pas instanciables en XCTest. Le pattern du repo pour ce cas est le **test de source**, avec précédent exact sur ce même fichier : `CallDetailRoutingTests` (`apps/ios/MeeshyTests/Unit/Views/CallDetailRoutingTests.swift:53`) et `ConversationMenuSystemDesignGuardTests` (`:386`) lisent `Meeshy/Features/Main/Views/ConversationView.swift`. Garde à écrire : `moreSheetInitialItem = nil` n'existe plus SUR AUCUN des deux chemins « Plus… » ; les deux passent par `showReadReceipts ? .views : nil`. **S'ancrer sur le comportement, pas sur un numéro de ligne ni sur une fenêtre de caractères fixe** (leçon repo : les fenêtres fixes pourrissent).
2. Cas de repli — tranché ci-dessus, plus rien à décider à l'implémentation : `showReadReceipts == false` ⇒ `initialItem = nil` ⇒ grille complète. La garde de source doit couvrir explicitement la branche `: nil`, sinon un futur refactor peut la supprimer sans rien casser de rouge.
3. Non-régression : `MessageActionResolverTests` (`apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift:190-215`) couvre déjà `showReadReceipts` true/false sur `moreSections` — ne rien y changer, ce spec ne touche pas le résolveur.
