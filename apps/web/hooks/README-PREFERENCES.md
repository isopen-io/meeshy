# Hook `usePreferences<T>` - Documentation

Hook React pour gérer les préférences utilisateur avec React Query, optimistic updates et gestion automatique des consentements GDPR.

## Table des Matières

- [Installation](#installation)
- [Features](#features)
- [API](#api)
- [Exemples d'Utilisation](#exemples-dutilisation)
- [Gestion des Consentements](#gestion-des-consentements)
- [Types](#types)
- [Best Practices](#best-practices)

---

## Installation

Les fichiers nécessaires sont:

```
/hooks/use-preferences.ts          # Hook principal
/types/preferences.ts               # Types TypeScript
/components/settings/ConsentDialog.tsx  # Dialogue de consentement
/locales/en/settings.json          # Traductions i18n
```

Dépendances requises (déjà dans package.json):
- `@tanstack/react-query` ^5.90.16
- `react` ^19.2.3

---

## Features

### 1. Déduplication Automatique (SWR-like)
React Query gère automatiquement la déduplication des requêtes.

```tsx
// Même si appelé 10 fois, une seule requête HTTP est faite
const prefs1 = usePreferences('privacy');
const prefs2 = usePreferences('privacy');
const prefs3 = usePreferences('privacy');
```

### 2. Optimistic Updates
Les changements sont visibles immédiatement, puis rollback en cas d'erreur.

```tsx
const { updatePreferences } = usePreferences('notifications');

// UI mise à jour IMMÉDIATEMENT
await updatePreferences({ enablePushNotifications: true });
// Rollback automatique si erreur serveur
```

### 3. Gestion GDPR 403 CONSENT_REQUIRED
Détection automatique des violations de consentement avec dialogue UX.

```tsx
const { consentViolations } = usePreferences('translation', {
  onConsentRequired: (violations) => {
    // Afficher le dialogue de consentement
    setShowConsentDialog(true);
  }
});
```

### 4. Support PATCH et PUT
- **PATCH**: Mise à jour partielle (recommandé)
- **PUT**: Remplacement complet

```tsx
// PATCH - Met à jour uniquement ce champ
await updatePreferences({ transcriptionEnabled: true });

// PUT - Remplace tout l'objet
await replacePreferences(completePrefsObject);
```

### 5. TypeScript Strict
Inférence de type automatique basée sur la catégorie.

```tsx
// ✅ TypeScript sait que `data` est de type `TranslationPreferences`
const { data } = usePreferences('translation');
data?.transcriptionEnabled; // ✅ Autocompletion

// ❌ Erreur de compilation si mauvais type
updatePreferences({ invalidField: true }); // ❌ TypeScript error
```

---

## API

### Hook `usePreferences<C extends PreferenceCategory>`

```tsx
const {
  data,              // Données des préférences (typées)
  isLoading,         // État de chargement initial
  error,             // Erreur éventuelle
  isUpdating,        // Mutation en cours
  updatePreferences, // Mise à jour partielle (PATCH)
  replacePreferences,// Remplacement complet (PUT)
  refetch,           // Recharger manuellement
  consentViolations, // Violations de consentement (403)
} = usePreferences('privacy', options);
```

### Options

```typescript
interface UsePreferencesOptions {
  /**
   * Désactiver la récupération automatique au montage
   * @default true
   */
  enabled?: boolean;

  /**
   * Callback en cas d'erreur
   */
  onError?: (error: Error | ConsentRequiredError) => void;

  /**
   * Callback en cas de succès de mise à jour
   */
  onSuccess?: (data: any) => void;

  /**
   * Callback lors d'une violation de consentement (403)
   */
  onConsentRequired?: (violations: ConsentViolation[]) => void;

  /**
   * Intervalle de revalidation en ms (0 = désactivé)
   * @default 0
   */
  revalidateInterval?: number;
}
```

### Catégories Disponibles

```typescript
type PreferenceCategory =
  | 'privacy'
  | 'notifications'
  | 'language'
  | 'accessibility'
  | 'audio'
  | 'video'
  | 'translation';
```

---

## Exemples d'Utilisation

### Exemple 1: Utilisation Basique

```tsx
import { usePreferences } from '@/hooks/use-preferences';
import { Switch } from '@/components/ui/switch';

export function PrivacySettings() {
  const { data, isLoading, updatePreferences } = usePreferences('privacy');

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <Switch
        checked={data?.showOnlineStatus}
        onCheckedChange={(checked) =>
          updatePreferences({ showOnlineStatus: checked })
        }
      />
    </div>
  );
}
```

### Exemple 2: Avec Gestion de Consentement

```tsx
import { useState } from 'react';
import { usePreferences } from '@/hooks/use-preferences';
import { ConsentDialog } from '@/components/settings/ConsentDialog';

export function TranslationSettings() {
  const [showConsent, setShowConsent] = useState(false);

  const {
    data,
    updatePreferences,
    consentViolations,
  } = usePreferences('translation', {
    onConsentRequired: (violations) => {
      console.log('Consent needed:', violations);
      setShowConsent(true);
    },
  });

  const handleConsentAccepted = async (consents: Record<string, boolean>) => {
    // Mettre à jour les consentements via API
    await fetch('/api/v1/me/consents', {
      method: 'PATCH',
      body: JSON.stringify(consents),
    });

    // Réessayer la mise à jour
    await updatePreferences({ transcriptionEnabled: true });
  };

  return (
    <>
      <Switch
        checked={data?.transcriptionEnabled}
        onCheckedChange={(checked) =>
          updatePreferences({ transcriptionEnabled: checked })
        }
      />

      {consentViolations && (
        <ConsentDialog
          open={showConsent}
          onOpenChange={setShowConsent}
          violations={consentViolations}
          onConsent={handleConsentAccepted}
          mode="blocking"
        />
      )}
    </>
  );
}
```

### Exemple 3: Mise à Jour Multiple (Batch)

```tsx
const { updatePreferences } = usePreferences('privacy');

const handleSaveAll = async () => {
  // Une seule requête pour plusieurs champs
  await updatePreferences({
    profileVisibility: 'friends',
    showOnlineStatus: true,
    showReadReceipts: false,
  });
};
```

### Exemple 4: Lazy Loading

```tsx
const {
  data,
  isLoading,
  refetch,
} = usePreferences('accessibility', {
  enabled: false, // Ne charge pas au montage
});

// Charger manuellement
<button onClick={() => refetch()}>Load Preferences</button>
```

### Exemple 5: Auto-Revalidation

```tsx
const { data } = usePreferences('video', {
  revalidateInterval: 30000, // Revalide toutes les 30s
});
```

---

## Gestion des Consentements

### Flow Complet

1. **L'utilisateur active une fonctionnalité** (ex: transcription)
2. **Le serveur répond 403 CONSENT_REQUIRED** avec les violations
3. **Le hook détecte l'erreur** et appelle `onConsentRequired`
4. **Le dialogue de consentement s'affiche**
5. **L'utilisateur accepte les consentements**
6. **Les consentements sont enregistrés** via API
7. **La mise à jour est réessayée** automatiquement

### Réponse 403 du Backend

```json
{
  "success": false,
  "error": "CONSENT_REQUIRED",
  "violations": [
    {
      "field": "transcriptionEnabled",
      "message": "Audio transcription requires voice data consent",
      "requiredConsents": ["voiceDataConsentAt", "audioTranscriptionEnabledAt"]
    }
  ]
}
```

### Composant ConsentDialog

```tsx
<ConsentDialog
  open={showDialog}
  onOpenChange={setShowDialog}
  violations={consentViolations}
  onConsent={async (consents) => {
    // Enregistrer les consentements
    await apiService.patch('/api/v1/me/consents', consents);
  }}
  mode="blocking" // ou "optional"
/>
```

---

## Types

### PreferenceCategory

```typescript
type PreferenceCategory =
  | 'privacy'
  | 'notifications'
  | 'language'
  | 'accessibility'
  | 'audio'
  | 'video'
  | 'translation';
```

### Example: TranslationPreferences

```typescript
interface TranslationPreferences {
  autoTranslate: boolean;
  transcriptionEnabled: boolean;
  voiceDataConsentAt?: Date;
  audioTranscriptionEnabledAt?: Date;
  preferredTranslationEngine: 'google' | 'deepl' | 'azure';
  showOriginalText: boolean;
  translateInRealtime: boolean;
}
```

### ConsentViolation

```typescript
interface ConsentViolation {
  field: string;
  message: string;
  requiredConsents: string[];
}
```

---

## Best Practices

### 1. Utiliser `enabled: false` pour Lazy Loading

```tsx
// ❌ Mauvais: Charge même si non affiché
const { data } = usePreferences('privacy');

// ✅ Bon: Lazy load
const { data, refetch } = usePreferences('privacy', { enabled: false });
```

### 2. Gérer les Erreurs Correctement

```tsx
const { updatePreferences } = usePreferences('notifications', {
  onError: (error) => {
    toast.error(error.message);
  },
  onSuccess: () => {
    toast.success('Settings saved');
  },
});
```

### 3. Utiliser Optimistic Updates

```tsx
// ✅ Bon: L'UI se met à jour instantanément
await updatePreferences({ enablePushNotifications: true });

// ❌ Mauvais: Attendre la réponse serveur avant de mettre à jour l'UI
setIsLoading(true);
const response = await fetch(...);
setData(response.data);
setIsLoading(false);
```

### 4. Batch Updates Quand Possible

```tsx
// ❌ Mauvais: 3 requêtes HTTP
await updatePreferences({ field1: true });
await updatePreferences({ field2: false });
await updatePreferences({ field3: 'value' });

// ✅ Bon: 1 seule requête
await updatePreferences({
  field1: true,
  field2: false,
  field3: 'value',
});
```

### 5. Ne Jamais Ignorer les Violations de Consentement

```tsx
// ❌ Mauvais: Ignore les erreurs silencieusement
const { updatePreferences } = usePreferences('translation');

// ✅ Bon: Gère les violations de consentement
const { updatePreferences, consentViolations } = usePreferences('translation', {
  onConsentRequired: (violations) => {
    setShowConsentDialog(true);
  },
});
```

---

## API Endpoints Utilisés

- `GET /api/v1/me/preferences/{category}` - Récupérer
- `PATCH /api/v1/me/preferences/{category}` - Mise à jour partielle
- `PUT /api/v1/me/preferences/{category}` - Remplacement complet

---

## Cache et Performance

### Cache React Query

Le hook utilise React Query avec un `staleTime` de 5 minutes:

```typescript
const STALE_TIME = 5 * 60 * 1000; // 5 minutes
```

Cela signifie que:
- Les données sont considérées "fraîches" pendant 5 minutes
- Pas de refetch automatique pendant cette période
- Déduplication automatique des requêtes identiques

### Invalidation Manuelle

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { getPreferenceQueryKey } from '@/hooks/use-preferences';

const queryClient = useQueryClient();

// Invalider une catégorie spécifique
queryClient.invalidateQueries({
  queryKey: getPreferenceQueryKey('privacy')
});

// Invalider toutes les préférences
queryClient.invalidateQueries({
  queryKey: ['user-preferences']
});
```

---

## Troubleshooting

### Les préférences ne se chargent pas

```tsx
// Vérifier que enabled n'est pas à false
const { data, isLoading } = usePreferences('privacy', {
  enabled: true // ✅ Assurez-vous que c'est true
});
```

### Les mises à jour ne fonctionnent pas

```tsx
// Vérifier que l'API retourne le bon format
{
  "success": true,
  "data": { /* préférences */ }
}
```

### Le dialogue de consentement ne s'affiche pas

```tsx
// Assurez-vous d'avoir le callback onConsentRequired
const { consentViolations } = usePreferences('translation', {
  onConsentRequired: (violations) => {
    console.log('CONSENT REQUIRED:', violations);
    setShowDialog(true);
  }
});
```

---

## Migration depuis l'Ancien Hook

Si vous utilisez l'ancien hook basé sur useState:

```tsx
// ❌ Ancien
const { preferences, updatePreferences } = usePreferences('privacy', defaultValues, {
  debounceMs: 500
});

// ✅ Nouveau
const { data: preferences, updatePreferences } = usePreferences('privacy');
```

Différences principales:
- `preferences` → `data`
- Pas de `debounceMs` (React Query gère mieux)
- Pas de `defaultValues` (utiliser `enabled: false` + `refetch`)
- Pas de `hasChanges` (React Query track automatiquement)

---

## Support

Pour toute question ou problème:
1. Vérifier les exemples dans `/hooks/examples/use-preferences-example.tsx`
2. Consulter la doc React Query: https://tanstack.com/query/latest
3. Vérifier les types dans `/types/preferences.ts`

---

**Version:** 1.0.0
**Dernière mise à jour:** 2026-01-18
