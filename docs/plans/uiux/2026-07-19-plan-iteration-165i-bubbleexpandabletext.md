# Plan — Iteration 165i — `BubbleExpandableText` Dynamic Type

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`)
**Branche de travail** : `claude/laughing-thompson-l19kam`
**Base** : `main` HEAD (`efedb69e4`)

## Contexte
La longue passe Dynamic Type (migration `.font(.system(size:))` → `MeeshyFont.relative`)
touche à sa fin : le balayage des fichiers a solde tous les gros lots. Les glyphes
décoratifs bornés par des cadres fixes sont **figés** avec une doctrine documentée
(82i/84i/86i), et la quasi-totalité des libellés texte réels ont déjà été migrés.

En ratissant la traîne, un **libellé texte réel non migré** subsiste :
`BubbleExpandableText` — le bouton texte « Voir plus » (`bubble.expand.more`) qui
apparaît sous un message tronqué (> 512 caractères) dans la bulle de message.

## Cible unique
`apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift` — L80.

## Diagnostic
- `Text("Voir plus").font(.system(size: 12, weight: .semibold))` : **vrai libellé
  texte**, pas un glyphe décoratif → il DOIT scaler sous Dynamic Type.
- Le conteneur utilise `.frame(maxWidth: .infinity, minHeight: 24, alignment: .trailing)`
  → `minHeight` est une hauteur **minimale** (pas fixe) : le libellé peut grandir
  sans troncature aux grandes tailles Dynamic Type. La cible tactile 44pt HIG est
  garantie par `DownwardExtendedTapShape(extraBottom: 20)`, indépendante de la
  taille de police → migration **franche**, pas un gel.
- A11y déjà complète : `.accessibilityAddTraits(.isButton)` + `.accessibilityLabel`
  + `.accessibilityIdentifier("bubble.expand.more")` → rien à ajouter.
- `import MeeshyUI` déjà présent (L3) → 0 import neuf.

## Changement
- **1/1** `.font(.system(size: 12, weight: .semibold))` → `MeeshyFont.relative(12, weight: .semibold)`.
- Commentaire de doctrine (165i) expliquant pourquoi c'est une migration franche
  (libellé réel + `minHeight` non figé).

## Non-objectifs
- 0 logique touchée (dépliage à sens unique, gestures, troncature `truncateAtWord` inchangés).
- 0 clé i18n neuve (`bubble.expand.more` existe déjà).
- 0 test neuf (comportement inchangé ; le pur `exceeds`/`truncateAtWord` reste couvert).
- Pas de gel de glyphe (aucun glyphe décoratif dans ce fichier).

## Vérification
- Compile Swift : swap mécanique identique à la doctrine documentée dans
  `Accessibility.swift` (`.font(.system(size: 15, weight: .medium))` →
  `.font(MeeshyFont.relative(15, weight: .medium))`).
- Gate = CI `ios-tests` (build local Xcode indisponible sur cet environnement Linux).

## Après merge
- **`BubbleExpandableText` Dynamic Type SOLDÉ** — ne plus reprendre (1 libellé → `relative`).
- La traîne des libellés texte réels non migrés est **tarie** : les `.system(size:)`
  restants échantillonnés sont tous des glyphes décoratifs figés (doctrine 82i/84i/86i).
  Prochaine itération : démarrer la **passe state-of-the-art** (hex inline vs tokens
  sémantiques) OU un nouvel axe de polish natif au choix.
