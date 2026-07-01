# Iteration 61 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique — compteur compact (F29) » : créer `formatCompactNumber`
(`apps/web/utils/format-number.ts`, standard K/M/B majuscules) et converger les 3 formatteurs
locaux divergents, unifiant la casse et corrigeant le palier million manquant de `me/page`.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Baseline : `CommunityCarousel.test.tsx` vert (teste la navigation, pas les compteurs).
- [x] Aucun test n'assert la sortie compacte des 3 composants.

## Étapes (délégation → vérification)

### Phase A — Source unique
- [x] `utils/format-number.ts` : `formatCompactNumber(value)` → `K`/`M`/`B` majuscules, 1 décimale,
      seuil 1 000, négatifs symétriques. Pur/déterministe.
- [x] Test `__tests__/utils/format-number.test.ts` (6 cas : <1000, K, M, B, négatifs).

### Phase B — Convergence des 3 formatteurs
- [x] `v2/PostDetail.tsx` : `const formatCount = formatCompactNumber` (sortie inchangée).
- [x] `v2/CommunityCarousel.tsx` : idem (`k` → `K`).
- [x] `app/(connected)/me/page.tsx` : `const formatNumber = formatCompactNumber` (`k` → `K` + palier M).

### Phase C — Vérification & livraison
- [x] `jest format-number + CommunityCarousel` → **17/17**.
- [x] `tsc --noEmit` : aucune erreur sur les 4 fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-9e5y85` ; PR vers `main` ; CI verte ; **merge**.

## Hors périmètre (consigné dans l'analyse)
- `admin/ranking/formatCount` (`toLocaleString`, sémantique différente), `sampleRate/1000` (kHz audio).
- F30 (presse-papier), F25b, F2, F10, F21.

## Continuité
Iter 62 : nouveau scout. Pistes : cluster presse-papier `copyToClipboard` (F30, 16 sites), slug/url,
sanitize, validateurs téléphone (F25b).

## Incidents de merge (parallélisme multi-agents)
- Re-vérifier `origin/main` juste avant le merge ; le code (`utils/format-number.ts` + 3 fichiers
  compteurs) est disjoint des tracks initiales/iOS → seul le slot de docs iter-61 pourrait
  collisionner → renuméroter si pris.

## Statut (mis à jour en fin d'itération)
- [x] Phase A / B — util `formatCompactNumber` + 3 convergences ; unification K/M/B assumée.
- [x] Phase C — tests + tsc verts ; reste : commit + push + PR + CI + merge.
