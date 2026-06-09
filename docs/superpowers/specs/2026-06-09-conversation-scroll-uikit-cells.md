# Conversation scroll — migration vers cellules UIKit natives

**Date** : 2026-06-09
**Statut** : plan (à valider par profiling avant exécution)
**Objectif** : rendre le scroll de la vue Conversation aussi fluide que le Feed / les Notifications.

## Problème

La liste de messages (`MessageListViewController`) est un `UICollectionView` +
`UICollectionViewCompositionalLayout` où **chaque cellule héberge la bulle
SwiftUI riche** (`ThemedMessageBubble` → `BubbleStandardLayout`) via
`UIHostingConfiguration`, avec une hauteur de groupe `.estimated(80)` =
**auto-dimensionnement**.

Coût au scroll, par NOUVELLE cellule affichée :
1. `cellConfig` construit `BubbleContent` + instancie un graphe SwiftUI profond.
2. `UIHostingConfiguration` rend ce graphe via le pont UIKit↔SwiftUI.
3. L'auto-dimensionnement déclenche une passe de layout SwiftUI (`sizeThatFits`)
   pour mesurer la hauteur réelle.

Le Feed n'a pas ce coût : il est en SwiftUI pur (`LazyVStack` + `FeedPostCard`),
sans pont UIKit ni mesure self-sizing par cellule.

## Ce qui N'EST PAS la solution (vérifié iter-47/48)

- **`.equatable()` sur la bulle** : redondant ici. Le `UICollectionViewDiffable
  DataSource` ne reconfigure déjà QUE les items changés (`reconfigureItems(
  itemsToReconfigure)`), contrairement au `ForEach` du Feed qui re-rend tout.
  `.equatable()` n'aiderait que les reconfigs en masse (thème/accent), pas le
  scroll-recyclage (cellule A→B = messages différents = re-render obligatoire).
  De plus `ThemedMessageBubble` a 11 `@State` + 2 `@StateObject` → footgun iOS
  18+ (cf. `feedback_swiftui_equatable_state_footgun`) : `.equatable()`
  casserait le flag tap / les sheets. **Ne pas faire.**
- **Retirer des effets** : interdit (cf. `feedback_do_not_strip_visual_effects`).

## Actif existant (migration WIP abandonnée)

L'équipe a DÉJÀ commencé la bonne approche, puis s'est arrêtée :
- `apps/ios/Meeshy/Features/Main/Views/Cells/TextBubbleCell.swift`
- `apps/ios/Meeshy/Features/Main/Views/Cells/MediaBubbleCell.swift`

Ce sont des cellules **100% UIKit natives** (`UILabel`, `UIView`, pas de
SwiftUI) qui **sautent l'auto-dimensionnement** via
`preferredLayoutAttributesFitting` + `record.cachedBubbleHeight`. Colonne GRDB
`cachedBubbleHeight` (migrations) + write path
(`MessagePersistenceActor` UPDATE) déjà en place.

**Limites actuelles** : jamais câblées (0 référence), et incomplètes — pas de
réactions, traductions/drapeaux Prisme, swipe-to-reply, view-once, audio,
overlay long-press.

## Phase 0 — PROFILER (obligatoire avant d'investir)

Les signposts existent : `PerfSignpost.signposter` émet `cellConfig` et
`applySnapshot` (catégorie `pointsOfInterest`, subsystem `me.meeshy.app`).

1. Instruments → template « SwiftUI » ou « Time Profiler » + piste « Points of
   Interest » → scroller une conversation longue (100+ messages, médias variés).
2. Lire la durée moyenne de `cellConfig` et `applySnapshot`, et le hitch map.
3. **Décision** :
   - Si `cellConfig` domine (build + render bulle) → migration UIKit (Phase 1+).
   - Si la mesure self-sizing domine mais le render est OK → d'abord la variante
     légère (cellule hôte + `cachedBubbleHeight`, voir Annexe B).
   - Si `applySnapshot` domine → optimiser la prépa snapshot (off-main map/group).

