# Plan — Itération 112i (iOS) : `OnboardingStepViews`

**Base** : `main` HEAD (`9408c957`, 0 PR iOS ouverte) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (wizard d'inscription) — doctrine 74i/86i
**Gate** : CI `iOS Tests`

## Constat

111i mergé (#1317) → **112i**. Texte déjà majoritairement sémantique ; restaient 7 `.system(size:)`
(3 héros/glyphes en cercles fixes + 4 flags/indicateurs inline).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Drapeau pays picker (24) | `relative(24)` |
| Indicateur match mot de passe (20) | `relative(20)` |
| Drapeau langue carte (26) | `relative(26)` |
| Checkmark sélection langue (20) | `relative(20)` |
| `StepIllustration` hero (44, cercle fixe 100×100) | **FIGÉ** + commentaire 74i/86i (déjà `.accessibilityHidden`) |
| `person.fill` placeholder profil (32, cercle fixe 80×80) | **FIGÉ** + commentaire 86i + `.accessibilityHidden` |
| `exclamationmark.triangle.fill` erreur récap (50) | **FIGÉ** + commentaire 74i/86i + `.accessibilityHidden` |

## Règles respectées

1. Glyphes en cercles de dimension fixe / héros décoratifs ≥40pt → figés (74i/86i).
2. Héros/placeholder décoratifs masqués du rotor VoiceOver.
3. Palette + style Glass déjà conformes → non touchés.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (112i car 111i mergé) ; surface `OnboardingStepViews` non réclamée.
2. [x] 4 migrations `relative` ; 3 gels commentés ; 2 masquages décoratifs.
3. [x] Vérifier : 3 `.system` figés + 4 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 113i+

Différé 108i (`.accessibilityValue` timeAgo/expiry header stories). Gros lots restants :
`StoryViewerView+Content` (⚠️ i18n), `ConversationView+Composer` (lot critique prudent),
`OnboardingAnimations` (animations) ; audit palette hexes proches.
