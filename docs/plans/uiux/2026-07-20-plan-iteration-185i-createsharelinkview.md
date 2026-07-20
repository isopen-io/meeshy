# Plan — Iteration 185i — CreateShareLinkView pluralisation native

**Branche** : `claude/laughing-thompson-b6yoql`
**Base** : `main` HEAD `230f47c` (resync frais)
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift`

## Objectif

Remplacer la pluralisation française codée en dur (`\(maxUsesValue > 1 ? "s" : "")`, l. 255) par
l'accord grammatical automatique natif de Foundation (`^[…](inflect: true)`), idiome déjà adopté
en 176i (`LoadMoreRepliesCell`). Rend la clé traduisible dans toute morphologie plurielle.

## Étapes

1. [x] Sync branche sur `main` HEAD, choix numéro 185i (> 184i en vol).
2. [x] Audit `CreateShareLinkView` : 1 seul déficit i18n réel (l. 255) ; reste déjà propre.
3. [x] Vérifier précédent `inflect: true` (176i, `LoadMoreRepliesCell.swift:51`).
4. [x] Vérifier clé code-only (absente des 3 `.xcstrings`) → 0 édit catalogue.
5. [x] Éditer l. 255 → `"^[\(maxUsesValue) utilisation](inflect: true) maximum"`.
6. [x] Vérifier 0 `? "s" : ""` restant dans le fichier, 0 test référençant la vue/clé.
7. [ ] Commit + push sur la branche de travail.
8. [ ] Mettre à jour `branch-tracking.md` (pointeur 185i).

## Contraintes

- 1 fichier, 1 ligne, 0 logique, 0 clé neuve, 0 test neuf, 0 changement visuel FR.
- Gate = CI `iOS Tests` (build iOS non runnable en local Linux).

## Différé 186i+

- Label deux-étages du `Stepper` (l. 279-284) : « 1 utilisations » — traitement typographique
  délibéré, à traiter séparément si refonte du bloc.
- Autres candidats non audités : `AudioFullscreenView`, `FeedCommentsSheet`. Vérifier collision
  essaim via `list_pull_requests` avant de choisir.
