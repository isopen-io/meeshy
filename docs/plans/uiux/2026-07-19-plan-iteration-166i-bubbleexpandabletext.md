# Plan Itération 166i — `BubbleExpandableText` Dynamic Type

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift`
**Base** : `main` HEAD (`efedb69e`)
**Branche** : `claude/laughing-thompson-ctcq2i`
**Gate** : CI `iOS Tests`

## Objectif

Faire scaler le libellé interactif **« Voir plus »** (dépliage des bulles de message
tronquées > 512 caractères) sous **Dynamic Type**. Il était figé à `12pt` via
`.font(.system(size: 12, weight: .semibold))` — un vrai texte cliquable qui doit
respecter la taille de police choisie par l'utilisateur (HIG / accessibilité).

## Pourquoi cette surface

- Composant à **très forte visibilité** : rendu sur chaque bulle de message longue,
  côté envoyeur ET receveur.
- **Vrai libellé texte** (pas un glyphe borné par un cadre de dimension fixe) : le
  bouton porte `.frame(maxWidth: .infinity, minHeight: 24, alignment: .trailing)` —
  `minHeight` est un **plancher** HIG, pas une dimension fixe → cas exact « scaler,
  pas figer » (doctrine 139i `MentionSuggestionPanel`).
- Surface **fraîche** : 1 seul `.font(.system(size:))`, 0 commentaire doctrine,
  0 `MeeshyFont.relative` avant 166i.

## Étapes

1. `git checkout -B claude/laughing-thompson-ctcq2i origin/main` (resync sur `main`).
2. `.font(.system(size: 12, weight: .semibold))` → `.font(MeeshyFont.relative(12, weight: .semibold))`
   + commentaire doctrine (pourquoi non figé : `minHeight` = plancher).
3. Vérifier : `import MeeshyUI` déjà présent (ligne 3) ; aucun test n'assert la police.
4. Docs analyse + plan + tracking.
5. Commit + push `claude/laughing-thompson-ctcq2i`.

## Non-régression

- **1 seul fichier**, **0 logique** (le geste `TapGesture`, la troncature
  `truncateAtWord`, l'état `@State isExpanded`, l'`Equatable` manuel : intacts).
- **0 clé i18n neuve** (`bubble.expand.more` déjà en place).
- **0 test neuf** — les 3 suites existantes
  (`BubbleExpandableTextStateTests`, `BubbleExpandableTextLayoutTests`,
  `BubbleExpandableTextUITests`) n'assertent aucune taille de police → aucune casse.
- a11y déjà conforme : `.accessibilityAddTraits(.isButton)` +
  `.accessibilityLabel` + `.accessibilityIdentifier("bubble.expand.more")` →
  **inchangée**.
- Palette (`textColor.opacity(0.6)` dérivé de `isMe`) → **non touchée**.

## Numérotation

Numéro **166i** = strictement au-dessus du plus haut numéro enregistré dans
`branch-tracking.md` (165i) pour éviter toute collision de nom de doc avec
l'essaim d'agents iOS (leçon 102i/103i).
</content>
</invoke>
