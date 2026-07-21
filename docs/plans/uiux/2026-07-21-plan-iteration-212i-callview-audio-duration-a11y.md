# Plan Iteration-212i — CallView audio-call duration VoiceOver label + value

## Objectif

Rendre la capsule de durée du layout audio de `CallView` lisible par VoiceOver :
remplacer l'annonce « 02:34 » (nombre nu) par « Durée de l'appel, 02:34 », à
parité avec le badge de durée du layout vidéo. Continuité de la doctrine
label+value (206i/210i/211i).

## Base

- Branche de travail : `claude/laughing-thompson-e0cc99` (211i mergée → resync)
- Base : `main` HEAD `8ba64bb` (211i merge #2253)
- Itération : **212i** (strictement > 209i, plus haut en vol dans l'essaim ;
  210i/211i déjà mergées)

## Étapes

1. [x] Resync `main`, reset branche de travail sur `origin/main` (211i mergée).
2. [x] `list_pull_requests` → `CallView` absent de la liste des PR ouvertes
   (#2230 mergée) → 0 collision.
3. [x] Capsule audio : `.accessibilityElement(children: .ignore)` +
   `.accessibilityLabel("call.duration.a11y.label")` +
   `.accessibilityValue(formattedDuration)` ; `.updatesFrequently` conservé ;
   glyphe décoratif ignoré (dégradation voisée par statusPill adjacents).
4. [x] Vérifier réutilisation clé catalogue existante (0 nouvelle, 0 `.xcstrings`).
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit + push `claude/laughing-thompson-e0cc99` + PR.

## Portée

1 fichier iOS, +9 lignes, 0 clé i18n neuve, 0 logique / 0 réseau / 0 layout /
0 visuel / 0 test neuf. Gate = CI `iOS Tests`.

## Non-objectifs

- Pas de touche au badge vidéo (déjà correct), à l'écran de fin d'appel, ni à la
  carte d'appel entrant (hors périmètre, pistes 213i+).
- Pas de rename du helper `videoDurationBadgeAccessibilityLabel` (sa composition
  signal/réseau est spécifique au layout vidéo sans statusPill).
