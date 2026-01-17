# RegisterForm - Architecture Refactorisée

## Vue d'ensemble

Le formulaire d'inscription a été refactorisé de **816 lignes** en **~400 lignes** réparties sur plusieurs fichiers modulaires pour améliorer la maintenabilité, la testabilité et les performances.

## Structure

```
apps/web/
├── components/auth/
│   ├── register-form.tsx (18 lignes - Point d'entrée)
│   └── register-form/
│       ├── index.tsx (128 lignes - Orchestration principale)
│       ├── FormField.tsx (128 lignes - Composant réutilisable)
│       ├── PasswordField.tsx (65 lignes)
│       ├── EmailField.tsx (58 lignes)
│       ├── PhoneField.tsx (61 lignes)
│       ├── UsernameField.tsx (54 lignes)
│       ├── PersonalInfoStep.tsx (51 lignes)
│       ├── LanguageSelector.tsx (53 lignes)
│       └── FormFooter.tsx (39 lignes)
└── hooks/
    ├── use-register-form.ts (270 lignes - Logique métier)
    └── use-field-validation.ts (134 lignes - Validation)
```

## Composants

### 1. **FormField** (Composant de base réutilisable)
- Champ de formulaire générique avec validation
- Support des états: idle, checking, valid, invalid, taken, available
- Indicateurs visuels (Check, X, AlertCircle, Spinner)
- Messages d'erreur et de succès personnalisables
- Texte d'aide optionnel

### 2. **Field Components** (Champs spécialisés)
Chaque champ encapsule sa propre logique:
- **EmailField**: Validation format + disponibilité
- **PhoneField**: Formatage + validation + disponibilité
- **UsernameField**: Filtrage caractères + validation + disponibilité
- **PasswordField**: Toggle show/hide password
- **PersonalInfoStep**: Prénom + Nom

### 3. **LanguageSelectorField**
Wrapper pour les sélecteurs de langue système/régionale

### 4. **FormFooter**
Bouton de soumission et liens de navigation

## Hooks

### `use-register-form.ts`
**Responsabilités:**
- Gestion de l'état du formulaire
- Validation des données
- Soumission au backend
- Bot protection (honeypot)
- Gestion des tokens d'affiliation
- Redirection après succès

**API:**
```typescript
const {
  formData,
  updateFormData,
  isLoading,
  showPassword,
  togglePasswordVisibility,
  honeypotProps,
  handleSubmit,
} = useRegisterForm({ onSuccess, linkId, onJoinSuccess });
```

### `use-field-validation.ts`
**Responsabilités:**
- Validation de format (email, téléphone, username)
- Vérification de disponibilité (debounced 2s)
- Gestion des états de validation
- Messages d'erreur localisés

**API:**
```typescript
const {
  status,        // ValidationStatus
  errorMessage,  // string
  validate,      // (value: string) => void
} = useFieldValidation({ value, disabled, t, type });
```

## Optimisations

### 1. **Code Splitting**
- Tous les field components sont lazy-loaded avec `React.lazy()`
- Suspense avec fallback pour améliorer l'UX
- Réduction du bundle initial

### 2. **Debouncing**
- Validation de disponibilité débounced à 2 secondes
- Évite les requêtes réseau inutiles

### 3. **Dynamic Imports**
- `phone-validator` importé dynamiquement seulement quand nécessaire
- Réduit la taille du bundle principal

### 4. **Shared State**
- `useAuthFormStore` pour synchroniser email/téléphone entre login et register
- Évite la duplication de code

## Validation

### Types de validation supportés:
1. **Format** (temps réel)
   - Email: RFC 5322 compliant
   - Téléphone: Format international
   - Username: 2-16 caractères, alphanumeric + `-_`

2. **Disponibilité** (debounced)
   - Vérifie l'unicité via API
   - Indicateur visuel en temps réel

3. **Bot Protection**
   - Honeypot field
   - Temps minimum de soumission (3s)

## API Props

### RegisterForm
```typescript
interface RegisterFormProps {
  onSuccess?: (user: User, token: string) => void;
  disabled?: boolean;
  linkId?: string; // Mode invitation link
  onJoinSuccess?: (data: JoinConversationResponse) => void;
  formPrefix?: string; // Pour IDs uniques
}
```

## Mode d'utilisation

### Mode normal (inscription standard)
```tsx
<RegisterForm onSuccess={(user, token) => {
  // Callback personnalisé
}} />
```

### Mode lien d'invitation
```tsx
<RegisterForm
  linkId="abc123"
  onJoinSuccess={(data) => {
    // Callback pour rejoindre conversation
  }}
/>
```

## Tests

Chaque composant peut être testé indépendamment:
- **Hooks**: Tests unitaires isolés
- **Components**: Tests de rendu et interaction
- **Integration**: Tests end-to-end du formulaire complet

## Performance

### Avant refactorisation:
- **1 fichier**: 816 lignes
- **Bundle**: Monolithique
- **Validation**: Logique mélangée

### Après refactorisation:
- **12 fichiers**: ~1,041 lignes total (meilleure séparation)
- **Bundle**: Code-split avec lazy loading
- **Validation**: Hooks réutilisables
- **Maintenabilité**: ⬆️⬆️⬆️

## Migration

L'API publique reste **100% compatible**:
```typescript
// Avant et après - même usage
import { RegisterForm } from '@/components/auth/register-form';
```

Aucune modification nécessaire dans le code consommateur.
