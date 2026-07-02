# Plan — Itération 119i (iOS) : `BubbleStandardLayout+Media`

**Base** : `main` HEAD (`ed63724f`, 0 PR iOS sur cette surface) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (grille média de la bulle) — doctrine 82i/86i
**Gate** : CI `iOS Tests`

## Constat

118i mergé (#1346, `ConversationView+MessageRow`) → **119i**. Restaient **12 `.font(.system(size:))`**
dans la grille média de la bulle (réactions, débordement, badges vue-unique/durée, overlay flou,
carrousel, placeholder).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Emojis réactions (11) + total (9 semibold) | `relative` |
| `+N` de débordement (24 bold) | `relative(24, .bold)` |
| Compteur vue-unique (9, pastille fixe 18×18) | **FIGÉ** + commentaire 86i |
| Glyphe play (18/12, cercle de lecture fixe 48/36) | **FIGÉ** + commentaire 86i |
| Badge de durée (10 semibold monospaced) | `relative(10, .semibold, .monospaced)` |
| Overlay flou : `eye.slash` (16) + libellés (10/9) | `relative` |
| Croix carrousel (10, cadre fixe 26×26) | **FIGÉ** + commentaire 82i + `accessibilityLabel(common.close)` |
| Indicateur de page `n / m` (12 bold monospaced) | `relative(12, .bold, .monospaced)` |
| Placeholder photo (28) | `relative(28)` + `accessibilityHidden` (décoratif) |

## Règles respectées

1. Glyphe dans pastille/cercle de dimension fixe → figé (doctrine 82i/86i).
2. Croix icon-only → label VoiceOver ; glyphe placeholder décoratif → masqué du rotor.
3. Palette + `.ultraThinMaterial` + overlay flou (combine+label existants) + zéro-re-render déjà conformes → non touchés.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (119i car 118i mergé) ; surface `BubbleStandardLayout+Media` non réclamée.
2. [x] 9 migrations `relative` ; 3 gels commentés ; label croix + masquage placeholder.
3. [x] Vérifier : 3 `.system` figés (commentés) + 9 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 120i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent), `ConversationAnimatedBackground` (décor animé
→ hide + gel comme OnboardingAnimations). `FeedPostCard` (9) = chrome d'action-bar → gel documenté.
