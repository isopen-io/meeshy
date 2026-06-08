# UI/UX Plan — Iteration 12 (2026-06-08)

Based on `docs/analyses/uiux/2026-06-08-iteration-12.md`.

## Fixes

All fixes are simple `replace_all: false` token substitutions: system `.green`/`.red`/`Color.green`/`Color.red`/`Color.blue` → `MeeshyColors.success`/`MeeshyColors.error`/`MeeshyColors.indigo400`.

### [I1] StoryViewerView+Content — heart reaction `.red`
- Line 1063: `.foregroundColor(.red)` → `.foregroundColor(MeeshyColors.error)`

### [I2] CreateShareLinkView — error text `.red` ×2
- Lines 328, 331: `.foregroundColor(.red)` → `.foregroundColor(MeeshyColors.error)` (replace_all)

### [I3] TrackingLinkDetailView — status dot
- Line 261: `Color.green : Color.red` → `MeeshyColors.success : MeeshyColors.error`

### [I4] ProfileView — error capsule
- Line 69: `Color.red.opacity(0.9)` → `MeeshyColors.error.opacity(0.9)`

### [I5] MessageDetailSheet — delete ×2 + forward success
- Line 1637: `.foregroundColor(.red)` → `.foregroundColor(MeeshyColors.error)`
- Line 1665: `.fill(Color.red)` → `.fill(MeeshyColors.error)`
- Line 1891: `.foregroundColor(.green)` → `.foregroundColor(MeeshyColors.success)`

### [I6] CallView — transcription speaker indicator
- Line 675: `Color.blue : Color.green` → `MeeshyColors.indigo400 : MeeshyColors.success`

### [I7] AudioFullscreenView — speaker indicator
- Line 788: `.foregroundColor(.green)` → `.foregroundColor(MeeshyColors.success)`

### [I8] ConversationEncryptionDetailSheet — encryption status
- Line 41: `.foregroundColor(.red)` → `.foregroundColor(MeeshyColors.error)`
- Line 69: `.foregroundColor(.green)` → `.foregroundColor(MeeshyColors.success)`

## Checklist

- [ ] I1 — StoryViewerView+Content heart `.red`
- [ ] I2 — CreateShareLinkView error `.red` ×2
- [ ] I3 — TrackingLinkDetailView status dot
- [ ] I4 — ProfileView error capsule
- [ ] I5 — MessageDetailSheet delete ×2 + forward
- [ ] I6 — CallView speaker indicator
- [ ] I7 — AudioFullscreenView speaker indicator
- [ ] I8 — ConversationEncryptionDetailSheet encryption status
- [ ] Commit on `claude/dazzling-hawking-FeZgq`
- [ ] Push & CI green
- [ ] Merge into main
