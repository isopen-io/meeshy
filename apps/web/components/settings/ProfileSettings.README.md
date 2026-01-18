# ProfileSettings Component

## Overview

`ProfileSettings` is a comprehensive account management component that provides users with advanced settings to manage their Meeshy account, including email, username, password changes, and account deletion.

## Features

### 1. Change Email
- **Two-step verification process**
  - Step 1: Request email change by entering new email
  - Step 2: Verify with 6-digit code sent to new email
- **Email validation**: Checks for proper email format
- **Optimistic UI updates**: Immediate feedback on success
- **Error handling**: Clear error messages for all failure scenarios

### 2. Change Username
- **Real-time username availability check**
  - Debounced API calls (500ms delay)
  - Visual indicators (checkmark for available, warning for taken)
- **Unique username validation**: Ensures no duplicates
- **Optimistic updates**: Automatic page reload after successful change
- **Accessibility**: Proper ARIA labels and keyboard navigation

### 3. Change Password
- **Secure password change flow**:
  - Current password verification
  - New password with confirmation
  - Toggle visibility for all password fields
- **Validation**:
  - Minimum 6 characters
  - Passwords must match
  - New password must differ from current
- **Sound feedback**: Uses `SoundFeedback` for toggle interactions
- **Auto-complete support**: Proper `autoComplete` attributes

### 4. Delete Account
- **Double confirmation dialog**:
  - First dialog: Enter password
  - Second dialog: Type "DELETE" to confirm
- **Warning system**: Clear visual warnings about consequences
  - Permanent message deletion
  - Profile removal
  - Immediate logout
  - Irreversible action
- **Secure deletion**: Requires password verification
- **Callback support**: Optional `onAccountDeleted` callback

## API Endpoints

The component uses the following API endpoints:

```typescript
// Email Change
POST /api/v1/auth/me/email/request
POST /api/v1/auth/me/email/verify

// Username Change
GET  /api/v1/auth/check-username?username={username}
PATCH /api/v1/auth/me

// Password Change
POST /api/v1/auth/change-password

// Account Deletion
DELETE /api/v1/auth/me
```

## Props

```typescript
interface ProfileSettingsProps {
  onAccountDeleted?: () => void;  // Optional callback after successful account deletion
}
```

## Usage

```tsx
import { ProfileSettings } from '@/components/settings/ProfileSettings';

function SettingsPage() {
  const handleAccountDeleted = () => {
    // Optional: Redirect to homepage or show a message
    console.log('Account deleted successfully');
  };

  return (
    <div>
      <ProfileSettings onAccountDeleted={handleAccountDeleted} />
    </div>
  );
}
```

## Internationalization (i18n)

The component is fully internationalized using the `useI18n` hook with the `settings` namespace. All text content comes from translation files:

- `/locales/en/settings.json`
- `/locales/fr/settings.json`

### Translation Keys Structure

```json
{
  "settings": {
    "profile": {
      "account": {
        "email": { /* Email change translations */ },
        "username": { /* Username change translations */ },
        "delete": { /* Account deletion translations */ }
      }
    },
    "security": {
      "password": { /* Password change translations */ }
    }
  }
}
```

## Accessibility

- **ARIA Labels**: All interactive elements have proper `aria-label` attributes
- **Keyboard Navigation**: Full keyboard support with `Tab` and `Enter`
- **Focus Management**: Proper focus indicators with `focus-visible:ring-2`
- **Screen Reader Support**:
  - `aria-pressed` for password toggle buttons
  - Descriptive labels for all form fields
- **Error Announcements**: Toast notifications for screen readers
- **Sound Feedback**: Optional audio cues for toggle interactions

## Security Features

1. **Password Visibility Toggle**: Users can show/hide password fields
2. **Double Confirmation**: Account deletion requires two confirmation steps
3. **Password Verification**: Critical actions require password re-entry
4. **Auto-complete Attributes**: Proper `autoComplete` for password managers
5. **HTTPS Only**: All API calls use secure connections via `buildApiUrl`

## State Management

The component uses local state (React hooks) for:
- Form data for each section
- Loading states for async operations
- UI state (dialog visibility, password visibility)
- Validation states (username availability, email verification step)

## Error Handling

All API calls include comprehensive error handling:
- Network errors
- Validation errors
- Server errors
- User feedback via toast notifications
- Console logging for debugging

## Responsive Design

The component is fully responsive:
- Mobile-first approach
- Flexible layouts with `sm:` breakpoints
- Touch-friendly button sizes
- Adaptive spacing and typography

## Dependencies

```typescript
// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, ... } from '@/components/ui/alert-dialog';

// Hooks
import { useI18n } from '@/hooks/use-i18n';
import { useAuth } from '@/hooks/use-auth';

// Icons (lucide-react)
import { Mail, User, Lock, Trash2, Eye, EyeOff, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Utilities
import { toast } from 'sonner';
import { SoundFeedback } from '@/hooks/use-accessibility';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
```

## Code Quality

- **TypeScript**: Fully typed with proper interfaces
- **Clean Code**: Separated concerns with dedicated functions
- **Comments**: Clear inline documentation
- **Error Handling**: Comprehensive try/catch blocks
- **Loading States**: Proper UX with loading indicators
- **Validation**: Client-side and server-side validation

## Best Practices

1. **Debouncing**: Username availability check is debounced (500ms)
2. **Optimistic Updates**: Immediate UI feedback before API confirmation
3. **Progressive Enhancement**: Works without JavaScript (form submission)
4. **Semantic HTML**: Proper form structure with labels and inputs
5. **Error Recovery**: Clear error messages with recovery suggestions
6. **User Confirmation**: Critical actions require explicit confirmation

## Testing Checklist

- [ ] Email change flow (request + verification)
- [ ] Username availability check with valid/invalid names
- [ ] Password change with all validation cases
- [ ] Account deletion with both confirmation dialogs
- [ ] Error handling for network failures
- [ ] Responsive layout on mobile/tablet/desktop
- [ ] Accessibility with keyboard navigation
- [ ] i18n with English and French languages

## Future Enhancements

1. **Email verification**: Real-time email format validation
2. **Password strength meter**: Visual indicator for password strength
3. **Username suggestions**: Auto-suggest available usernames
4. **Export data**: Option to download user data before deletion
5. **2FA integration**: Two-factor authentication for sensitive operations
6. **Audit log**: Show history of account changes

## Related Components

- `UserSettings.tsx` - Personal information settings
- `PasswordSettings.tsx` - Standalone password change component
- `PrivacySettings.tsx` - Privacy and data management
- `EncryptionSettings.tsx` - E2EE configuration

## File Location

```
/apps/web/components/settings/ProfileSettings.tsx
```

## Last Updated

January 18, 2026
