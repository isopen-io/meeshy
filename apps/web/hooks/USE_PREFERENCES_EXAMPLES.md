# usePreferences Hook - Usage Examples

## Basic Usage

### Audio Preferences
```typescript
import { usePreferences } from '@/hooks/use-preferences';
import type { AudioPreference } from '@meeshy/shared/types/preferences/audio';

function AudioSettings() {
  const {
    preferences,
    isLoading,
    isSaving,
    error,
    updateField,
    updatePreferences,
  } = usePreferences<AudioPreference>('audio');

  if (isLoading) return <Loader />;
  if (error) return <Error message={error} />;
  if (!preferences) return <Empty />;

  return (
    <div>
      <Switch
        checked={preferences.transcriptionEnabled}
        onCheckedChange={(checked) => updateField('transcriptionEnabled', checked)}
        disabled={isSaving}
      />
    </div>
  );
}
```

---

## Advanced Features

### 1. Optimistic Updates

**Default behavior** (recommended):
```typescript
// ✅ Optimistic update - instant UI feedback
await updateField('transcriptionEnabled', true);
// UI updates immediately, then syncs with server
```

**Skip optimistic update** (for expensive operations):
```typescript
// ⏳ Wait for server confirmation before updating UI
await updateField('audioQuality', 'lossless', {
  skipOptimistic: true
});
```

---

### 2. Multiple Field Updates

Update multiple fields at once:
```typescript
await updatePreferences({
  transcriptionEnabled: true,
  transcriptionSource: 'server',
  audioQuality: 'high',
});
```

---

### 3. Silent Updates (No Toast)

```typescript
// Update without showing success toast
await updateField('ttsSpeed', 1.5, {
  skipToast: true
});
```

---

### 4. GDPR Consent Violation Handling

```typescript
const { preferences, updateField, consentViolations } = usePreferences<AudioPreference>('audio', {
  onConsentViolation: (violations) => {
    console.log('GDPR violations:', violations);
    // Open consent dialog
    openConsentDialog(violations);
  }
});

// User tries to enable feature without consent
await updateField('transcriptionEnabled', true);

// API returns 403 CONSENT_REQUIRED
// Hook automatically:
// 1. Rolls back optimistic update
// 2. Shows toast with violation message
// 3. Calls onConsentViolation callback
// 4. Sets consentViolations state

if (consentViolations) {
  return <ConsentRequiredDialog violations={consentViolations} />;
}
```

---

### 5. Reset to Defaults

```typescript
const { resetPreferences } = usePreferences<AudioPreference>('audio');

// Reset all preferences to default values
await resetPreferences();
```

---

### 6. Silent Refresh

```typescript
const { refresh } = usePreferences<AudioPreference>('audio');

// Refresh data without showing loader
await refresh();
```

---

## Notification Preferences Example

```typescript
import type { NotificationPreference } from '@meeshy/shared/types/preferences/notification';

function NotificationSettings() {
  const {
    preferences,
    isLoading,
    updateField,
  } = usePreferences<NotificationPreference>('notification');

  if (isLoading) return <Loader />;

  return (
    <div>
      <Switch
        checked={preferences?.emailNotifications ?? false}
        onCheckedChange={(checked) => updateField('emailNotifications', checked)}
      />

      <Switch
        checked={preferences?.pushNotifications ?? false}
        onCheckedChange={(checked) => updateField('pushNotifications', checked)}
      />

      <Select
        value={preferences?.notificationSound ?? 'default'}
        onValueChange={(value) => updateField('notificationSound', value)}
      >
        <SelectItem value="default">Default</SelectItem>
        <SelectItem value="chime">Chime</SelectItem>
        <SelectItem value="bell">Bell</SelectItem>
      </Select>
    </div>
  );
}
```

---

## Privacy Preferences Example

