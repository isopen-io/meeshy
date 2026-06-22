# Plan — Itération 60wb (web only)

**Objectif** : i18n des 7 libellés d'accessibilité FR figés de
`components/attachments/AttachmentPreviewReply.tsx` (surface chat live).
**Numérotée 60wb** : collision avec la 60w (#806, config-modal) — périmètres disjoints.

## Étapes
1. ✅ Sync branche sur `main` HEAD.
2. ✅ Revue anti-doublon : #802/#803 = doublons focus-trap 59w → à fermer.
3. ✅ `useI18n('attachments')` ajouté au composant.
4. ✅ 7 substitutions `t()` (3 clés réutilisées, 4 neuves).
5. ✅ 4 clés neuves `attachments.actions.{imagePreviewNamed,
   openVideoFullscreenNamed,openPdfNamed,openTextFileNamed}` ×4 locales.
6. ✅ Mock `useI18n` dans le test (assertions par nom accessible FR).
7. ✅ CI #804 verte (Quality bun + Test web + Build + tous tests + Summary).
8. ⏳ Merge dans `main` (résolution conflit collision 60w/#806) + suppression branche.

## Fichiers touchés
- `apps/web/components/attachments/AttachmentPreviewReply.tsx`
- `apps/web/__tests__/components/attachments/AttachmentPreviewReply.test.tsx`
- `apps/web/locales/{en,fr,es,pt}/attachments.json`
- `docs/analyses/uiux/2026-06-22-iteration-60wb.md`
- `docs/plans/uiux/2026-06-22-plan-iteration-60wb.md`
- `docs/plans/uiux/branch-tracking.md`

## Leçon (à appliquer chaque run)
- **« Code mort » côté web** : grep AUSSI `lib/lazy-components.tsx` (lazy registry)
  + imports dynamiques `import(...)`, pas seulement les imports statiques.
  (`config-modal.tsx` faussement jugé mort ici → en fait lazy + live, i18n par #806.)
- `git fetch origin main` + `list_pull_requests` AVANT de coder ; surface
  orthogonale ; renuméroter en cas de collision (`60wb`).
</content>
