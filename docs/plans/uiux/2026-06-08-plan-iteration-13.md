# UI/UX Plan — Iteration 13 (2026-06-08)

Based on `docs/analyses/uiux/2026-06-08-iteration-13.md`.

## Fixes

### [I1] OnboardingStepViews — `Color.blue` ×2
- L911: `.fill(Color.blue.opacity(0.2))` → `.fill(MeeshyColors.indigo400.opacity(0.2))`
- L913: `.foregroundColor(.blue)` → `.foregroundColor(MeeshyColors.indigo400)`

### [I2] CreateTrackingLinkView — error text
- L34: `.font(.system(size: 13)).foregroundColor(.red)` → `.font(.footnote).foregroundColor(MeeshyColors.error)`

### [I3] ConversationLockSheet — PIN error
- L56–57: `.font(.system(size: 13, weight: .semibold)).foregroundColor(.red)` → `.font(.footnote.weight(.semibold)).foregroundColor(MeeshyColors.error)`

### [I4] ForwardPickerSheet — sent checkmark
- L192: `.font(.system(size: 24))` → `.font(.title2)`
- L193: `.foregroundColor(.green)` → `.foregroundColor(MeeshyColors.success)`

### [I5] CameraView — recording indicators ×3
- L185: `.fill(.red)` → `.fill(MeeshyColors.error)`
- L189: `.fill(.red)` → `.fill(MeeshyColors.error)`
- L199: `.fill(.red)` → `.fill(MeeshyColors.error)`

### [I6] ConversationDashboardView — ContentTypeStat Color migration
- L1085: `let color: String` → `let color: Color`
- L1113: `color: "34D399"` → `color: MeeshyColors.success`
- L1114: `color: "818CF8"` → `color: MeeshyColors.indigo400`
- L1115: `color: "F87171"` → `color: MeeshyColors.error`
- L1116: `color: "FBBF24"` → `color: MeeshyColors.warning`
- L778: `.foregroundColor(Color(hex: stat.color))` → `.foregroundColor(stat.color)`
- L790: `[Color(hex: stat.color).opacity(0.7), Color(hex: stat.color).opacity(0.3)]` → `[stat.color.opacity(0.7), stat.color.opacity(0.3)]`

### [W1] AttachmentGallery — delete dialog localization
- Add `contextMenu.cancel` to all 4 locale files:
  - en: "Cancel", fr: "Annuler", es: "Cancelar", pt: "Cancelar"
- L402: `Confirmer la suppression` → `{t('contextMenu.confirmDeleteTitle')}`
- L403–405: `Êtes-vous sûr...` → `{t('contextMenu.confirmDeleteDescription')}`
- L413–415: `Le fichier sera définitivement supprimé du serveur.` → `{t('contextMenu.confirmDeleteIrreversible')}`
- L423: `Annuler` → `{t('contextMenu.cancel')}`
- L430: `isDeleting ? 'Suppression...' : 'Supprimer'` → `isDeleting ? t('contextMenu.deleting') : t('contextMenu.delete')`

## Checklist

- [ ] I1 — OnboardingStepViews Color.blue ×2
- [ ] I2 — CreateTrackingLinkView .red + font
- [ ] I3 — ConversationLockSheet .red + font
- [ ] I4 — ForwardPickerSheet .green + font
- [ ] I5 — CameraView .red ×3
- [ ] I6 — ConversationDashboardView ContentTypeStat Color
- [ ] W1 — AttachmentGallery dialog + locale cancel key ×4
- [ ] Commit & push on feat/uiux-iter9
- [ ] CI green
- [ ] Merge into main
