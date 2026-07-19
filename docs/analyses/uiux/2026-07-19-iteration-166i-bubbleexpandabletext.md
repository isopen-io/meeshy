# Itération 166i — Analyse UI/UX iOS : `BubbleExpandableText`

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift`
**Base** : `main` HEAD (`efedb69e`)
**Branche** : `claude/laughing-thompson-ctcq2i`
**Gate** : CI `iOS Tests`

## Contexte

`BubbleExpandableText` rend le texte d'une bulle de message avec troncature à sens
unique : au-delà de `truncateLimit = 512` caractères, le contenu est coupé au mot et un
libellé cliquable **« Voir plus »** (aligné en bas à droite) déplie le message complet.
C'est un composant à **très forte visibilité** — présent sur chaque bulle longue, côté
envoyeur comme receveur. Surface **fraîche** : 1 seul `.font(.system(size:))`, 0
commentaire doctrine, 0 `MeeshyFont.relative` avant 166i.

## Constat (avant 166i)

**1 `.font(.system(size:))`** — un **vrai libellé texte interactif**, pas un glyphe
borné par un cadre de dimension fixe :
- « Voir plus » `Text(String(localized: "bubble.expand.more"))` (12 semibold).

Le bouton porte `.frame(maxWidth: .infinity, minHeight: 24, alignment: .trailing)` :
`minHeight` est un **plancher** de layout HIG (la rangée grandit avec le texte), **pas**
une dimension fixe. C'est le cas canonique « scaler, pas figer » (doctrine 139i
`MentionSuggestionPanel`, dont la rangée `.frame(minHeight: 44)` avait été traitée à
l'identique).

## Corrections appliquées (1 fichier, 0 logique)

- **1/1 `.font(.system(size: 12, weight: .semibold))` → `MeeshyFont.relative(12, weight: .semibold)`** :
  le libellé « Voir plus » **scale désormais sous Dynamic Type** (weight `.semibold`
  conservé). Commentaire doctrine ajouté expliquant pourquoi il n'est **pas** figé
  (`minHeight: 24` = plancher, pas dimension fixe).

Aucun gel : le seul cadre présent est un `minHeight`, jamais un `.frame(width:height:)`
rigide → `relative`, pas figé.

Accessibilité déjà conforme → **intacte** : le libellé porte
`.accessibilityAddTraits(.isButton)` + `.accessibilityLabel(« Voir plus »)` +
`.accessibilityIdentifier("bubble.expand.more")`. La cible tactile 44pt HIG est déjà
garantie via `DownwardExtendedTapShape(extraBottom: 20)` sur un `minHeight: 24`. Palette
(`textColor.opacity(0.6)`, dérivée de `isMe`) déjà conforme → non touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve.
  `import MeeshyUI` déjà présent (ligne 3). Le geste `TapGesture` `.highPriorityGesture`,
  la troncature `truncateAtWord`/`exceeds`, l'état `@State isExpanded`, l'`Equatable`
  manuel : **non touchés**.
- 3 suites existantes référencent `BubbleExpandableText`
  (`BubbleExpandableTextStateTests`, `BubbleExpandableTextLayoutTests`,
  `BubbleExpandableTextUITests`) — **aucune n'assert la taille de police** → aucune
  régression de test.

## Numérotation

Numéro **166i** = strictement au-dessus du plus haut numéro enregistré dans
`branch-tracking.md` (165i) pour éviter la collision de nom de doc avec l'essaim iOS
(leçon 102i/103i : « toujours numéro > plus haut en vol »).

## Statut

**TERMINÉE** — `BubbleExpandableText` Dynamic Type soldé (1/1 libellé « Voir plus » →
`relative` ; aucun gel car `minHeight` = plancher ; a11y déjà en place : bouton labellisé
+ identifier + tap-shape 44pt). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `BubbleExpandableText` — 1/1 libellé interactif « Voir plus » (`bubble.expand.more`) →
  `MeeshyFont.relative(12, weight: .semibold)` ; aucun gel (cadre `minHeight: 24` =
  plancher, pas dimension fixe) ; a11y déjà en place (`.isButton` +
  `.accessibilityLabel` + `.accessibilityIdentifier` + tap-shape `DownwardExtendedTapShape`
  44pt). **SOLDÉ 166i.**
</content>
