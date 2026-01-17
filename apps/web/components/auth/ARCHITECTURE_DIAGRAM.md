# Register Form Wizard - Architecture Diagram

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    RegisterFormWizard                            │
│                     (Main Orchestrator)                          │
│                        400 lines                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ uses
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       Custom Hooks                               │
├─────────────────────────────────────────────────────────────────┤
│  • useRegistrationWizard (180 lines)                            │
│    - Wizard state & navigation                                   │
│    - Form data management                                        │
│    - localStorage persistence                                    │
│                                                                  │
│  • useRegistrationValidation (220 lines)                        │
│    - Email/phone/username checks                                 │
│    - Real-time validation                                        │
│    - Existing account detection                                  │
│                                                                  │
│  • useRegistrationSubmit (250 lines)                            │
│    - Form submission logic                                       │
│    - API error handling                                          │
│    - Phone transfer resolution                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ renders
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Step Components                             │
│                   (Dynamically Imported)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │  ContactStep   │  │  IdentityStep  │  │ UsernameStep   │   │
│  │   140 lines    │  │   80 lines     │  │  150 lines     │   │
│  │                │  │                │  │                │   │
│  │ • Email input  │  │ • First name   │  │ • Username     │   │
│  │ • Phone input  │  │ • Last name    │  │ • Suggestions  │   │
│  │ • Validation   │  │ • Validation   │  │ • Availability │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐                        │
│  │ SecurityStep   │  │ PreferencesStep│                        │
│  │  140 lines     │  │  120 lines     │                        │
│  │                │  │                │                        │
│  │ • Password     │  │ • System lang  │                        │
│  │ • Confirm      │  │ • Regional lng │                        │
│  │ • Strength     │  │ • Terms accept │                        │
│  └────────────────┘  └────────────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ uses
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     UI Components                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  • WizardProgress (60 lines)                                    │
│    - Progress indicator                                          │
│    - Step navigation                                             │
│                                                                  │
│  • ExistingAccountAlert (70 lines)                              │
│    - Account exists warning                                      │
│    - Recovery options                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                          User Input                               │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                      Step Component                               │
│         (ContactStep, IdentityStep, etc.)                        │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ↓ onChange
┌──────────────────────────────────────────────────────────────────┐
│                  useRegistrationWizard                            │
│                    updateFormData()                               │
└──────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ↓                   ↓
┌──────────────────────────┐  ┌───────────────────────────────────┐
│     State Update         │  │      localStorage                 │
│   formData = {...}       │  │  Save form data (no password)     │
└──────────────────────────┘  └───────────────────────────────────┘
                    │
                    ↓
┌──────────────────────────────────────────────────────────────────┐
│              useRegistrationValidation                            │
│           Check email/phone/username                              │
└──────────────────────────────────────────────────────────────────┘
                    │
                    ↓ API call
┌──────────────────────────────────────────────────────────────────┐
│                    Backend API                                    │
│        /auth/check-availability                                   │
└──────────────────────────────────────────────────────────────────┘
                    │
                    ↓ Response
┌──────────────────────────────────────────────────────────────────┐
│              Validation State Update                              │
│  emailValidationStatus = 'valid' | 'exists' | 'invalid'          │
└──────────────────────────────────────────────────────────────────┘
                    │
                    ↓
┌──────────────────────────────────────────────────────────────────┐
│                   UI Update                                       │
│   Show checkmark, error, or warning                               │
└──────────────────────────────────────────────────────────────────┘
```

## Submission Flow

```
User clicks "Create Account"
         │
         ↓
┌──────────────────────────────────────────────────────────────────┐
│               handleFormSubmit()                                  │
│   Validate all fields + bot protection                            │
└──────────────────────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────────────┐
│          useRegistrationSubmit                                    │
│            submitRegistration()                                   │
└──────────────────────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────────────┐
│              performRegistration()                                │
│   POST /auth/register with form data                              │
└──────────────────────────────────────────────────────────────────┘
         │
         ├─── Success ────→ completeRegistrationAndRedirect()
         │                      │
         │                      ├─→ login(user, token)
         │                      ├─→ Handle affiliate
         │                      ├─→ Clear localStorage
         │                      └─→ Redirect to /dashboard
         │
         └─── Phone Conflict ──→ Show PhoneExistsModal
                                    │
                                    ├─→ Continue without phone
                                    └─→ Transfer phone ownership
```

## Code Splitting Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    Initial Bundle Load                           │
│                        ~180KB                                    │
├─────────────────────────────────────────────────────────────────┤
│  • RegisterFormWizard (main)           120KB                    │
│  • useRegistrationWizard               15KB                     │
│  • useRegistrationValidation           20KB                     │
│  • useRegistrationSubmit               25KB                     │
│  • WizardProgress                      5KB                      │
│  • ExistingAccountAlert                5KB                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ User navigates to step
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   On-Demand Chunks                               │
├─────────────────────────────────────────────────────────────────┤
│  Step 1: ContactStep.chunk.js          ~45KB                    │
│  Step 2: IdentityStep.chunk.js         ~25KB                    │
│  Step 3: UsernameStep.chunk.js         ~50KB                    │
│  Step 4: SecurityStep.chunk.js         ~35KB                    │
│  Step 5: PreferencesStep.chunk.js      ~40KB                    │
└─────────────────────────────────────────────────────────────────┘

Total if all loaded: ~375KB
User typically loads: ~180KB + 2-3 steps = ~260KB (vs 420KB before)
Savings: ~160KB (38% reduction)
```

