# Feature Flags Guide

This document explains how to use feature flags to enable/disable features in the Meeshy frontend.

## Overview

Feature flags allow you to control which features are visible and accessible to users without changing code. This is useful for:

- **Gradual Rollout**: Enable features only when backend is ready
- **A/B Testing**: Show features to specific users
- **Emergency Disable**: Quickly disable problematic features
- **Development**: Test features in isolation

---

## Password Reset Feature Flag

### Configuration

The password reset feature is controlled by environment variables:

```bash
# .env.local
NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true  # or false
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=your_site_key_here
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### What Happens When Disabled

When `NEXT_PUBLIC_ENABLE_PASSWORD_RESET=false`:

1. **"Forgot Password?" link is hidden** on login page
2. **Direct access to `/forgot-password`** shows a user-friendly message
3. **Direct access to `/reset-password`** shows a user-friendly message
4. Users are informed the feature is temporarily unavailable
5. **No errors** - graceful degradation with helpful messaging

### What Happens When Enabled

When `NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true`:

1. ✅ "Forgot Password?" link appears on login page
2. ✅ Users can access `/forgot-password` page
3. ✅ Users can reset passwords via email
4. ⚠️ **Requires hCaptcha configuration**

---

## Quick Start

### 1. Disable Password Reset (Default)

```bash
# frontend/.env.local
NEXT_PUBLIC_ENABLE_PASSWORD_RESET=false
```

**Result**: Feature is completely hidden from users.

### 2. Enable Password Reset (Production-Ready)

```bash
# frontend/.env.local
NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=10000000-ffff-ffff-ffff-000000000001
NEXT_PUBLIC_API_URL=https://api.meeshy.com
```

**Prerequisites**:
- ✅ Backend password reset API deployed
- ✅ hCaptcha account created
- ✅ Email service configured (backend)
- ✅ Database migrations completed (backend)

---

## Implementation Details

### Hook: `useFeatureFlags()`

Located: `/hooks/use-feature-flags.ts`

```typescript
import { useFeatureFlags } from '@/hooks/use-feature-flags';

function MyComponent() {
  const { isFeatureEnabled, isPasswordResetConfigured } = useFeatureFlags();

  // Simple check
  if (isFeatureEnabled('passwordReset')) {
    // Show password reset UI
  }

  // Full configuration check (includes required env vars)
  if (isPasswordResetConfigured()) {
    // All requirements met
  }
}
```

### Component: `<FeatureGate>`

Located: `/components/auth/FeatureGate.tsx`

```typescript
import { FeatureGate } from '@/components/auth/FeatureGate';

// Option 1: Redirect to home if disabled
<FeatureGate feature="passwordReset">
  <ForgotPasswordForm />
</FeatureGate>

// Option 2: Show user-friendly message if disabled
<FeatureGate feature="passwordReset" showMessage={true}>
  <ForgotPasswordForm />
</FeatureGate>
```

---

## Files Modified for Feature Flags

### New Files Created

1. **`/hooks/use-feature-flags.ts`** (120 lines)
   - Central feature flag management
   - Checks environment variables
   - Validates configuration

2. **`/components/auth/FeatureGate.tsx`** (150 lines)
   - Protects routes/components
   - Shows user-friendly messages
   - Auto-redirects when disabled

### Modified Existing Files

1. **`/components/auth/login-form.tsx`**
   - Added conditional "Forgot Password?" link
   - Only shows when `isPasswordResetConfigured() === true`

2. **`/app/forgot-password/page.tsx`**
   - Wrapped in `<FeatureGate>` component
   - Shows message if feature disabled

3. **`/app/reset-password/page.tsx`**
   - Wrapped in `<FeatureGate>` component
   - Shows message if feature disabled

---

## Testing Feature Flags

### Test 1: Feature Disabled (Default)

```bash
# .env.local
NEXT_PUBLIC_ENABLE_PASSWORD_RESET=false
```

**Expected Behavior**:
1. ✅ No "Forgot Password?" link on login page
2. ✅ Visit `/forgot-password` → Shows "Feature Temporarily Unavailable" message
3. ✅ Visit `/reset-password?token=abc` → Shows "Feature Temporarily Unavailable" message
4. ✅ Message includes alternative options and back button

### Test 2: Feature Enabled (No hCaptcha Key)

```bash
# .env.local
NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=  # Empty or missing
```

**Expected Behavior**:
1. ❌ No "Forgot Password?" link on login page (missing config)
2. ❌ Direct access shows "Feature Temporarily Unavailable"

### Test 3: Feature Fully Configured

```bash
# .env.local
NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=10000000-ffff-ffff-ffff-000000000001
NEXT_PUBLIC_API_URL=http://localhost:4000
```

**Expected Behavior**:
1. ✅ "Forgot Password?" link appears on login page
2. ✅ `/forgot-password` page loads with hCaptcha
3. ✅ Users can request password reset
4. ✅ Email sent with reset link
5. ✅ `/reset-password?token=...` allows password change

---

## Environment Configuration Reference

### Development

```bash
# frontend/.env.local (Development)
NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=10000000-ffff-ffff-ffff-000000000001  # hCaptcha test key
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Staging

