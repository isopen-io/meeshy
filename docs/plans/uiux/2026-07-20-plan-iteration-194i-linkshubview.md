# Plan Iteration-194i — LinksHubView : structure VoiceOver

**Branche de travail** : `claude/laughing-thompson-d8mogw`
**Base** : `main` HEAD `dd0bc4b` (193i `BlockedTab` #2170 mergé)
**Piste** : iOS (`i`)

## Objectif

Doter `LinksHubView` (écran hub des liens, 2 modificateurs a11y au total) d'une
structure VoiceOver correcte : re-exposer l'action « Créer… » secondaire de
chaque carte (Button imbriqué dans le Button de navigation → élément interactif
ambigu, défaut 183i), masquer les glyphes décoratifs, et grouper le bandeau promo.

## Étapes

1. [x] Resync branche depuis `origin/main` (inclut 193i #2170).
2. [x] Vérifier contention essaim : `search_pull_requests LinksHubView` → 0 PR ;
   aucun titre de PR ouverte ne cite l'écran. Numéro **194i** > plus haut mergé (193i).
3. [x] Bandeau : `.accessibilityElement(children: .combine)` (titre + sous-titre = 1 élément).
4. [x] Carte : icône accent + chevron → `.accessibilityHidden(true)` (décoratifs).
5. [x] Button « créer » imbriqué → `.accessibilityHidden(true)` (label mort retiré).
6. [x] Carte : `LinkCardCreateAction` (ViewModifier fileprivate) ré-exposant la
   création via `.accessibilityAction(named:)` seulement si `onCreate != nil` ;
   réutilise `createLabel` (`links.hub.*.create.a11y`) via `Text(verbatim:)`.
7. [x] Analyse + plan + tracking.
8. [ ] Commit + push + PR ; gate CI `iOS Tests`.

## Contraintes

- 0 changement visuel, 0 logique, 0 clé i18n neuve, 0 SDK, 0 test neuf, 1 fichier.
- APIs iOS 14/16 sous plancher app → pas de garde de disponibilité.
- Auteur en conteneur Linux → build/VoiceOver validés en CI.