## Phase 1 — TextBubbleCell complet (le gros du trafic)

La majorité des messages sont du texte. Compléter `TextBubbleCell` couvre le cas
dominant et donne le gain le plus visible.

Ajouter à `TextBubbleCell` (UIKit natif) :
1. **Footer** : timestamp + indicateurs de livraison (✓/✓✓) + bouton edit.
2. **Drapeaux Prisme** : strip de langues + tap → switch langue affichée /
   panneau traduction secondaire (réimplémenter `BubbleFooter` flags en UIKit).
3. **Réactions** : barre de réactions sous la bulle + tap/long-press.
4. **Reply quoté** : carte de citation au-dessus du texte.
5. **Swipe-to-reply / forward** : `UIPanGestureRecognizer` (remplace
   `BubbleSwipeContainer` SwiftUI).
6. **Long-press** : `UILongPressGestureRecognizer` → `onLongPress` (overlay).
7. **Mentions** : highlight des @mentions + tap.
8. **Calcul de hauteur** : après le 1er layout AutoLayout, écrire
   `cachedBubbleHeight` dans le record (le write path existe).

Tests : snapshot tests UIKit par état (entrant/sortant, avec/sans réactions,
traduit, edited, reply). Parité visuelle avec la bulle SwiftUI actuelle.

## Phase 2 — MediaBubbleCell

Idem pour image/vidéo/audio : thumbnail (réutiliser `CacheCoordinator`),
carousel multi-pièces, contrôles audio, overlay durée vidéo, view-once.

## Phase 3 — Câblage + sélection de cellule

Dans `MessageListViewController`, remplacer la `CellRegistration` unique
(UIHostingConfiguration) par une sélection par **kind** :
- texte / emoji-only → `TextBubbleCell`
- image / vidéo / audio → `MediaBubbleCell`
- **fallback SwiftUI** (`UIHostingConfiguration` actuel) pour les kinds rares /
  complexes : story-reply riche, résumé d'appel, audio carousel multi-langue,
  burned/view-once spéciaux. On garde le chemin SwiftUI pour ce qui n'est pas
  encore porté — migration incrémentale, pas big-bang.

## Phase 4 — `cachedBubbleHeight` actif

Une fois les cellules natives en place, `preferredLayoutAttributesFitting`
retourne `cachedBubbleHeight` → **plus de passe de mesure** au scroll rapide.
Invalider l'entrée cache sur edit / ajout de réaction (la hauteur change).

## Phase 5 — Validation

- Re-profiler : `cellConfig` doit chuter drastiquement (UIKit pur).
- Parité features (device-test checklist : flags, réactions, swipe, long-press,
  fullscreen, sheets, view-once, audio).
- Pas de régression sur le scroll inversé / scroll-to-bottom / pagination.

## Risques

- **Parité de rendu** : la bulle SwiftUI est riche (gradients, accent, glass).
  Reproduire fidèlement en UIKit (CALayer/gradient) demande du soin. Mitigation :
  snapshot tests + revue visuelle device.
- **Surface énorme** : c'est un chantier dédié (estimation ~5-8 j), PAS une
  itération de /loop. À faire sur branche dédiée, device-testée, mergée d'un bloc
  par phase.
- **Maintenance double** : tant que le fallback SwiftUI existe, deux chemins de
  rendu à garder synchro. Acceptable en transition.

## Annexe B — Variante légère (si Phase 0 montre que la MESURE domine)

Sans réécrire la bulle : sous-classe `HostedBubbleCell: UICollectionViewCell`
qui garde `UIHostingConfiguration` (bulle SwiftUI intacte, zéro perte de
features/effets) MAIS override `preferredLayoutAttributesFitting` pour retourner
une hauteur cachée (cache VC-level `[messageId: CGFloat]`, peuplé après la 1ère
mesure, invalidé sur reconfigure). Saute la passe de mesure au re-scroll. Gain
PARTIEL (n'aide pas le 1er affichage, ne réduit pas le coût de render). À ne
faire que si le profil confirme que la mesure — pas le render — est le hitch.
