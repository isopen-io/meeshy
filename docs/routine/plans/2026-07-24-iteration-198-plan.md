# Plan — Iteration 198 : convergence `UserMediaSection` → SSOT `formatFileSize`

## Objectives
Supprimer la dernière copie divergente **active** du formatage de taille de
fichier (`UserMediaSection.formatSize`, plafonnée à MB → « 2048.0 MB » pour 2 Go)
et la recâbler sur le SSOT `formatFileSize` (`packages/shared/types/attachment.ts`).

## Affected modules
- `apps/web/components/admin/user-detail/UserMediaSection.tsx` (prod)
- `apps/web/__tests__/components/admin/user-detail/UserDetailSections.test.tsx` (test)

## Implementation phases
1. **RED** — Mettre à jour l'expectation MB (« 2.0 MB » → « 2 MB », le SSOT
   retire les zéros de fin) + ajouter un test « GB size (no MB overflow) »
   (2 Go → « 2 GB », pas « 2048 MB »). Vérifier l'échec sur le code courant.
2. **GREEN** — Importer `formatFileSize` ; supprimer `formatSize` local ;
   remplacer l'appel `formatSize(item.fileSize)` par `formatFileSize(item.fileSize)`.
3. **Validation** — Suite complète verte, tsc propre sur le fichier modifié.

## Dependencies
Aucune. `formatFileSize` déjà exporté et testé (`__tests__/types/attachment.test.ts`).

## Estimated risks
Faible. Web-only ; aucun schéma/API/migration/clé i18n. Site d'appel garde déjà
la nullité (`{item.fileSize ? … : null}`) → signature `number` satisfaite.

## Rollback strategy
Révert du commit unique — délégation pure à un SSOT indépendant.

## Validation criteria
- `UserDetailSections.test.tsx` : 225/225 verts (dont GB + MB mis à jour, 20/20
  pour `UserMediaSection`).
- Aucune erreur `tsc` introduite sur `UserMediaSection.tsx`.

## Completion status
- [x] Phase 1 RED (test GB ajouté + MB mis à jour ; échec confirmé « 2048.0 MB »)
- [x] Phase 2 GREEN (import + suppression `formatSize` + renommage appel)
- [x] Phase 3 validation (225/225 verts ; fichier modifié sans erreur tsc)
- [ ] Merge + delete branch (en cours)

## Progress tracking
Commit unique sur `claude/brave-archimedes-bibxop` depuis `main@5c0c0452`.

## Future improvements
Voir la section « Future improvements » de l'analyse 198 — audit SSOT exhaustif :
1. **Cartes drapeau/nom de langue** (3-voies : `languages.ts` SSOT vs
   `language-utils.ts` vs `v2/flags.ts`) — impact le plus élevé, surface chat
   principale, `en → 🇺🇸` vs 🇬🇧, fallback globe pour 40+ langues, tests
   contradictoires. **Cible recommandée itération 199.**
2. **`classifyRelativeTime`** — 5 copies « time ago » locales (dont
   `v2/CommentItem` anglais non-i18n).
3. **`date-format.ts`** — ~15 copies `formatDate` ad-hoc (impact moyen).
