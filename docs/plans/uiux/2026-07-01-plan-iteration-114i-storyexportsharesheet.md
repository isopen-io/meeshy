# Plan — Itération 114i (iOS) : `StoryExportShareSheet`

**Base** : `main` HEAD (`529ccb81`, 0 PR iOS ouverte) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (sheet d'export MP4 auteur-only) — doctrine 84i
**Gate** : CI `iOS Tests`

## Constat

113i mergé (#1327, `OnboardingFlowView`) → **114i**. Restaient **6 `.font(.system(size:))`**
dans la sheet d'export story (header, picker langue, progression, CTA).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Hero `square.and.arrow.up.fill` (36) | **FIGÉ** + commentaire 84i + `accessibilityHidden` (décoratif) |
| Sous-titre (14) | `relative(14)` |
| Label « Langue à graver » (13 semibold) | `relative(13, .semibold)` |
| Chevron menu (12 semibold) | `relative(12, .semibold)` + `accessibilityHidden` (décoratif) |
| Texte de progression (13 medium) | `relative(13, .medium)` |
| CTA « Exporter en vidéo » (16 semibold) | `relative(16, .semibold)` |

## Règles respectées

1. Hero décoratif ~36pt → figé (doctrine 84i) + masqué du rotor (sous-titre porte le sens).
2. Chevron d'affordance → masqué (le libellé + `Menu` portent le contrôle).
3. Palette (brand gradient, indigo sémantiques) + style Glass déjà conformes → non touchés.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (114i car 113i mergé) ; surface `StoryExportShareSheet` non réclamée.
2. [x] 5 migrations `relative` ; 1 gel commenté ; 2 masquages décoratifs.
3. [x] Vérifier : 1 `.system` figé + 5 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 115i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n), `ConversationView+Composer`
(lot critique prudent), `OnboardingAnimations`, `StoryViewerView+Canvas`, `CallView`.
Note : `FeedPostCard` (9 sites) est essentiellement de la chrome d'action-bar (glyphes de
contrôle dans une rangée horizontale contrainte + overlays ZStack à géométrie fixe) →
candidat « gel documenté » plutôt que migration ; à traiter séparément.