## State Management

```
┌─────────────────────────────────────────────────────────────────┐
│                useRegistrationWizard State                       │
├─────────────────────────────────────────────────────────────────┤
│  currentStep: number                                             │
│  direction: 1 | -1                                               │
│  formData: {                                                     │
│    username: string                                              │
│    password: string                                              │
│    firstName: string                                             │
│    lastName: string                                              │
│    email: string                                                 │
│    phoneNumber: string                                           │
│    systemLanguage: string                                        │
│    regionalLanguage: string                                      │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓ Synced to
┌─────────────────────────────────────────────────────────────────┐
│                     localStorage                                 │
│   Key: 'meeshy_signup_wizard_temp_data'                         │
│   Value: formData (excluding password)                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│            useRegistrationValidation State                       │
├─────────────────────────────────────────────────────────────────┤
│  usernameCheckStatus: ValidationStatus                           │
│  usernameSuggestions: string[]                                   │
│  emailValidationStatus: ValidationStatus                         │
│  emailErrorMessage: string                                       │
│  phoneValidationStatus: ValidationStatus                         │
│  phoneErrorMessage: string                                       │
│  existingAccount: ExistingAccountInfo | null                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              useRegistrationSubmit State                         │
├─────────────────────────────────────────────────────────────────┤
│  isLoading: boolean                                              │
│  showPhoneExistsModal: boolean                                   │
│  phoneOwnerInfo: PhoneOwnerInfo | null                           │
│  pendingRegistration: PendingRegistration | null                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                 Component Local State                            │
├─────────────────────────────────────────────────────────────────┤
│  confirmPassword: string                                         │
│  acceptTerms: boolean                                            │
│  showPassword: boolean                                           │
│  selectedCountry: CountryCode                                    │
│  showRecoveryModal: boolean                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Performance Optimizations

```
1. Memoization
   ├─ useCallback for all event handlers
   ├─ useMemo for derived values
   └─ React.memo for child components

2. Code Splitting
   ├─ Dynamic imports with next/dynamic
   ├─ Step components loaded on demand
   └─ Loading states during chunk fetch

3. Debouncing
   ├─ Email validation (300ms)
   ├─ Username availability (300ms)
   └─ Phone validation (300ms)

4. Lazy Evaluation
   ├─ Validation only on current step
   ├─ API calls only when needed
   └─ Form submission validation deferred

5. Bundle Optimization
   ├─ Tree-shaking friendly exports
   ├─ Minimal dependencies
   └─ Shared utilities extracted
```

## Testing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Unit Tests                                │
├─────────────────────────────────────────────────────────────────┤
│  • useRegistrationWizard.test.ts                                │
│    - Navigation logic                                            │
│    - State management                                            │
│    - localStorage persistence                                    │
│                                                                  │
│  • useRegistrationValidation.test.ts                            │
│    - Email/phone validation                                      │
│    - Username availability                                       │
│    - Suggestion generation                                       │
│                                                                  │
│  • useRegistrationSubmit.test.ts                                │
│    - Form submission                                             │
│    - Error handling                                              │
│    - Phone conflict resolution                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Component Tests                                │
├─────────────────────────────────────────────────────────────────┤
│  • ContactStep.test.tsx                                          │
│  • IdentityStep.test.tsx                                         │
│  • UsernameStep.test.tsx                                         │
│  • SecurityStep.test.tsx                                         │
│  • PreferencesStep.test.tsx                                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  Integration Tests                               │
├─────────────────────────────────────────────────────────────────┤
│  • register-form-wizard.test.tsx                                │
│    - Full wizard flow                                            │
│    - Step transitions                                            │
│    - Form validation                                             │
│    - Submission flow                                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      E2E Tests                                   │
├─────────────────────────────────────────────────────────────────┤
│  • registration.spec.ts (Playwright/Cypress)                     │
│    - Complete user journey                                       │
│    - Error scenarios                                             │
│    - Edge cases                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
User Input Error
      │
      ↓
Validation Hook
      │
      ├─→ Email invalid ──→ Show inline error message
      ├─→ Phone invalid ──→ Show inline error message
      └─→ Username taken ─→ Show suggestions

API Error
      │
      ↓
Submission Hook
      │
      ├─→ Network error ────→ Toast notification
      ├─→ Validation error ─→ Toast + focus field
      ├─→ Phone conflict ───→ PhoneExistsModal
      └─→ Server error ─────→ Toast + retry option

State Error
      │
      ↓
Error Boundary
      │
      └─→ Fallback UI with recovery options
```

## Key Design Decisions

1. **Hook-based architecture**: Separates concerns, improves testability
2. **Dynamic imports**: Reduces initial bundle size
3. **Local state + localStorage**: Fast UX + persistence
4. **Backward compatibility**: No breaking changes
5. **Progressive enhancement**: Works without JS, better with it
6. **Type safety**: TypeScript throughout
7. **Accessibility**: WCAG 2.1 AA compliance
8. **Mobile-first**: Responsive design

---

**Legend**
- `→` Data flow
- `├─` Branch/Option
- `└─` End branch
- `↓` Sequential step
