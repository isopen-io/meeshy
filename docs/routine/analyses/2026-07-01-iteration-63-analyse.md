# Iteration 63 — Analyse d'optimisation (2026-07-01)

## Contexte — régression détectée (revert par merge parallèle)
Suite iter 62 (« Source unique de la troncature `truncate` », mergée : PR #1203 / `874dc10`).
Au démarrage du scout iter 63, constat : **la source unique du compteur compact (iter 61,
`formatCompactNumber`) a disparu de `main`**.

### Diagnostic (git forensics)
- `deb81adf` (squash iter 61, PR #1201) **créait** `apps/web/utils/format-number.ts` et convertissait
  `PostDetail` / `CommunityCarousel` / `me/page`.
- `git log --full-history -- apps/web/utils/format-number.ts` :
  ```
  9a431658 refactor: corrections du review présence (conformité + decay)   ← SUPPRIME le fichier
  deb81adf refactor(web): source unique du compteur compact — iter 61       ← le crée
  ```
- **Cause** : la PR parallèle `9a431658` a forké d'un `main` **antérieur à iter 61** ; à son merge,
  elle a **réintroduit** l'ancienne version des 3 fichiers et **supprimé** `format-number.ts`
  (clobber de branche périmée — revert sémantique via merge, invisible en `diff` simple car porté
  par un commit de merge).
- Mon iter 62 (`truncate`) a été mergé au-dessus sans toucher ces fichiers → le revert a persisté.

L'état actuel de `main` : `PostDetail.formatCount` (`K`/`M`), `CommunityCarousel.formatCount` (`k`),
`me.formatNumber` (`k`, **sans palier million**) — exactement la divergence + le bug que iter 61
avait corrigés.

## Décision iter 63 — lot « Restauration de `formatCompactNumber` (F29-restore) »

Restaurer intégralement le travail d'iter 61 :
1. Ré-ajouter `utils/format-number.ts` + `__tests__/utils/format-number.test.ts` (récupérés depuis
   `deb81adf`, inchangés).
2. Re-converger les 3 fichiers (`PostDetail`, `CommunityCarousel`, `me/page`) sur `formatCompactNumber`
   (délégations `const formatCount = formatCompactNumber`).

### Garanties
- Ré-application **à l'identique** du diff iter 61 (les 3 fichiers étaient revenus byte-pour-byte à
  leur état pré-iter-61) → même unification (casse `K`/`M`/`B`) + même correction du palier million
  de `me/page` (`2000.0k` → `2.0M`).
- Test unitaire restauré : **6/6** ; `CommunityCarousel.test.tsx` : **11/11** ; `tsc` sans erreur sur
  les fichiers touchés.

## Leçon (consignée pour la routine)
Un merge parallèle issu d'une base périmée peut **reverter silencieusement** un lot déjà mergé, sans
apparaître dans un `git diff base..tip` simple (le revert est porté par le commit de merge). **Avant
chaque nouvelle itération, vérifier que les sources uniques récemment introduites existent toujours**
(`ls`/`grep` du fichier canonique) ; sinon, restaurer avant de continuer. Ajouté au protocole de
démarrage d'itération.

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| F30 | ~17 sites `navigator.clipboard.writeText` → `lib/clipboard::copyToClipboard` | MOYEN-HAUT |
| F25b | Validateurs téléphone | MOYEN |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN |

## Gain
Régression corrigée : la source unique `formatCompactNumber` et l'unification des compteurs compacts
(+ le bugfix du palier million de `me/page`) sont **restaurées** sur `main`. Prochain grain : F30
(robustesse presse-papier) ou nouveau cluster.
