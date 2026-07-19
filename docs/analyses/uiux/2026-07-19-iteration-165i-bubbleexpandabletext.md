# Itération 165i — Analyse UI/UX iOS : `BubbleExpandableText`

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift`
**Base** : `main` HEAD (`efedb69`)
**Branche** : `claude/laughing-thompson-6vvox5`
**Gate** : CI `iOS Tests`

## Contexte

`BubbleExpandableText` est le composant de texte de bulle avec troncature « Voir plus » (dépliage à sens
unique) extrait du god object `ThemedMessageBubble`. C'est une surface **cœur produit** (chaque bulle de
message longue le rend). Surface **fraîche** : 1 `.font(.system(size:))`, 0 commentaire doctrine, 0
`relative`. Le lot des fichiers à ≥3 `.system` est épuisé (cf. 139i) ; on continue la traîne à 1 sur une
surface à réel enjeu Dynamic Type. `import MeeshyUI` **déjà présent**. Essaim iOS dense (140i→164i
terminées, cf. `branch-tracking.md`) ; numéro **165i** choisi strictement > plus haut en vol (164i =
`InviteFriendsSheet`). Cible **non réclamée** (0 mention dans le tracking).

## Constat (avant 165i)

**1 `.font(.system(size:))`** — **un vrai libellé texte**, sans cadre de dimension fixe :
- bouton `Text("Voir plus")` (12 semibold) — la cellule utilise `.frame(maxWidth: .infinity, minHeight:
  24, alignment: .trailing)`, une hauteur **minimale** (pas une dimension fixe) : le libellé peut grandir
  avec Dynamic Type sans déborder d'un cadre rigide. La cible tactile 44pt HIG est portée par un
  `contentShape(DownwardExtendedTapShape(extraBottom: 20))`, indépendant de la taille de police.

## Corrections appliquées (1 fichier, 0 logique)

- **1/1 `.font(.system(size:))` → `MeeshyFont.relative(12, weight: .semibold)`** : le bouton « Voir plus »
  **scale désormais sous Dynamic Type** (weight `.semibold` préservé). Swap mécanique exact documenté par
  l'API (`Accessibility.swift` : `.font(.system(size: 12, weight: .semibold))` →
  `.font(MeeshyFont.relative(12, weight: .semibold))`).

Aucun gel : le libellé est dans une cellule à `minHeight: 24` (hauteur *minimale*, la rangée grandit avec
le texte) — **pas** un cadre de dimension fixe → **`relative`, pas figé** (parité 139i).

Accessibilité déjà conforme → **intacte** : le bouton porte `.accessibilityAddTraits(.isButton)` +
`.accessibilityLabel("Voir plus")` + `.accessibilityIdentifier("bubble.expand.more")`. Le corps de
message est rendu par `MessageTextRenderer.render(..., fontSize: 15)` (renderer séparé, hors périmètre de
ce sweep). Palette (`ThemeManager.shared.textPrimary`, `textColor.opacity(0.6)`) déjà conforme → non
touchée. i18n déjà couvert (`String(localized: "bubble.expand.more")`) → 0 clé neuve.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. `import MeeshyUI` déjà
  présent. La logique de troncature (`exceeds`, `truncateAtWord`, `needsTruncation`, l'état local
  `isExpanded`, l'`Equatable` manuel) n'est **pas** touchée.
- Tests référençant `BubbleExpandableText` (`BubbleExpandableTextStateTests`,
  `BubbleExpandableTextLayoutTests`, `BubbleExpandableTextUITests`) : aucun n'assert sur la police (le
  layout test n'assert que `truncateLimit == 512`) → aucune régression de test.

## Statut

**TERMINÉE** — `BubbleExpandableText` Dynamic Type soldé (1/1 libellé « Voir plus » → `relative`, aucun
gel, a11y déjà en place). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `BubbleExpandableText` — 1/1 libellé « Voir plus » (bouton de dépliage) → `MeeshyFont.relative(12,
  weight: .semibold)` ; aucun gel (cellule `minHeight: 24`, pas de dimension fixe ; cible tactile 44pt via
  `contentShape`) ; a11y déjà en place (trait `.isButton` + label + identifier). **SOLDÉ 165i.**
