# Plan Iteration-213i — StatusComposerView decorative-glyph VoiceOver hide

## Objectif

Masquer à VoiceOver les deux SF Symbols décoratifs de `StatusComposerView`
(glyphe repost de l'en-tête + glyphe de la pilule de visibilité) afin que
VoiceOver n'annonce que le texte utile (« Status de @… », « Public »), pas le nom
du symbole. Doctrine 196i.

## Base

- Branche de travail : `claude/laughing-thompson-e0cc99` (212i superséded → resync)
- Base : `main` HEAD `eea1577`
- Itération : **213i**. PIVOT hors de la zone call-duration/readout numérique
  (206i/210i/211i/212i) — surface swarmée, 212i supersédée par un merge concurrent.

## Étapes

1. [x] Resync `main` (212i supersédée/mergée par un agent concurrent, PR #2261
   fermée « superseded by main »). Leçon collision consignée dans `tasks/lessons.md`.
2. [x] `list_pull_requests` → 1 seule PR ouverte (#2269 CI/release), 0 iOS UI →
   0 collision ; `StatusComposerView` absent.
3. [x] Confirmer les 2 glyphes décoratifs sur `main` (en-tête l.45, pilule l.256),
   0 `.accessibilityHidden`.
4. [x] Ajouter `.accessibilityHidden(true)` sur chaque `Image(systemName:)`.
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit + push `claude/laughing-thompson-e0cc99` + PR.

## Portée

1 fichier iOS, +8 lignes (6 commentaire), 0 clé i18n, 0 logique / 0 réseau /
0 layout / 0 visuel / 0 test neuf. Gate = CI `iOS Tests`.

## Non-objectifs

- Pas de migration `NavigationView` → `NavigationStack` (piste 214i+).
- Pas de touche à la grille d'emojis ni au bouton Publier (non décoratifs).
