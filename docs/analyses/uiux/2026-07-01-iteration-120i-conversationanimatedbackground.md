# Itération 120i — Analyse UI/UX iOS : `ConversationAnimatedBackground`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ConversationAnimatedBackground.swift`
**Base** : `main` HEAD (`385df871`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Le décor animé composable de l'écran de conversation (rendu à 0.12 d'opacité derrière le
contenu, `drawingGroup()`) : animation de base selon le type (direct/groupe/communauté/global),
overlay de chiffrement (cadenas/boucliers/enveloppes orbitants), overlay multilingue (drapeaux
orbitants), particules flottantes, vagues. Contrepartie « conversation » de `OnboardingAnimations`
(soldé 116i). **0 PR ouverte iOS sur cette surface** au démarrage (2 PR ouvertes = gateway
reactions #1357 + iOS calls `CallManager` #1358, fichiers disjoints) → 0 contention. Numéro
**120i** (119i = `BubbleStandardLayout+Media` mergé #1356).

## Constat (avant 120i)

**12 `.font(.system(size:))`**, **toutes des glyphes de décor animé** : cœurs flottants,
`person.fill` des cercles utilisateurs, badge membres `+N`, `person.3.fill` (groupe/communauté),
globe `globe.europe.africa.fill`, cadenas/boucliers (`lock.shield.fill`/`lock.fill`/`shield.checkered`),
enveloppes, `character.bubble`, emojis drapeaux. Aucune ne porte de sens applicatif (le contenu de
la conversation est rendu par-dessus). Le décor n'était pas masqué du rotor → VoiceOver aurait pu
lire les emojis drapeaux (`Text(flags[i])`) et les symboles ambiants.

## Corrections appliquées (1 fichier, 0 logique)

- **Racine du décor → `.accessibilityHidden(true)`** (un seul modifieur, après `.ignoresSafeArea()`) :
  tout le fond animé (12 glyphes) sort du rotor VoiceOver — plus aucun symbole/drapeau ambiant lu.
- **Commentaire doctrine** sur le `body` : les 12 tailles `.system(size:)` restent **figées
  volontairement** (décor en couches à positions absolues ; scaler avec le Dynamic Type déformerait
  l'animation) → ne plus les re-flagger.

Aucune migration `relative` : à la différence des surfaces de contenu, **100 %** des `.system(size:)`
de ce fichier sont du décor décoratif — la bonne action est le gel documenté + le masquage VoiceOver,
pas une bascule Dynamic Type (identique à la décision prise pour `OnboardingAnimations` en 116i).

Palette (`config.accentColor`/`secondaryColor`/`groupColor` déterministes, gradients de marque) et
animations déjà conformes → **intactes**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve. `.drawingGroup()` conservé.

## Statut

**TERMINÉE** — `ConversationAnimatedBackground` a11y soldé : décor animé masqué du rotor + 12
tailles figées documentées. Ne plus re-flagger ces glyphes de décor.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ConversationAnimatedBackground` — décor animé masqué VoiceOver via un `.accessibilityHidden(true)`
  racine + 12 tailles figées documentées (décor en couches, 0 migration justifiée). **SOLDÉ 120i.**
