# Itération 156i — Analyse UI/UX iOS : `BubbleExpandableText`

**Date** : 2026-07-17
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift`
**Base** : `main` HEAD (`99c40d4`)
**Branche** : `claude/laughing-thompson-xzwk39`
**Gate** : CI `iOS Tests`

## Contexte

`BubbleExpandableText` est la sous-vue Equatable de la bulle de message qui tronque les messages longs
(> 512 caractères) et expose un libellé « Voir plus » à dépliage **à sens unique** (le message complet
s'affiche puis le bouton disparaît). C'est une **leaf view** rendue dans la liste de messages (pattern
« Zero Unnecessary Re-render ») : inputs primitifs, `static func ==` manuel excluant `@State` et le
callback.

Surface **fraîche** : 1 `.font(.system(size:))`, 0 `MeeshyFont.relative`, aucune analyse UI/UX dédiée.
Aucune PR ouverte ne touche `Bubble/BubbleExpandableText.swift` (l'essaim iOS 140i→155i cible d'autres
fichiers : `MyStoriesView`, `ConversationDashboard`, `EditProfileView`, `MessageReactionsDetailView`…) →
**0 contention**. Numéro **156i** (frontière ouverte = 155i, #1998).

## Constat (avant 156i)

Le libellé « Voir plus » est un **faux bouton** : un `Text` porteur d'un `.highPriorityGesture(TapGesture)`
custom (choisi à dessein pour battre le `LongPressGesture` du parent `BubbleSwipeContainer` et la sélection
de texte), **pas** un `Button` SwiftUI. Trois lacunes :

1. **Dynamic Type** — `.font(.system(size: 12, weight: .semibold))` : taille figée, le libellé ne scale pas
   sous Dynamic Type. C'est un **vrai libellé texte** (pas un glyphe de cadre fixe : la rangée est en
   `.frame(minHeight: 24)` = hauteur *minimale*, elle grandit avec le texte).
2. **Activation VoiceOver non fiable** — l'élément portait `.accessibilityAddTraits(.isButton)` +
   `.accessibilityLabel`, mais **aucune action d'accessibilité**. La double-tape VoiceOver déclenche l'action
   d'activation *par défaut* de l'élément, qui n'atteint **pas** un `.highPriorityGesture(TapGesture())` custom
   → un utilisateur VoiceOver entend « Voir plus, bouton » mais la double-tape peut ne rien déplier.
3. **Indice VoiceOver absent** — le résultat de l'action (« affiche le message complet ») n'est pas évident
   depuis le seul libellé ; HIG recommande un `.accessibilityHint` quand le résultat n'est pas explicite.

## Corrections appliquées (2 fichiers, 0 logique)

- **1/1 `.font(.system(size:))` → `MeeshyFont.relative(12, weight: .semibold)`** : le libellé « Voir plus »
  scale désormais sous Dynamic Type (weight préservé).
- **Action d'activation VoiceOver câblée explicitement** : `.accessibilityAction { expand() }` (action par
  défaut, sans nom) — la double-tape VoiceOver déplie désormais de façon fiable, indépendamment du
  `.highPriorityGesture`. La logique de dépliage est extraite dans un unique `private func expand()` partagé
  par le tap et l'action a11y (zéro duplication).
- **Indice VoiceOver ajouté** : `.accessibilityHint("Affiche le message complet")` → 1 clé i18n neuve
  `bubble.expand.more.hint` (de/en/es/fr/pt-BR, parité exacte avec `bubble.expand.more`).
- **Reduce Motion respecté** : `expand()` lit `@Environment(\.accessibilityReduceMotion)` et saute
  l'animation `.easeInOut(0.25)` quand l'utilisateur a désactivé les animations (le dépliage reste instantané,
  pas de mouvement). `@Environment` est l'alternative recommandée (pas d'`@ObservedObject` singleton sur une
  leaf view).

Aucun gel : le seul `.system` était un vrai libellé. Palette déjà tokenisée (`textColor` dérivé de
`ThemeManager` / `Color.white`, opacité 0.6) → **0 swap**. `import MeeshyUI` déjà présent.

## Périmètre / non-régression

- **2 fichiers** : `BubbleExpandableText.swift` (+ `@Environment`, `expand()`, 3 modificateurs a11y, 1 font)
  et `Localizable.xcstrings` (+1 clé, insertion chirurgicale groupée sous `bubble.expand.*`, format Xcode
  préservé — 0 reformatage).
- **0 logique produit modifiée** : le dépliage reste à sens unique, la troncature (`exceeds`,
  `truncateAtWord`, `State.needsTruncation`), le `static func ==`, l'`accessibilityIdentifier`
  (`bubble.expand.more`) et le comportement du tap sont **inchangés**.
- **Tests existants intacts** : `BubbleExpandableTextStateTests` (logique pure), `…LayoutTests`,
  `…UITests` (query par `accessibilityIdentifier` + tap — identifiant et geste préservés). 0 test neuf.

## Statut

**TERMINÉE** — `BubbleExpandableText` Dynamic Type + VoiceOver soldés (1/1 libellé → `relative` ;
activation VoiceOver fiabilisée via `.accessibilityAction` ; hint ajouté ; Reduce Motion respecté).
Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `BubbleExpandableText` — 1/1 libellé « Voir plus » → `MeeshyFont.relative(12, .semibold)` ; faux bouton
  (`.highPriorityGesture` custom) → `.accessibilityAction { expand() }` pour fiabiliser la double-tape
  VoiceOver + `.accessibilityHint` (`bubble.expand.more.hint`, 5 langues) ; Reduce Motion respecté dans
  `expand()` via `@Environment(\.accessibilityReduceMotion)` ; a11y label/trait/identifier déjà en place et
  préservés. **SOLDÉ 156i.**
