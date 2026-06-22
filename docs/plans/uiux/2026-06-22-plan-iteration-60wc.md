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
