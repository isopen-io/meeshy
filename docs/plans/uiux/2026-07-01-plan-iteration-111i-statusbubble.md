# Plan — Itération 111i (iOS) : `StatusBubbleOverlay`

**Base** : `main` HEAD (`57408634`, 0 PR ouverte) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (bulle d'humeur flottante) — doctrine 86i
**Gate** : CI `iOS Tests`

## Constat

110i mergé (#1316) → **111i**. 0 PR ouverte → 0 contention. Bouton audio déjà étiqueté ;
restaient 7 `.system(size:)` (6 textes/glyphe inline + 1 glyphe en cercle fixe).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Contenu texte (13) | `relative(13)` |
| timeAgo audio + texte (10 medium ×2) | `relative(10,.medium)` |
| « via @… » (11) | `relative(11)` |
| Glyphe repost `arrow.2.squarepath` (11) | `relative(11)` |
| Libellé Republier (12 medium) | `relative(12,.medium)` |
| Glyphe play/stop (8, cercle fixe 18×18) | **FIGÉ** + commentaire 86i |

## Règles respectées

1. Glyphe en cercle de dimension fixe → figé (doctrine 86i) ; bouton déjà étiqueté.
2. Palette + Liquid Glass (`.adaptiveGlass`) déjà conformes → non touchés.
3. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (111i car 110i mergé) ; surface `StatusBubbleOverlay` non réclamée.
2. [x] 6 migrations `relative` ; 1 gel commenté.
3. [x] Vérifier : 1 `.system` figé + 6 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 112i+

`OnboardingStepViews` (7) ; différé 108i (`.accessibilityValue` timeAgo/expiry header stories).
Gros lots : `StoryViewerView+Content` (⚠️ i18n), `ConversationView+Composer`.
