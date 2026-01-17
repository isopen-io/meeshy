# Migration Guide - RegisterForm Refactorisation

## Pour les développeurs utilisant RegisterForm

### Aucune modification nécessaire

L'API publique du composant `RegisterForm` reste **100% compatible**. Si vous utilisez déjà ce composant, **aucune modification n'est nécessaire**.

```typescript
// ✅ Ce code continue de fonctionner exactement comme avant
import { RegisterForm } from '@/components/auth/register-form';

function MyComponent() {
  return (
    <RegisterForm
      onSuccess={(user, token) => {
        // Votre logique
      }}
      disabled={false}
      linkId="optional"
      onJoinSuccess={(data) => {
        // Votre logique
      }}
      formPrefix="register"
    />
  );
}
```

## Pour les développeurs contribuant au code

### Structure des fichiers

La refactorisation a déplacé le code dans plusieurs fichiers:

```
apps/web/components/auth/
├── register-form.tsx          ← Point d'entrée (barrel export)
└── register-form/
    ├── index.tsx              ← Formulaire principal avec Suspense
    ├── FormField.tsx          ← Composant réutilisable
    ├── PasswordField.tsx
    ├── EmailField.tsx
    ├── PhoneField.tsx
    ├── UsernameField.tsx
    ├── PersonalInfoStep.tsx
    ├── LanguageSelector.tsx
    └── FormFooter.tsx
```

### Hooks extraits

```
apps/web/hooks/
├── use-register-form.ts       ← Logique métier + soumission
└── use-field-validation.ts    ← Validation + disponibilité
```

### Comment modifier un champ

#### Avant (fichier monolithique)
```typescript
// Chercher dans 816 lignes de register-form.tsx
<Input
  id="email"
  type="email"
  value={formData.email}
  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
  // ... 20 autres props
/>
```

#### Après (fichier dédié)
```typescript
// Modifier uniquement EmailField.tsx (58 lignes)
export function EmailField({ value, onChange, disabled, formPrefix, t }) {
  const { status, errorMessage, validate } = useFieldValidation({
    value,
    disabled,
    t,
    type: 'email',
  });

  // Logique spécifique à l'email
}
```

### Comment ajouter un nouveau champ

1. **Créer le composant**
```typescript
// apps/web/components/auth/register-form/MyNewField.tsx
'use client';

import { FormField } from './FormField';

export function MyNewField({ value, onChange, disabled, formPrefix, t }) {
  return (
    <FormField
      id={`${formPrefix}-myField`}
      label={t('register.myFieldLabel')}
      value={value}
      onChange={onChange}
      disabled={disabled}
      // ... autres props
    />
  );
}
```

2. **Lazy load dans index.tsx**
```typescript
const MyNewField = lazy(() => import('./MyNewField').then(m => ({ default: m.MyNewField })));
```

3. **Ajouter au formulaire**
```typescript
<Suspense fallback={<LoadingFallback />}>
  <MyNewField
    value={formData.myField}
    onChange={(value) => updateFormData({ myField: value })}
    disabled={isLoading || disabled}
    formPrefix={formPrefix}
    t={t}
  />
</Suspense>
```

4. **Ajouter au type FormData**
```typescript
// apps/web/hooks/use-register-form.ts
export interface RegisterFormData {
  // ... champs existants
  myField: string; // Nouveau champ
}
```

### Comment ajouter de la validation

```typescript
// apps/web/hooks/use-field-validation.ts

// Ajouter un nouveau type
export type ValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'taken' | 'available';

// Utiliser dans votre composant
const { status, errorMessage, validate } = useFieldValidation({
  value: myValue,
  disabled,
  t,
  type: 'myNewType', // Ajouter votre type
});
```

### Tests

Chaque composant/hook peut maintenant être testé indépendamment:

```typescript
// __tests__/hooks/use-register-form.test.ts
describe('useRegisterForm', () => {
  it('should validate username format', () => {
    expect(validateUsername('john_doe')).toBe(true);
    expect(validateUsername('a')).toBe(false); // Too short
  });
});
```

```typescript
// __tests__/components/EmailField.test.tsx
describe('EmailField', () => {
  it('should show error for invalid email', () => {
    render(<EmailField value="invalid" onChange={...} />);
    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });
});
```

## Performance

### Code Splitting automatique

Tous les field components sont chargés dynamiquement:

```typescript
// Avant: Tout le code chargé immédiatement
// Après: Chaque field chargé à la demande
const EmailField = lazy(() => import('./EmailField'));
```

### Bundle analysis

Pour vérifier l'impact sur le bundle:

```bash
npm run build -- --analyze
```

## Checklist de migration

- [ ] Vérifier que tous les imports fonctionnent
- [ ] Tester le formulaire en mode normal
- [ ] Tester le formulaire en mode linkId
- [ ] Vérifier la validation email
- [ ] Vérifier la validation téléphone
- [ ] Vérifier la validation username
- [ ] Tester le bot protection
- [ ] Vérifier les messages d'erreur
- [ ] Tester la soumission réussie
- [ ] Vérifier la redirection après inscription
- [ ] Tester l'affiliation token

## Questions fréquentes

### Pourquoi lazy loading pour tout?

Le lazy loading réduit le bundle initial et améliore le Time to Interactive (TTI). Les champs sont petits et se chargent instantanément.

### Pourquoi séparer en tant de fichiers?

Chaque fichier a une **responsabilité unique** (Single Responsibility Principle). Cela facilite:
- La maintenance (moins de lignes par fichier)
- Les tests (isolation des composants)
- Le debugging (logs plus clairs)
- La réutilisation (FormField peut être utilisé ailleurs)

### Puis-je réutiliser FormField?

Oui. `FormField` est un composant générique qui peut être utilisé pour n'importe quel champ de formulaire avec validation.

### Comment débugger?

1. Chaque composant log ses erreurs dans la console
2. Les statuts de validation sont visibles dans React DevTools
3. Les hooks peuvent être testés indépendamment

## Support

Pour toute question, consulter:
- [README.md](./README.md) - Documentation complète
- [REFACTORING_SUMMARY.md](/REFACTORING_SUMMARY.md) - Rapport de refactorisation
- Tests unitaires - Exemples d'utilisation
