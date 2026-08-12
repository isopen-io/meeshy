# Plan — Itération 128i (iOS) : `FeedPostCard`

**Base** : `main` HEAD (`14f80c20`, 2 PR iOS ouvertes #1396 push-Android / #1395 _calls_ → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (barre d'actions + menu de la carte de feed) · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

127i mergé (#1392, `BubbleDeliveryCheck`) → **128i**. Ranking des surfaces fraîches → `FeedPostCard`
(9 `.system(size:)`, 0 doctrine, 0 `relative`). Glyphes de la barre d'actions + ellipsis, appariés à des
compteurs scalables.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| ellipsis menu « … » (16) | `relative` |
| like : `heart.fill` + bordure `heart` (18 ×2) | `relative` |
| commenter : `bubble.right` (17) | `relative` |
| repartager : `arrow.2.squarepath` + bordure (17 ×2) | `relative` |
| enregistrer : `bookmark` + bordure (17 ×2) | `relative` |
| partager : `square.and.arrow.up` (17) | `relative` |

## Règles respectées

1. Icônes d'action inline **non bornées** par un cadre fixe (HStack + padding, pas de `.frame(width:height:)`)
   → **scalent** avec leurs compteurs (`.footnote`), pas de gel. Overlays de bordure migrés à la même taille
   → restent alignés sous Dynamic Type.
2. Chaque `Button` porte déjà `.accessibilityLabel`/`Value`/`Hint` ; overlays décoratifs aplatis par le
   Button labellisé parent → pas de `.accessibilityHidden` requis. Intacts.
3. Palette (`accentColor`, error/success/warning/indigo400) conforme → non touchée.
4. 1 fichier, 0 logique, 0 accès `@State`, 0 test/clé i18n neuve. `.equatable()` + inputs `let` préservés.

## Étapes

1. [x] Resync main (128i car 127i mergé) ; contention vérifiée (#1396 push-Android, #1395 _calls_ — disjoints).
2. [x] 9 migrations `relative` (dont 1 site à indentation différente : `bubble.right`).
3. [x] Vérifier : 0 `.system(size:)` restant + 9 `relative` ; tests FeedPostCard comportementaux inchangés.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 129i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : `CameraView` (5), `ReelFeedCard` (4), `MessageDetailSheet` (4), `StatusBubbleController` (4),
ou la passe state-of-the-art (hexes inline vs tokens).