```typescript
import type { PrivacyPreference } from '@meeshy/shared/types/preferences/privacy';

function PrivacySettings() {
  const {
    preferences,
    updatePreferences,
    resetPreferences,
  } = usePreferences<PrivacyPreference>('privacy', {
    showToasts: true,
    onUpdateSuccess: () => {
      console.log('Privacy settings updated');
    },
    onUpdateError: (error) => {
      console.error('Failed to update privacy settings:', error);
    },
  });

  const handlePrivacyModeChange = async () => {
    await updatePreferences({
      profileVisibility: 'private',
      shareActivity: false,
      allowTagging: false,
    });
  };

  return (
    <div>
      <Button onClick={handlePrivacyModeChange}>
        Enable Privacy Mode
      </Button>

      <Button onClick={resetPreferences}>
        Reset to Defaults
      </Button>
    </div>
  );
}
```

---

## Display Preferences Example

```typescript
import type { DisplayPreference } from '@meeshy/shared/types/preferences/display';

function DisplaySettings() {
  const { preferences, updateField } = usePreferences<DisplayPreference>('display');

  return (
    <div>
      {/* Theme */}
      <Select
        value={preferences?.theme ?? 'system'}
        onValueChange={(value) => updateField('theme', value as 'light' | 'dark' | 'system')}
      >
        <SelectItem value="light">Light</SelectItem>
        <SelectItem value="dark">Dark</SelectItem>
        <SelectItem value="system">System</SelectItem>
      </Select>

      {/* Font Size */}
      <input
        type="range"
        min="12"
        max="20"
        value={preferences?.fontSize ?? 16}
        onChange={(e) => updateField('fontSize', parseInt(e.target.value))}
      />

      {/* Reduced Motion */}
      <Switch
        checked={preferences?.reducedMotion ?? false}
        onCheckedChange={(checked) => updateField('reducedMotion', checked)}
      />
    </div>
  );
}
```

---

## Custom Options Example

```typescript
function CustomSettings() {
  const {
    preferences,
    updateField,
    error,
    consentViolations,
  } = usePreferences<AudioPreference>('audio', {
    showLoader: true,        // Show initial loader
    showToasts: true,        // Show success/error toasts
    onUpdateSuccess: () => {
      console.log('✅ Update successful');
      analytics.track('preferences_updated');
    },
    onUpdateError: (error) => {
      console.error('❌ Update failed:', error);
      Sentry.captureException(error);
    },
    onConsentViolation: (violations) => {
      console.warn('🔒 GDPR violation:', violations);
      openConsentDialog(violations);
    },
  });

  // Handle errors
  if (error) {
    return <Alert variant="destructive">{error}</Alert>;
  }

  // Handle consent violations
  if (consentViolations) {
    return (
      <ConsentRequiredDialog
        violations={consentViolations}
        onConsent={() => {
          // Retry after consent granted
          updateField('transcriptionEnabled', true);
        }}
      />
    );
  }

  return (
    <div>
      {/* Your settings UI */}
    </div>
  );
}
```

---

## Testing Examples

### Unit Tests

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { usePreferences } from '@/hooks/use-preferences';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service');

