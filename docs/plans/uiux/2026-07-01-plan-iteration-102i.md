# Plan itération 102i — Finition Dynamic Type + a11y `LoginView`

**Base de départ** : `main` HEAD `1d3278de` (contention parallèle jusqu'à 101i en vol).
**Branche** : `claude/upbeat-euler-pt8xxj` (resync sur `main`).
**Portée** : 1 fichier iOS, finition + 1 label.

## Objectif
Solder l'état mixte de `LoginView` (déjà ~21 `relative`, 7 sites figés restants) et combler la lacune VoiceOver du bouton d'application du host custom.

## Étapes
1. [x] Resync sur `main` ; constater contention (jusqu'à 101i en vol) ; choisir **102i**.
2. [x] Confirmer que `LoginView` n'est dans aucune PR ouverte ni commit récent → retenu. AffiliateView triple-combine = déjà PR #1267 (ne pas dupliquer).
3. [x] Migrer 6/7 `.system(size:)` → `MeeshyFont.relative` (weight + `.monospaced` préservés).
4. [x] Garder figé le chevron du bouton retour (cadre 36×36) + commentaire doctrine 82i.
5. [x] Ajouter `.accessibilityLabel(common.confirm)` sur le bouton checkmark (host custom).
6. [x] Vérifier : 1 `.system(size:)` résiduel attendu.
7. [x] Docs analyse + plan + tracking.
8. [ ] Commit ON THE BRANCH + push ; PR ; CI `iOS Tests` verte.
9. [ ] Merger dans `main`, supprimer la branche, mettre à jour le pointeur tracking.

## Risques
- **Compile** : `MeeshyFont` déjà importé/utilisé abondamment dans le fichier → risque nul.
- **Visuel** : cadence par défaut = tailles identiques → pas de régression. Le sélecteur d'env reste simulateur-only.

## Note contention
Fleet iOS massif (numéros jusqu'à 101i en vol, doublons fréquents). **Toujours** `git log origin/main` + `list_pull_requests` avant de choisir, prendre un numéro strictement supérieur. Surfaces meaty (StoryViewerView+Content 31, ConversationView+Composer 22) restent — mais risquées (i18n / composer critique) et à re-vérifier contre les PR à chaque fois.
