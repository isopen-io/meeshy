# Account Recovery Components

Composants pour le flow de récupération de compte (email et téléphone).

## Structure

```
recovery/
├── OTPInput.tsx              # Composant d'input OTP 6 digits
├── RecoveryChoiceStep.tsx    # Choix méthode (email/phone)
├── EmailRecoveryStep.tsx     # Recovery via Magic Link
├── PhoneRecoveryStep.tsx     # Lookup par numéro
├── PhoneIdentityStep.tsx     # Vérification identité
├── PhoneCodeStep.tsx         # Vérification code OTP
├── SuccessStep.tsx           # Écran succès
└── index.ts                  # Exports
```

## Hooks Associés

```typescript
// Gestion du flow
import { useRecoveryFlow } from '@/hooks/use-recovery-flow';

// Validation
import { useRecoveryValidation } from '@/hooks/use-recovery-validation';

// Soumissions API
import { useRecoverySubmission } from '@/hooks/use-recovery-submission';
```

## Utilisation

Les composants sont utilisés par `AccountRecoveryModal`:

```typescript
import { AccountRecoveryModal } from '@/components/auth/account-recovery-modal';

<AccountRecoveryModal
  isOpen={isOpen}
  onClose={onClose}
  existingAccount={existingAccount}
  email={email}
  phone={phone}
  conflictType={conflictType}
/>
```

## Components

### OTPInput

Input pour code OTP à 6 chiffres avec animations.

**Props:**
- `value: string` - Code actuel
- `onChange: (value: string) => void` - Callback changement
- `disabled?: boolean` - État désactivé
- `id?: string` - ID HTML du groupe

**Features:**
- Navigation automatique entre inputs
- Support paste
- Animations Framer Motion
- Accessibility (ARIA labels)

### RecoveryChoiceStep

Écran de choix de la méthode de récupération.

**Props:**
- `existingAccount: ExistingAccountInfo | null` - Info compte existant
- `onEmailChoice: () => void` - Callback choix email
- `onPhoneChoice: () => void` - Callback choix phone
- `onLogin: () => void` - Callback vers login
- `t: (key: string) => string | undefined` - Fonction i18n

**Features:**
- Affichage avatar et infos compte masqué
- Animations d'entrée
- Options email/phone/login

### EmailRecoveryStep

Formulaire de récupération par email (Magic Link).

**Props:**
- `email: string` - Email actuel
- `onEmailChange: (email: string) => void` - Callback changement
- `onSubmit: () => void` - Callback soumission
- `onBack: () => void` - Callback retour
- `isLoading: boolean` - État chargement
- `error: string | null` - Message d'erreur
- `honeypotProps: any` - Props bot protection
- `t: (key: string) => string | undefined` - Fonction i18n

### PhoneRecoveryStep

Formulaire de récupération par téléphone.

**Props:**
- `phone: string` - Numéro actuel
- `selectedCountry: CountryCode` - Pays sélectionné
- `onPhoneChange: (phone: string) => void` - Callback changement
- `onCountryChange: (country: CountryCode) => void` - Callback pays
- `onSubmit: () => void` - Callback soumission
- `onBack: () => void` - Callback retour
- `isLoading: boolean` - État chargement
- `error: string | null` - Message d'erreur
- `t: (key: string) => string | undefined` - Fonction i18n

**Features:**
- Sélecteur de pays avec drapeaux
- Validation format téléphone
- Support international

### PhoneIdentityStep

Vérification d'identité (username + email).

**Props:**
- `username: string` - Username actuel
- `email: string` - Email actuel
- `onUsernameChange: (username: string) => void` - Callback username
- `onEmailChange: (email: string) => void` - Callback email
- `onSubmit: () => void` - Callback soumission
- `onBack: () => void` - Callback retour
- `isLoading: boolean` - État chargement
- `error: string | null` - Message d'erreur
- `t: (key: string) => string | undefined` - Fonction i18n

### PhoneCodeStep

Vérification du code OTP reçu par SMS.

**Props:**
- `code: string` - Code actuel
- `onCodeChange: (code: string) => void` - Callback changement
- `onSubmit: () => void` - Callback soumission
- `onBack: () => void` - Callback retour
- `onResend: () => void` - Callback renvoi code
- `isLoading: boolean` - État chargement
- `error: string | null` - Message d'erreur
- `resendCooldown: number` - Cooldown renvoi (secondes)
- `t: (key: string) => string | undefined` - Fonction i18n

**Features:**
- OTPInput intégré
- Bouton renvoi avec cooldown
- Gestion erreurs token expiré

### SuccessStep

Écran de succès après envoi Magic Link.

**Props:**
- `onClose: () => void` - Callback fermeture
- `onNavigateToLogin: () => void` - Callback vers login
- `t: (key: string) => string | undefined` - Fonction i18n

## Animations

Tous les steps utilisent Framer Motion avec:
- Transitions slide horizontales
- Animations d'entrée pour éléments
- Spring animations pour icônes

## Accessibility

- Labels ARIA appropriés
- Navigation clavier complète
- Focus management
- Screen reader support
- Semantic HTML

## i18n

Toutes les traductions utilisent le namespace `auth`:

```typescript
const { t } = useI18n('auth');

t('register.wizard.accountFound')
t('phoneReset.errors.invalidPhone')
t('magicLink.success.title')
// etc.
```

## Styling

- Tailwind CSS
- Dark mode support
- Gradients et animations
- Responsive design
