# Itération 128i — Analyse UI/UX iOS : `FeedPostCard`

**Date** : 2026-07-03
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`
**Base** : `main` HEAD (`14f80c20`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`FeedPostCard` est la carte de publication du feed (leaf view `.equatable()` rendue en `ForEach`) :
en-tête auteur, corps + Prisme Linguistique, aperçu média/repost, et **barre d'actions**
(like / commenter / repartager / enregistrer / partager) + menu « … » (ellipsis). Surface **fraîche** :
9 `.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **2 PR iOS ouvertes** au démarrage
(#1396 gateway/Android push ; #1395 _calls_ gateway + `CallManager`) → **0 contention** (fichier feed
disjoint). Numéro **128i** (127i = `BubbleDeliveryCheck` mergé #1392).

## Constat (avant 128i)

**9 `.font(.system(size:))`** — tous des **glyphes d'action/chrome** appariés à des labels de compteur
scalables (`.footnote.weight(.medium)`) et enveloppés dans des `Button` déjà labellisés :
- ellipsis menu « … » (16),
- like : `heart.fill` + bordure accent `heart` (18 ×2),
- commenter : `bubble.right` (17),
- repartager : `arrow.2.squarepath` + bordure `arrow.2.squarepath.circle` (17 ×2),
- enregistrer : `bookmark` + bordure `bookmark` (17 ×2),
- partager : `square.and.arrow.up` (17).

## Corrections appliquées (1 fichier, 0 logique)

- **9/9 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (mêmes tailles) : les glyphes de la barre
  d'actions **scalent désormais avec leurs compteurs** (`.footnote`) sous Dynamic Type — icône et nombre
  grandissent ensemble au lieu que l'icône reste figée à 17/18 pt pendant que le nombre grossit. L'icône
  « … » (16) scale aussi avec le reste du chrome.
- **Overlays de bordure accent** (heart / repost / bookmark) migrés **à la même taille** que le glyphe
  rempli sous-jacent → ils restent alignés sous Dynamic Type (`relative` applique le même facteur d'échelle
  aux deux couches du `ZStack`).

Aucun gel : ces glyphes ne sont **pas** bornés par un cadre de dimension fixe (les `Button` utilisent des
`HStack(spacing:)` + `.padding`, pas de `.frame(width:height:)` fixe). Ce sont des icônes d'action inline
qui doivent scaler avec le texte adjacent → **`relative`, pas figé**.

Accessibilité déjà conforme → **intacte** : chaque `Button` d'action porte déjà son `.accessibilityLabel`
+ `.accessibilityValue`/`.accessibilityHint` (like/repost/save/share/comment), le menu « … » aussi. Les
overlays de bordure décoratifs sont aplatis par le `Button` labellisé parent (VoiceOver annonce le bouton,
pas les images internes) → pas de `.accessibilityHidden` nécessaire. Palette (`accentColor`,
`MeeshyColors.error/success/warning/indigo400`) déjà conforme → non touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 clé i18n neuve, 0 test neuf. `import MeeshyUI`
  déjà présent. `.equatable()` + inputs `let`/primitifs préservés (Zero-Unnecessary-Re-render intact).
- Les tests qui référencent `FeedPostCard` (`FeedViewModelTests`, `ReelRepostEmbedCellTests`,
  `StoryRepostFlowTests`) sont **comportementaux** — aucun n'inspecte les littéraux de police → aucune
  régression.

## Statut

**TERMINÉE** — `FeedPostCard` Dynamic Type soldé (9/9 glyphes d'action/chrome → `relative`, a11y déjà
en place). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `FeedPostCard` — 9/9 glyphes d'action/chrome → `MeeshyFont.relative` (barre like/commenter/repartager/
  enregistrer/partager + menu « … », overlays de bordure alignés) ; aucun gel (icônes inline non bornées) ;
  a11y déjà en place (labels/values/hints sur tous les boutons). **SOLDÉ 128i.**
