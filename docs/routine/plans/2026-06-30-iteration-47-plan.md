# Iteration 47 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique du formatage de durée horloge (F25c) » : faire déléguer les 2 dernières
réimplémentations inline web de `formatDuration` (`MessageComposer.tsx`, `VideoPlayer.tsx`) au
canonique `formatClock` (via le wrapper `apps/web/utils/audio-formatters.ts` qui l'expose déjà
sous le nom `formatDuration`). VideoPlayer byte-identique sur toute la plage ; MessageComposer
byte-identique en usage réel, strictement plus correct aux bords.

## Pré-requis runner (parité CI)
- [x] `packages/shared && bun run build` (tsc) → `dist/` présent.
- [x] Baselines vertes : shared vitest **1208/1208** ; web jest `VideoPlayer` **58/58**,
      `audio-formatters` vert.

## Étapes (délégation à une SSOT déjà testée — pas de nouveau RED shared)

### Phase A — `apps/web/components/v2/MessageComposer.tsx`
- [ ] Supprimer le `function formatDuration` inline (l.130-134) + commentaire éventuel.
- [ ] Ajouter `import { formatDuration } from '@/utils/audio-formatters';` (call-sites l.274/545
      inchangés).
- [ ] `node_modules/.bin/jest __tests__/components/common/message-composer.test.tsx __tests__/components/message-composer/integration.test.tsx` → vert.

### Phase B — `apps/web/components/v2/VideoPlayer.tsx`
- [ ] Supprimer le `function formatDuration` inline (l.27-36) + commentaire.
- [ ] Ajouter `import { formatDuration } from '@/utils/audio-formatters';` (call-sites l.253/314/366
      inchangés).
- [ ] `node_modules/.bin/jest __tests__/components/video/VideoPlayer.test.tsx` → **58/58** vert
      (assertions `0:00`/`2:05`/`1:30`/`1:01:05` inchangées).

### Phase C — Vérification & livraison
- [ ] `tsc --noEmit` web : aucun nouveau type error sur les 2 fichiers touchés.
- [ ] Suite web jest ciblée (A+B) verte ; shared vitest **1208/1208** inchangé.
- [ ] Commit + push `claude/sharp-wozniak-dx26dd` ; PR vers `main` ; CI verte (checks
      code-relevant) ; **merge dans main** (squash).

## Hors périmètre (consigné dans l'analyse)
F25a (email plus strict — changement de comportement), F25b (téléphone — façade), F24b (FR
file-size), F2/F10/F21 (staging/backfill), gateway `formatDuration` abrégé FR (contrat distinct).

## Continuité
Iter 48+ : **F25a** (email RFC 5322) après validation que la stricte ne casse aucun flux
d'inscription/contact ; sinon **F25b** (façade téléphone) ou nouveau scout (avatar-color/initials,
slug/url, groupBy/chunk). F2/F10/F21 dès qu'une fenêtre staging/backfill existe.

## Incidents de merge (parallélisme multi-agents)
- **Clobber iter-46** : un commit parallèle (`0f7e3312`, présence Lot 3/6) avait réintroduit le
  `formatFileSize` local divergent dans `MessageComposer.tsx` (annulant iter-46). Conflit résolu
  en **restaurant les deux délégations** (`formatFileSize`→shared, `formatDuration`→wrapper).
- **Régression gateway pré-existante sur `main`** : la même Lot 3/6 a ajouté `presence-gate.ts`
  (`getOptionalAuth` → `createUnifiedAuthMiddleware`) et l'a câblée dans `getUserById`, sans mettre
  à jour le mock `auth` de `profile.test.ts` → **7 tests `Test gateway` en échec sur `main`**.
  Fix drive-by **test-only** : ajout de `createUnifiedAuthMiddleware: jest.fn(() => async () => {})`
  au mock. `profile.test.ts` **46/46** vert localement. Débloque la CI gateway de toute la routine.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `MessageComposer.tsx` : `formatDuration` inline supprimé, import de
      `@/utils/audio-formatters`. message-composer + integration verts.
- [x] Phase B — `VideoPlayer.tsx` : `formatDuration` inline supprimé, import du wrapper.
      `VideoPlayer.test.tsx` **58/58** (assertions `0:00`/`2:05`/`1:30`/`1:01:05` inchangées).
- [x] Phase C — 4 suites web affectées **133/133** vertes ; `tsc --noEmit` web : **aucun**
      type error sur les 2 fichiers touchés. Reste : push + PR + CI verte + merge dans main.