```bash
# frontend/.env.staging
NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=your_staging_site_key
NEXT_PUBLIC_API_URL=https://staging-api.meeshy.com
```

### Production

```bash
# frontend/.env.production
NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=your_production_site_key
NEXT_PUBLIC_API_URL=https://api.meeshy.com
```

---

## Adding New Feature Flags

### Step 1: Update Hook

Edit `/hooks/use-feature-flags.ts`:

```typescript
interface FeatureFlags {
  passwordReset: boolean;
  videoCall: boolean;  // NEW FEATURE
}

export function useFeatureFlags() {
  const flags: FeatureFlags = {
    passwordReset: process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET === 'true',
    videoCall: process.env.NEXT_PUBLIC_ENABLE_VIDEO_CALL === 'true',  // NEW
  };

  // Add custom validation if needed
  const isVideoCallConfigured = (): boolean => {
    if (!flags.videoCall) return false;
    return !!process.env.NEXT_PUBLIC_WEBRTC_CONFIG;
  };

  return { flags, isFeatureEnabled, isVideoCallConfigured };
}
```

### Step 2: Add Environment Variable

Edit `.env.example`:

```bash
# Video Call Feature
NEXT_PUBLIC_ENABLE_VIDEO_CALL=false
NEXT_PUBLIC_WEBRTC_CONFIG=...
```

### Step 3: Use in Components

```typescript
import { useFeatureFlags } from '@/hooks/use-feature-flags';

function ChatComponent() {
  const { isFeatureEnabled } = useFeatureFlags();

  return (
    <>
      {isFeatureEnabled('videoCall') && (
        <VideoCallButton />
      )}
    </>
  );
}
```

---

## Troubleshooting

### Problem: "Forgot Password?" link not showing

**Solution**: Check these in order:

1. ✅ `NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true` in `.env.local`
2. ✅ `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` is set
3. ✅ `NEXT_PUBLIC_API_URL` is set
4. ✅ Restart dev server (`pnpm dev`)
5. ✅ Clear browser cache

### Problem: "Feature Temporarily Unavailable" message

**This is expected** when feature is disabled or not configured.

**To fix**:
```bash
# Add to .env.local
NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=your_key
```

### Problem: hCaptcha not loading

**Solution**:
1. ✅ Check site key is correct
2. ✅ Check network tab for CORS errors
3. ✅ Try hCaptcha test key: `10000000-ffff-ffff-ffff-000000000001`

---

## Security Considerations

### Environment Variables

- ✅ `NEXT_PUBLIC_*` variables are **exposed to the browser**
- ✅ Never put secrets in `NEXT_PUBLIC_*` variables
- ✅ Backend secrets stay in backend `.env` (not public)

### Feature Flags

- ✅ Feature flags are **not security measures**
- ✅ Users can see code for disabled features
- ✅ Backend must always validate permissions
- ✅ Feature flags control **UI visibility only**

---

## Best Practices

### 1. Default to Disabled

New features should default to `false`:

```bash
# .env.example
NEXT_PUBLIC_ENABLE_NEW_FEATURE=false  # Default: off
```

### 2. Document Requirements

Always document what's needed for a feature:

```bash
# New Feature (Requires backend v2.3.0+)
NEXT_PUBLIC_ENABLE_NEW_FEATURE=false
NEXT_PUBLIC_NEW_FEATURE_API_KEY=...
```

### 3. Graceful Degradation

Always show user-friendly messages:

```typescript
<FeatureGate feature="myFeature" showMessage={true}>
  <MyFeature />
</FeatureGate>
```

### 4. Test Both States

Always test:
- ✅ Feature enabled
- ✅ Feature disabled
- ✅ Feature partially configured

---

## Summary

Feature flags allow safe, gradual rollout of new features:

- ✅ **Password Reset**: Controlled via `NEXT_PUBLIC_ENABLE_PASSWORD_RESET`
- ✅ **No Code Changes**: Toggle features via environment variables
- ✅ **User-Friendly**: Shows helpful messages when features are disabled
- ✅ **Zero Errors**: Graceful degradation with proper error handling
- ✅ **Easy to Add**: Simple pattern for new features

**Current Status**: Password reset feature flag implemented and ready to use.

---

## Quick Reference

| Environment Variable | Default | Purpose |
|---------------------|---------|---------|
| `NEXT_PUBLIC_ENABLE_PASSWORD_RESET` | `false` | Enable/disable password reset UI |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` | (none) | hCaptcha site key for bot protection |
| `NEXT_PUBLIC_API_URL` | (none) | Backend API endpoint |

---

**Need Help?** Contact the development team or check the main documentation at `/PASSWORD_RESET_COMPLETE.md`.
