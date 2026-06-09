# UI/UX Plan — Iteration 18 (2026-06-08)

## Scope

Implement all findings from `docs/analyses/uiux/2026-06-08-iteration-18.md`.

## Steps

### 1. Locale keys — admin.json (en/fr/es/pt)
- Add to `agent.toasts`: `conversationConfigUpdated`, `archetypesLoadError`, `configLoadError`, `agentEnabled`, `agentDisabled`, `configDeleted`, `deleteError`
- Add new `agent.scheduling` section: `fixedTime`, `delay`, `frequency`, `timerWarning`, `dragToMove`, `notAvailable`, `triggerNow`, `stop`
- Add to `security`: `accountUnlocked`, `twoFactorEnabled`, `twoFactorDisabled`, `disabled`

### 2. Locale keys — common.json (en/fr/es/pt)
- Add: `copied`, `never`

### 3. Locale keys — calls.json (en/fr/es/pt)
- Add to `calls.toasts`: `joinFailed`

### 4. ScanControlPanel.tsx
- Add `useI18n('admin')` import + hook
- Lines 119, 122, 127, 130, 134: 5 French toasts → t()

### 5. AgentArchetypesTab.tsx
- Add `useI18n('admin')` import + hook
- Line 44: 1 French toast → t()

### 6. AgentConfigDialog.tsx (already has useI18n('admin'))
- Line 148: French toast → t('agent.toasts.invalidConversationId') (key exists)
- Line 212: French toast → t('common.copied') (new key)

### 7. AgentConversationsTab.tsx
- Add `useI18n('admin')` import + hook
- Lines 76, 94, 96, 105, 107, 115, 118, 122: 8 French toasts → t()

### 8. TriggerSchedulingModal.tsx (already has useI18n('admin'))
- Lines 349, 357, 382, 417, 455, 564, 675: 7 French labels → t()

### 9. UserSecuritySection.tsx (already has useI18n('admin'))
- Line 28: 'Jamais' → t('common.never')
- Line 45: toast → t('security.accountUnlocked')
- Line 56: template literal → t(has2FA ? 'security.twoFactorDisabled' : 'security.twoFactorEnabled')
- Line 142: <span>Désactivé</span> → <span>{t('security.disabled')}</span>

### 10. TextViewer.tsx (already has useI18n('viewers'))
- Line 69: → t('text.loadError')
- Line 82: → t('text.copied')
- Line 86: → t('text.copyError')

### 11. CallManager.tsx
- Add `useI18n('calls')` import + hook
- Line 367: → t('calls.toasts.joinFailed')

## Commit & PR
- Commit all changes
- Push to `claude/dazzling-hawking-b4tdnk`
- Create PR into main
- Monitor CI and merge
