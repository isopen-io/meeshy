# Plan d'implémentation — Itération 202

## Objectifs
Converger la dernière copie inline **vivante** de « code langue → nom d'affichage »
sur la surface profil v2 (`apps/web/hooks/v2/use-profile-v2.ts`) vers le SSOT
`getLanguageInfo` (`packages/shared/utils/languages.ts`), restaurant les noms
natifs corrects et étendant la couverture de 13 à 60+ langues.

## Modules affectés
- `apps/web/hooks/v2/use-profile-v2.ts` (prod)
- `apps/web/__tests__/hooks/v2/use-profile-v2.test.tsx` (tests)
- `docs/routine/{analyses,plans}/2026-07-25-iteration-202-*.md`

## Phases d'implémentation
1. **RED** — Ajouter 4 tests : noms natifs corrects (fr → « Français »,
   es → « Español »), couverture au-delà des 13 entrées (nl → « Nederlands »,
   pt → « Português »), fallback vide → « Français ». Vérifier l'échec sur le code
   courant (« Francais » / « NL »).
2. **GREEN** — Importer `getLanguageInfo` depuis `@meeshy/shared/utils/languages` ;
   supprimer la table `LANGUAGE_NAMES` locale ; réécrire `getLanguageName` en
   délégation `info.nativeName ?? info.name` ; remplacer le `name: 'Francais'`
   codé en dur du fallback par `getLanguageName('fr')`.
3. **Validation** — Suite complète verte ; tsc propre sur les fichiers modifiés.

## Dépendances
Aucune. `getLanguageInfo` déjà exporté, testé, et déjà dans le bundle v2.

## Risques estimés
Faible. Web-only ; aucun schéma/API/migration/clé i18n. Seul écart théorique :
`'multi' → « MULTI »` au lieu de « Multilingue », mais `'multi'` est un pseudo-code
de conversation, jamais une valeur de champ langue utilisateur → inatteignable.

## Stratégie de rollback
Révert du commit unique — délégation pure à un SSOT indépendant.

## Critères de validation
- `use-profile-v2.test.tsx` : 40/40 verts (dont 4 nouveaux).
- `__tests__/hooks/v2` : 85/85 verts (4 suites).
- Aucune erreur `tsc` introduite sur les fichiers modifiés.

## Completion status
- [x] Phase 1 RED (4 tests ajoutés ; échec confirmé sur « Francais »/« NL »)
- [x] Phase 2 GREEN (import + suppression table + réécriture helper + fallback)
- [x] Phase 3 validation (40/40 puis 85/85 verts ; fichiers modifiés sans erreur tsc)
- [x] Commit + push
- [ ] PR ouverte

## Progress tracking
Commit unique sur `claude/brave-archimedes-cnacxu` depuis `main@0ae263e9`.

## Future improvements
Voir la section « Future improvements » de l'analyse 202 :
1. `language-utils.ts` — bloqué sur décision produit (flag `en`, 25 langues hors SSOT).
2. `audio-effects-config.ts` `LANGUAGE_NAMES` — à qualifier (usage voix vs affichage).
3. `v2/CommentItem.tsx` time-ago — bloqué sur câblage `t()` v2.
4. Copies `formatDate` ad-hoc (~30 sites) vs SSOT date absolue à créer.
