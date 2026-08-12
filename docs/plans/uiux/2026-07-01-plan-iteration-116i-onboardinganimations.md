# Plan — Itération 116i (iOS) : `OnboardingAnimations`

**Base** : `main` HEAD (`512798e1`, 0 PR iOS ouverte) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (décor animé du wizard + CTA) — doctrine décor décoratif
**Gate** : CI `iOS Tests`

## Constat

115i mergé (#1331, `CallView`) → **116i**. `OnboardingAnimations` : **17 `.font(.system(size:))`**
= 15 glyphes de décor animé (décoratifs) + 2 sites du CTA `GlowingButton` (vrai texte).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| `AnimatedStepBackground` (décor animé complet) | `.accessibilityHidden(true)` sur la racine + commentaire doctrine |
| 15 glyphes de décor (SF Symbols + drapeaux, 12–120pt) | **FIGÉS** (décor en couches ; scaler déformerait le positionnement) — documentés en un point |
| `GlowingButton` titre (16 semibold) | `relative(16, .semibold)` |
| `GlowingButton` icône (15 semibold) | `relative(15, .semibold)` |

## Règles respectées

1. Décor animé purement décoratif → masqué du rotor VoiceOver (1 modifieur racine), tailles figées documentées.
2. Vrai texte de CTA → migré en `relative` (Dynamic Type).
3. Palette (`step.accentColor`) + animations déjà conformes → non touchées.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (116i car 115i mergé) ; surface `OnboardingAnimations` non réclamée.
2. [x] `accessibilityHidden` racine + doctrine ; 2 migrations `relative` CTA.
3. [x] Vérifier : 15 `.system` décor figés (documentés) + 2 `relative` + décor masqué.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 117i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent), `StoryViewerView+Canvas` (petits labels +
hero 100pt). `FeedPostCard` (9) = chrome d'action-bar → gel documenté.
