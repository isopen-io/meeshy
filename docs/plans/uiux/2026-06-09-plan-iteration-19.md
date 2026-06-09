# UI/UX Plan — Iteration 19 (2026-06-09)

## Scope

Implement all findings from `docs/analyses/uiux/2026-06-09-iteration-19.md`.

## Steps

### 1. Locale keys — admin.json (en/fr/es/pt)
- Add top-level: `logoutSuccess`, `logoutError`

### 2. Locale keys — attachments.json (en/fr/es/pt)
- Under `gallery`: `deleteSuccess`, `deleteError`, `delete`

### 3. Locale keys — conversations.json (en/fr/es/pt)
- Under `conversations`: add `inviteModal` section (`searchError`, `inviteSuccess`, `partialError`, `inviteError`)
- Under `conversations.createLinkButton`: add `fetchError`

### 4. Locale keys — audioEffects.json (en/fr/es/pt)
- Under `audioEffects.recorder.errors`: add `playbackError`

### 5. AdminLayout.tsx
- Add `useI18n('admin')` import + hook
- Lines 69, 73: 2 French toasts → t()

### 6. AgentScheduleTimeline.tsx
- Add `useI18n('admin')` import + hook
- Lines 82, 85, 88: 3 French toasts → t() (keys exist)

### 7. AttachmentGallery.tsx (useI18n already present)
- Lines 104, 108: 2 French toasts → t()
- Line 300: `title="Supprimer"` → `title={t('gallery.delete')}`

### 8. useAttachmentDeletion.ts
- Add `useI18n('attachments')` import + hook
- Lines 44, 48: 2 French toasts → t()

### 9. groups-layout-responsive.tsx (useI18n already present as tGroups)
- Lines 142, 169, 173: 2 unique French toasts → tGroups() (keys exist)

### 10. invite-user-modal.tsx (useI18n already present)
- Lines 64, 68, 113, 126, 131: 4 unique French toasts → t()

### 11. create-link-button.tsx (useI18n already present)
- Line 248: 1 French toast → t()

### 12. AudioRecorderCard.tsx (useI18n already present)
- Lines 196, 203, 303, 336, 486: 5 hardcoded strings → t()

### 13. iOS Dynamic Type fixes
- ContactsListTab.swift line 202
- DiscoverTab.swift line 173
- BlockedTab.swift line 114
- RequestsTab.swift line 263

## Commit & PR
- Commit all changes
- Push to `claude/dazzling-hawking-b4tdnk`
- Create PR into main
- Monitor CI and merge
