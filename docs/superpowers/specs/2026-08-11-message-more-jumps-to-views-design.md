# "Plus…" ouvre directement "Vues"

Date : 2026-08-11
Statut : approuvé (user « Oui », choix confirmé par question de clarification)
Périmètre : `ConversationView.swift`, action primaire `.more` du menu appui-long.

## Comportement actuel

`ConversationView.swift:1976-1982` — l'action `PrimaryAction.more` :
```swift
case .more:
    Button {
        overlayState.moreSheetInitialItem = nil
        overlayState.detailSheetMessage = msg
    } label: { ... }
```
`moreSheetInitialItem = nil` fait afficher `MessageMoreSheet` sur sa grille complète (`glassGridCard`) — toutes les sections (actions + infos + modération) visibles d'emblée.

## Comportement cible

`overlayState.moreSheetInitialItem = nil` → `overlayState.moreSheetInitialItem = .views`. "Plus…" ouvre directement le détail "Vues" (accusés de lecture), exactement comme le fait déjà le tap sur le compteur de vues ailleurs dans l'app (`ConversationView.swift:1259/1267`, mécanisme `initialItem` déjà en production, inchangé).

**Rien d'autre ne change** — vérifié à l'investigation, pas supposé :
- La bande d'icônes horizontale (`explorableTabStrip`, `MessageMoreSheet.swift:162-192`) affiche TOUJOURS `allMoreItems` (répondre, transférer, discussion, copier, partager, épingler, supprimer, langue, transcription, réactions, vues, sentiment, historique — TOUT, pas seulement les items explorables). Chaque action reste donc accessible en 1 tap depuis la bande, qu'on soit entré par "Vues" ou par la grille.
- Le bouton "x" de fermeture de la sous-vue (`inlineContent(for:)`, `MessageMoreSheet.swift:366-378`) est déjà `.adaptiveGlass(in: Circle())` et remet déjà `selectedItem = nil`, ce qui réaffiche `glassGridCard` (la grille complète). Ce point d'entrée/sortie existe et fonctionne déjà tel quel — pas une régression à corriger, un fait à ne pas casser.

**Décision explicite pour le cas `ctx.showReadReceipts == false`** (l'utilisateur ne partage pas ses accusés de lecture — `MessageActionResolver.swift:47-55`) : dans ce cas `.views` n'apparaît pas dans `moreSections(_:)` du tout. Le call site de `.more` (`ConversationView.swift:1976-1982`) DOIT construire `initialItem` conditionnellement plutôt que fixer `.views` en dur :
```swift
case .more:
    Button {
        overlayState.moreSheetInitialItem = ctx.showReadReceipts ? .views : nil
        overlayState.detailSheetMessage = msg
    } label: { ... }
```
(`ctx` est déjà construit au point d'appel — cf. `MessageMenuContext` passé à `MessageActionResolver.moreSections`.) Repli explicite sur la grille complète (`nil`) quand Vues n'est pas disponible, jamais un `initialItem` pointant vers un item absent de `sections`.

## Tests (TDD)
1. Test que l'action `.more` fixe `moreSheetInitialItem` à `.views` (pattern déjà utilisé pour vérifier `.language`/`.reactions` ailleurs si un tel test existe — sinon test source-guard minimal sur la ligne).
2. Cas de repli : `ctx.showReadReceipts == false` → `.more` ne doit pas ouvrir une sous-vue vide/cassée (soit `.views` reste absent sans crash, soit repli explicite sur `nil` — à trancher à l'implémentation selon ce que révèle l'inspection de `MessageMoreSheet` avec un `initialItem` non présent dans `sections`).
