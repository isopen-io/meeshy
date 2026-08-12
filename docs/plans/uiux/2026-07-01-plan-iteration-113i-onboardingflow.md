# Plan — Itération 113i (iOS) : `OnboardingFlowView`

**Base** : `main` HEAD (`51a28527`, 0 PR iOS ouverte) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (chrome du wizard d'inscription) — doctrine 82i
**Gate** : CI `iOS Tests`

## Constat

112i mergé (#1324, `OnboardingStepViews`) → **113i** traite le shell qui entoure les
étapes. Restaient **8 `.font(.system(size:))`** dans le chrome (top bar, en-tête, bottom bar).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Chevron retour (15) | `relative(15, .semibold)` |
| Libellé « Retour » (14) | `relative(14, .medium)` |
| Croix fermeture (15, cadre tap fixe 38×38) | **FIGÉ** + commentaire 82i + `accessibilityLabel(common.close)` |
| Icône d'étape (20) | `relative(20, .medium)` + `accessibilityHidden` (décoratif) |
| Compteur `n/N` (13 rounded) | `relative(13, .semibold, .rounded)` |
| `funHeader` (26 bold rounded) | `relative(26, .bold, .rounded)` + `accessibilityAddTraits(.isHeader)` |
| `funSubtitle` (14) | `relative(14)` |
| « Passer l'étape » (14) | `relative(14, .medium)` |

## Règles respectées

1. Glyphe dans cadre tap de dimension fixe → figé (doctrine 82i).
2. Bouton icon-only → label VoiceOver ; icône décorative → masquée du rotor.
3. En-tête marqué `.isHeader` pour navigation rotor titres.
4. Palette + Glass déjà conformes → non touchés.
5. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (113i car 112i mergé) ; surface `OnboardingFlowView` non réclamée.
2. [x] 7 migrations `relative` ; 1 gel commenté ; label croix + masquage icône + header.
3. [x] Vérifier : 1 `.system` figé + 7 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 114i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n), `ConversationView+Composer`
(lot critique prudent), `OnboardingAnimations`, `StoryViewerView+Canvas`, `FeedPostCard`,
`StoryExportShareSheet`, `CallView` ; audit palette hexes proches.
