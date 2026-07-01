# Iteration 70 — Plan d'implémentation (2026-07-01)

## Objectif
Converger les **3 réimplémentations locales** de « octets → chaîne lisible » vers la **source unique**
`formatFileSize()` de `@meeshy/shared/types/attachment`. Extension **rétro-compatible** (option `decimals`),
comportement préservé, CI garantie verte (cluster web/shared vérifiable localement).

## Phases

### Phase 1 — Extension rétro-compatible de la SSOT ✅
- [x] `packages/shared/types/attachment.ts` : `formatFileSize(bytes, options?: { decimals?: number })`,
  `decimals` défaut **2** (appelants existants inchangés). Ajout du type `FormatFileSizeOptions`.
- [x] `bun run build` (dist) pour que jest web (qui résout `@meeshy/shared/*` → `dist`) voie la nouvelle signature.

### Phase 2 — Convergence des réimplémentations ✅
- [x] `components/attachments/AttachmentDetails.tsx` : suppression du `const formatFileSize` local → import SSOT
- [x] `utils/media-compression.ts` : suppression du `function formatFileSize` local → import SSOT
- [x] `app/admin/monitoring/page.tsx` : `formatBytes` → alias `formatFileSize(bytes, { decimals: 1 })`
  (sites d'appel inchangés, précision 1 décimale préservée à l'identique)
- [x] `UserMediaSection.formatSize` **laissé tel quel** (sémantique compacte distincte → backlog F36)

### Phase 3 — Tests & vérification ✅
- [x] `packages/shared/__tests__/types/attachment.test.ts` : +3 tests (`decimals` défaut/option, clamp/exact)
- [x] vitest shared : **153/153** verts
- [x] `tsc --noEmit` (web) : **1198 = 1198** (0 régression)
- [x] jest web : **80/80** sur AttachmentDetails / media-compression / monitoring.service
- [x] `next lint` : exit 0

### Phase 4 — Livraison ✅
- [x] Commit + push sur `claude/sharp-wozniak-iua1p5`
- [ ] PR + merge dans `main` (CI verte)

## Backlog reporté (priorisé pour iter 71+)
- **F32** : SSOT ObjectId gateway (~25 sites) — dès que le CDN Prisma redevient joignable.
- **F33** : helper `avatarInitial` (~20 sites) + `capitalize` (~4) — audit sémantique par site requis.
- **F34** : `isValidUrl` centralisé dans `xss-protection.ts` (3 sites).
- **F35** : helpers localStorage JSON (13 sites) — refactor comportemental.
- **F36** : `UserMediaSection.formatSize` — ne pas fusionner mécaniquement.

## Résultat
Réimplémentations locales « octets → lisible » : **3 → 0**. `formatFileSize` : **1 seule** implémentation,
SSOT étendue et rétro-compatible. Continuité assurée pour l'itération 71 (cible candidate : F33
`avatarInitial` si web reste le seul cluster vérifiable, sinon F32 gateway si Prisma redevient disponible).
