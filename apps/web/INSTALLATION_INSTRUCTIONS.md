# Password Reset Feature - Installation Instructions

## Quick Start

Follow these steps to complete the password reset feature installation:

### Step 1: Install Dependencies

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/frontend
pnpm add zxcvbn @types/zxcvbn
```

**Note**: hCaptcha does not require an npm package. It's loaded via CDN script tag in the components.

### Step 2: Add Environment Variables

Create or update `.env.local` in the frontend directory:

```bash
# Add this line
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=your_hcaptcha_site_key_here
```

**Get your hCaptcha keys**:
1. Visit https://www.hcaptcha.com/
2. Sign up for a free account
3. Create a new site
4. Copy the **Site Key** to `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`
5. Copy the **Secret Key** for backend configuration (gateway/.env)

### Step 3: Add Missing Translations

The English translations are complete. You need to translate to Spanish, French, and Portuguese:

**Files to update**:
- `/frontend/locales/es/auth.json`
- `/frontend/locales/fr/auth.json`
- `/frontend/locales/pt/auth.json`

**What to add**: Copy the structure from `/frontend/locales/en/auth.json` lines 160-273 and translate:
- `forgotPassword` section
- `checkEmail` section
- `resetPassword` section
- `login.forgotPassword` key

### Step 4: Test the Implementation

```bash
# Start development server
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/frontend
pnpm dev
```

**Test URLs**:
- http://localhost:3100/login (check "Forgot Password?" link)
- http://localhost:3100/forgot-password
- http://localhost:3100/forgot-password/check-email
- http://localhost:3100/reset-password?token=test

### Step 5: Verify Backend Integration

Ensure your backend (gateway) has these endpoints implemented:
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-reset-token` (optional, improves UX)

Refer to:
- `/gateway/SECURE_PASSWORD_RESET_ARCHITECTURE.md`
- `/gateway/IMPLEMENTATION_GUIDE.md`

---

## Complete File List

### New Files Created

✅ **Services**
- `/frontend/services/password-reset.service.ts`

✅ **State Management**
- `/frontend/stores/password-reset-store.ts`

✅ **Components**
- `/frontend/components/auth/PasswordStrengthMeter.tsx`
- `/frontend/components/auth/PasswordRequirementsChecklist.tsx`
- `/frontend/components/auth/ForgotPasswordForm.tsx`
- `/frontend/components/auth/ResetPasswordForm.tsx`

✅ **Pages**
- `/frontend/app/forgot-password/page.tsx`
- `/frontend/app/forgot-password/check-email/page.tsx`
- `/frontend/app/reset-password/page.tsx`

✅ **Documentation**
- `/frontend/PASSWORD_RESET_IMPLEMENTATION.md`
- `/frontend/INSTALLATION_INSTRUCTIONS.md` (this file)

### Modified Files

✅ **Components**
- `/frontend/components/auth/login-form.tsx` (added "Forgot Password?" link)

✅ **Translations**
- `/frontend/locales/en/auth.json` (added password reset translations)

---

## Deployment Checklist

Before deploying to production:

- [ ] Install dependencies (`pnpm add zxcvbn @types/zxcvbn`)
- [ ] Add `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` to production environment
- [ ] Translate to ES, FR, PT languages
- [ ] Backend API endpoints implemented and tested
- [ ] Email service configured in backend
- [ ] Test complete flow end-to-end
- [ ] Test on mobile devices
- [ ] Test with screen reader
- [ ] Verify CAPTCHA works in production
- [ ] Verify emails are being sent
- [ ] Test token expiry (15 minutes)

---

## Need Help?

- **Architecture Reference**: `/gateway/SECURE_PASSWORD_RESET_ARCHITECTURE.md`
- **Backend Guide**: `/gateway/IMPLEMENTATION_GUIDE.md`
- **Frontend Implementation**: `/frontend/PASSWORD_RESET_IMPLEMENTATION.md`

---

## Next Steps

1. Run the installation commands above
2. Get hCaptcha keys
3. Add translations
4. Test locally
5. Coordinate with backend team for API integration
6. Deploy to staging for testing
7. Deploy to production

Good luck! 🚀