describe('usePreferences', () => {
  it('loads preferences on mount', async () => {
    const mockPreferences = {
      transcriptionEnabled: true,
      transcriptionSource: 'auto',
    };

    (apiService.get as jest.Mock).mockResolvedValue({
      success: true,
      data: { data: mockPreferences },
    });

    const { result } = renderHook(() => usePreferences('audio'));

    await waitFor(() => {
      expect(result.current.preferences).toEqual(mockPreferences);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('updates field with optimistic update', async () => {
    const { result } = renderHook(() => usePreferences('audio'));

    // Wait for initial load
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    (apiService.patch as jest.Mock).mockResolvedValue({
      success: true,
      data: { data: { transcriptionEnabled: true } },
    });

    // Update field
    await result.current.updateField('transcriptionEnabled', true);

    // Check optimistic update
    expect(result.current.preferences?.transcriptionEnabled).toBe(true);
  });

  it('handles GDPR consent violation', async () => {
    const onConsentViolation = jest.fn();
    const { result } = renderHook(() =>
      usePreferences('audio', { onConsentViolation })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const violations = [
      {
        field: 'transcriptionEnabled',
        requiredConsent: 'voiceDataConsentAt',
        message: 'Consent required',
      },
    ];

    (apiService.patch as jest.Mock).mockResolvedValue({
      success: false,
      status: 403,
      error: 'CONSENT_REQUIRED',
      violations,
    });

    await result.current.updateField('transcriptionEnabled', true);

    expect(onConsentViolation).toHaveBeenCalledWith(violations);
    expect(result.current.consentViolations).toEqual(violations);
  });
});
```

---

## Best Practices

### ✅ DO
- Use optimistic updates for instant UI feedback
- Handle GDPR consent violations gracefully
- Show loading states during initial load
- Use TypeScript for type safety
- Memoize child components to prevent re-renders
- Use `skipToast` for rapid successive updates (e.g., range sliders)

### ❌ DON'T
- Don't mix multiple preference categories in one component
- Don't forget to handle `null` preferences (initial state)
- Don't skip error handling
- Don't update preferences too frequently (debounce rapid changes)
- Don't ignore GDPR violations

---

## API Contract

### GET /api/v1/me/preferences/{category}
**Response**:
```json
{
  "success": true,
  "data": { /* preferences object */ }
}
```

### PATCH /api/v1/me/preferences/{category}
**Request**:
```json
{
  "field1": "value1",
  "field2": "value2"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "data": { /* updated preferences */ }
}
```

**Response (GDPR Violation)**:
```json
{
  "success": false,
  "error": "CONSENT_REQUIRED",
  "status": 403,
  "message": "Consentements requis manquants",
  "violations": [
    {
      "field": "transcriptionEnabled",
      "requiredConsent": "voiceDataConsentAt",
      "message": "Consent required: voiceDataConsentAt"
    }
  ]
}
```

### DELETE /api/v1/me/preferences/{category}
**Response**:
```json
{
  "success": true,
  "message": "Preferences reset to defaults"
}
```

---

## Supported Categories

| Category | Type | Description |
|----------|------|-------------|
| `audio` | `AudioPreference` | Audio, transcription, TTS, voice profile |
| `notification` | `NotificationPreference` | Email, push, sounds, badges |
| `privacy` | `PrivacyPreference` | Visibility, activity, data retention |
| `display` | `DisplayPreference` | Theme, font size, animations |
| `message` | `MessagePreference` | Read receipts, typing indicators |
| `video` | `VideoPreference` | Resolution, bandwidth, effects |
| `document` | `DocumentPreference` | Auto-save, versioning |
| `application` | `ApplicationPreference` | Language, timezone, startup |

---

## Performance Tips

1. **Debounce rapid updates** (e.g., range sliders):
   ```typescript
   const debouncedUpdate = useDebouncedCallback(
     (value: number) => updateField('ttsSpeed', value),
     300
   );
   ```

2. **Skip toasts for rapid changes**:
   ```typescript
   await updateField('ttsSpeed', 1.5, { skipToast: true });
   ```

3. **Batch multiple updates**:
   ```typescript
   // ✅ Single API call
   await updatePreferences({
     field1: value1,
     field2: value2,
     field3: value3,
   });

   // ❌ Three API calls
   await updateField('field1', value1);
   await updateField('field2', value2);
   await updateField('field3', value3);
   ```

4. **Memoize components**:
   ```typescript
   const Section = memo(function Section({ preferences, updateField }) {
     // Component only re-renders when props change
   });
   ```

---

## Troubleshooting

### Problem: Updates not persisting
**Solution**: Check for GDPR consent violations in `consentViolations` state.

### Problem: Multiple API calls
**Solution**: Use `updatePreferences()` instead of multiple `updateField()` calls.

### Problem: Slow UI feedback
**Solution**: Ensure optimistic updates are enabled (default behavior).

### Problem: Component re-rendering too often
**Solution**: Wrap child components with `memo()` and memoize callbacks.

---

## Migration from Legacy Code

### Before (Legacy)
```typescript
const [config, setConfig] = useState({});
const updateConfig = async (key, value) => {
  await apiService.put('/user-features/configuration', { [key]: value });
  setConfig(prev => ({ ...prev, [key]: value }));
};
```

### After (Modern)
```typescript
const { preferences, updateField } = usePreferences<AudioPreference>('audio');
await updateField('transcriptionSource', 'server');
```

**Benefits**:
- 90% less code
- Optimistic updates
- Automatic error handling
- GDPR compliance
- Type safety
