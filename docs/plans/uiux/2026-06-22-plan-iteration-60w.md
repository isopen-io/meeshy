# Plan — Itération 60w (web only)

**Objectif** : i18n des 7 libellés d'accessibilité FR figés de
`components/attachments/AttachmentPreviewReply.tsx` (surface chat live).

## Étapes
1. ✅ Sync branche sur `main` HEAD (post-merge iter-59w #796).
2. ✅ Revue anti-doublon : config-modal = code mort (faux positif) ; #802/#803 =
   doublons focus-trap 59w → à fermer.
3. ✅ `useI18n('attachments')` ajouté au composant.
4. ✅ 7 substitutions `t()` (3 clés réutilisées, 4 neuves).
5. ✅ 4 clés neuves `attachments.actions.{imagePreviewNamed,
   openVideoFullscreenNamed,openPdfNamed,openTextFileNamed}` ×4 locales.
6. ✅ Vérif grep FR = 0 + JSON valide ×4 + diff additif.
7. ⏳ Commit + push branche `claude/practical-fermat-afplne`.
8. ⏳ PR → CI vert → merge dans `main`.
9. ⏳ Mettre à jour `branch-tracking.md` + supprimer la branche après merge.

## Fichiers touchés
- `apps/web/components/attachments/AttachmentPreviewReply.tsx`
- `apps/web/locales/{en,fr,es,pt}/attachments.json`
- `docs/analyses/uiux/2026-06-22-iteration-60w.md`
- `docs/plans/uiux/2026-06-22-plan-iteration-60w.md`
- `docs/plans/uiux/branch-tracking.md`

## Orthogonalité (anti-collision agents parallèles)
Surface `attachments` non touchée par les PR ouvertes (#802/#803 = a11y modales ;
dependabot = deps). Risque de conflit nul.
</content>
