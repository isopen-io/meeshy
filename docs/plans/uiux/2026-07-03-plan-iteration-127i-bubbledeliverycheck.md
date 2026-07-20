# Plan — Itération 127i (iOS) : `BubbleDeliveryCheck`

**Base** : `main` HEAD (`7f187ca8`, 1 PR iOS ouverte #1391 _calls_ → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (glyphe de statut de distribution des pieds de bulle) · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

126i mergé (#1388, `ConversationView+Composer`) → **127i**. Ranking des surfaces fraîches → `BubbleDeliveryCheck`
(8 `.system(size:)`, 0 doctrine, 0 `relative`). Glyphes de statut inline avec l'horodatage de la meta-row.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| hourglass hors-ligne (10 semibold) | `relative` |
| clock sending / clock (10) | `relative` |
| clock.badge.exclamationmark slow (10 semibold) | `relative` |
| checkmark envoyé (10 semibold) | `relative` |
| exclamationmark.circle.fill échec (10 bold) | `relative` |
| `doubleCheck` distribué/lu — 2 checkmarks (taille 10/11) | `relative` (frame width = layout, pas de clip) |

## Règles respectées

1. Indicateurs de statut inline **non bornés** par un cadre de dimension fixe → **scalent** avec le texte
   adjacent (`relative`), pas de gel. Le `.frame(width:)` du `doubleCheck` réserve la largeur mais ne rogne
   pas (`.clipped()` absent) → migration sûre + cohérence des 3 états checkmark.
2. Les 7 `.accessibilityLabel` (statuts distincts pour VoiceOver / daltoniens) déjà en place → intacts.
3. Palette (`tint`, `readTint`, warning/error) conforme → non touchée.
4. 1 fichier, 0 logique, 0 accès `@State`, 0 test/clé i18n neuve. Vue feuille `Equatable` préservée.

## Étapes

1. [x] Resync main (127i car 126i mergé) ; contention vérifiée (#1391 = _calls_, disjoint).
2. [x] 8 migrations `relative`.
3. [x] Vérifier : 0 `.system(size:)` restant + 8 `relative` ; test `label(_:)` inchangé.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 128i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : passe de revue state-of-the-art (palette hexes inline vs tokens — `F8B500`/`9B59B6` dans
FeedView, `9933CC` dans ConversationAnimatedBackground —, cohérence dark/light, gestes standards).
