# Plan — Itération 120i (iOS) : `ConversationAnimatedBackground`

**Base** : `main` HEAD (`385df871`, 0 PR iOS sur cette surface) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : a11y (décor animé de conversation → masquage VoiceOver + gel documenté)
**Gate** : CI `iOS Tests`

## Constat

119i mergé (#1356, `BubbleStandardLayout+Media`) → **120i**. `ConversationAnimatedBackground` :
**12 `.font(.system(size:))`**, toutes des glyphes de **décor animé** (0.12 d'opacité, derrière
le contenu). Contrepartie conversation de `OnboardingAnimations` (116i).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Racine du décor animé (`body`) | `.accessibilityHidden(true)` + commentaire doctrine |
| 12 glyphes de décor (cœurs, person, globe, cadenas/boucliers/enveloppes, drapeaux, 12–90pt) | **FIGÉS** (décor en couches ; scaler déformerait) — documentés en un point |

## Règles respectées

1. Décor animé purement décoratif → masqué du rotor VoiceOver (1 modifieur racine), tailles figées documentées.
2. Aucune migration `relative` : 100 % décoratif → gel + masquage (cf. décision 116i `OnboardingAnimations`).
3. Palette + gradients + animations déjà conformes → non touchés.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (120i car 119i mergé) ; surface `ConversationAnimatedBackground` non réclamée.
2. [x] `accessibilityHidden` racine + doctrine ; 12 glyphes figés documentés.
3. [x] Vérifier : 12 `.system` décor figés (documentés) + décor masqué.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 121i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent). `FeedPostCard` (9) = chrome d'action-bar → gel
documenté. Après ces lots : passe de revue state-of-the-art (audit palette hexes proches, cohérence
.system/.dark/.light, gestes standards) sur les surfaces déjà soldées.
