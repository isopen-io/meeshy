# Plan — Itération 60wc (web only)

**Objectif** : i18n des 7 libellés d'accessibilité FR figés de
`components/attachments/AttachmentPreviewReply.tsx` (surface chat live).
**Numérotée 60wc** : double collision absorbée (60w/#806 config-modal + 60wb/#808 auth) — périmètres disjoints.

## Étapes
1. ✅ Sync branche sur `main` HEAD.
2. ✅ Revue anti-doublon : #802/#803 = doublons focus-trap 59w → à fermer.
3. ✅ `useI18n('attachments')` + 7 substitutions `t()` (3 réutilisées, 4 neuves).
4. ✅ 4 clés neuves `attachments.actions.{imagePreviewNamed,
   openVideoFullscreenNamed,openPdfNamed,openTextFileNamed}` ×4 locales.
5. ✅ Mock `useI18n` dans le test (assertions par nom accessible FR).
6. ✅ CI #804 verte (Quality bun + Test web + Security + Build).
7. ⏳ Merge dans `main` (3 résolutions de collision docs) + suppression branche.

## Fichiers touchés
- `apps/web/components/attachments/AttachmentPreviewReply.tsx`
- `apps/web/__tests__/components/attachments/AttachmentPreviewReply.test.tsx`
- `apps/web/locales/{en,fr,es,pt}/attachments.json`
- `docs/analyses/uiux/2026-06-22-iteration-60wc.md`
- `docs/plans/uiux/2026-06-22-plan-iteration-60wc.md`
- `docs/plans/uiux/branch-tracking.md`

## Leçon (à appliquer chaque run)
- **« Code mort » côté web** : grep AUSSI `lib/lazy-components.tsx` + imports
  dynamiques, pas seulement les imports statiques (`config-modal.tsx` faussement
  jugé mort → en fait lazy live, i18n #806).
- **Tempête de collisions** : à fort parallélisme, `git fetch` + résolution +
  renumérotation suffixée (`60w`→`60wb`→`60wc`) à chaque merge ; toujours
  surface orthogonale.
</content>
# Plan de correction — Itération 60wc (web)

**Cible** : `apps/web/components/admin/AdminLayout.tsx`
**Type** : bug de correctness (crash runtime) — sélecteur de thème admin
**Branche** : `claude/practical-fermat-8e8nhk`
**Base** : `main` HEAD post-iter-60w (#806) + iter-60wb (#808)

## Renumérotation

Numérotée **60wc** : 60w « config-modal i18n » (#806) puis 60wb « auth `t()||` anti-pattern » (#808, agent parallèle `o2g4dt`) ont mergé avant cette branche. Surface (bug `setTheme`) orthogonale aux deux.

## Problème

Le menu de thème de l'en-tête admin appelle `setTheme(...)` (l.355/359/363) alors que `setTheme` n'est **ni importé ni défini** → `ReferenceError` au clic. Masqué au build par `next.config.ts` `typescript.ignoreBuildErrors: true`.

## Étapes

1. [x] Confirmer que `setTheme` n'est ni importé ni fourni par un hook dans `AdminLayout.tsx`.
2. [x] Identifier le setter canonique : `useAppActions().setTheme` (`stores/app-store.ts`, signature `'light'|'dark'|'auto'`).
3. [x] Ajouter `useAppActions` à l'import `@/stores` existant.
4. [x] Brancher `const { setTheme } = useAppActions();` dans le composant.
5. [x] Vérifier l'absence d'impact locale (clés `layout.theme*` déjà présentes).
6. [x] Commit + push ; CI verte (PR #805).
7. [x] Résoudre les collisions de merge successives (60w→60wb→60wc) sur `branch-tracking.md`.
8. [ ] Merger dans `main` après CI verte ; supprimer la branche.

## Critères de complétude

- `setTheme` résolu (import + binding) ; diff code = 2 lignes, 1 fichier.
- Aucun fichier locale modifié.
- Pas de régression : pattern identique à `theme-settings.tsx`.

## Suite (61w)

- `AdminLayout.tsx:351` `sr-only "Toggle theme"` → `layout.toggleTheme` ×4 (parité a11y, faible priorité).
- Reste de l'anti-pattern `t()||` (~270 occ / ~48 fichiers, après #808) — différé borné 60wd+.
- `PhoneResetFlow.tsx:490` `sr-only "Indicatif pays"` ; `AttachmentPreviewReply.tsx:205-206` (title/aria FR).
