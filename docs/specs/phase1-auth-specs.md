# Phase 1 - Specifications d'Integration Authentification V2

> **Document de specifications techniques**
> Version: 2.0
> Date: 2026-01-31
> Auteur: SPEC-WRITER - Equipe meeshy-v2-migration

---

## Table des Matieres

1. [Resume](#1-resume)
2. [API Endpoints](#2-api-endpoints)
3. [Flow d'Authentification](#3-flow-dauthentification)
4. [Integrations Requises](#4-integrations-requises)
5. [Composants a Creer](#5-composants-a-creer)
6. [Gestion des Erreurs](#6-gestion-des-erreurs)
7. [Tests a Implementer](#7-tests-a-implementer)
8. [Checklist de Validation](#8-checklist-de-validation)

---

## 1. Resume

### Objectif
Connecter les pages V2 `/v2/login` et `/v2/signup` aux services d'authentification existants pour permettre aux utilisateurs de se connecter et creer des comptes.

### Etat Actuel
- **Pages V2**: UI complete, formulaires fonctionnels localement (useState), aucune connexion backend
- **Services existants**: `authService`, `authManager`, `useAuthStore` - tous operationnels
- **API Gateway**: Endpoints `/auth/login` et `/auth/register` actifs sur port 3000

### Infrastructure Existante

| Composant | Fichier | Role |
|-----------|---------|------|
| authService | `/services/auth.service.ts` | Appels API login/logout/refresh |
| authManager | `/services/auth-manager.service.ts` | Singleton gestion tokens |
| useAuthStore | `/stores/auth-store.ts` | Store Zustand avec persistence |
| buildApiUrl | `/lib/config.ts` | Construction URLs API |

### Livrables
1. Page `/v2/login` connectee au backend
2. Page `/v2/signup` connectee au backend
3. Composant `AuthGuard` pour proteger les routes V2
4. Hook `useV2Auth` pour orchestrer l'authentification (optionnel)

---

## 2. API Endpoints

### 2.1 Login - `POST /auth/login`

**URL Complete**: `{BACKEND_URL}/api/v1/auth/login`

**Request Body**:
```typescript
interface LoginRequest {
  username: string;  // Email, username ou telephone (format E.164)
  password: string;
}
```

**Response Success (200)**:
```typescript
interface LoginResponse {
  success: true;
  data: {
    user: SocketIOUser;
    token: string;
    refreshToken?: string;
    expiresIn: number;  // Duree en secondes
  };
}
```

**Response 2FA Required (200)**:
```typescript
interface Login2FAResponse {
  success: true;
  requires2FA: true;
  twoFactorToken: string;  // Token temporaire pour verification 2FA
  data: {
    user: SocketIOUser;  // Infos partielles
  };
}
```

**Response Error (401)**:
```typescript
interface LoginErrorResponse {
  success: false;
  error: string;  // "Identifiants incorrects" | "Compte desactive"
}
```

### 2.2 Register - `POST /auth/register`

**URL Complete**: `{BACKEND_URL}/api/v1/auth/register`

**Request Body**:
```typescript
interface RegisterRequest {
  username: string;          // Genere depuis email: email.split('@')[0]
  password: string;          // Min 8 caracteres
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;      // Optionnel
  phoneCountryCode?: string; // ISO 3166-1 alpha-2 (ex: "FR", "US")
  systemLanguage?: string;   // Langue UI (defaut: "fr")
  regionalLanguage?: string; // Langue de traduction preferee
}
```

**Response Success (201)**:
```typescript
interface RegisterResponse {
  success: true;
  data: {
    user: SocketIOUser;
    token: string;
    refreshToken?: string;
    expiresIn: number;
  };
}
```

**Response Phone Conflict (200)**:
```typescript
interface RegisterPhoneConflictResponse {
  success: true;
  phoneOwnershipConflict: true;
  phoneOwnerInfo: {
    maskedDisplayName: string;  // "J*** D***"
    maskedUsername: string;     // "j***e"
    maskedEmail: string;        // "j***@e***.com"
    avatarUrl?: string;
    phoneNumber: string;
    phoneCountryCode: string;
  };
}
```

**Response Errors (400)**:
```typescript
interface RegisterErrorResponse {
  success: false;
  error: string;
  // Erreurs possibles:
  // - "Email invalide: [details]"
  // - "Nom d'utilisateur deja utilise"
  // - "Email deja utilise"
  // - "Numero de telephone invalide"
}
```

### 2.3 Get Current User - `GET /auth/me`

**URL**: `{BACKEND_URL}/api/v1/auth/me`
**Headers**: `Authorization: Bearer {token}`

**Response (200)**:
```typescript
interface MeResponse {
  success: true;
  data: {
    user: SocketIOUser;
    permissions: UserPermissions;
  };
}
```

### 2.4 Logout - `POST /auth/logout`

**URL**: `{BACKEND_URL}/api/v1/auth/logout`
**Headers**: `Authorization: Bearer {token}`

**Response (200)**:
```typescript
interface LogoutResponse {
  success: true;
}
```

### 2.5 Refresh Token - `POST /auth/refresh`

**URL**: `{BACKEND_URL}/api/v1/auth/refresh`

**Request Body**:
```typescript
interface RefreshRequest {
  token?: string;
  refreshToken?: string;
}
```

**Response (200)**:
```typescript
interface RefreshResponse {
  success: true;
  data: {
    token: string;
    refreshToken?: string;
    expiresIn: number;
  };
}
```

---

## 3. Flow d'Authentification

### 3.1 Diagramme Sequence - Login

```
┌──────────┐          ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│  User    │          │  V2 Login   │          │ authService │          │   Gateway   │
│          │          │    Page     │          │             │          │    API      │
└────┬─────┘          └──────┬──────┘          └──────┬──────┘          └──────┬──────┘
     │                       │                        │                        │
     │  1. Submit form       │                        │                        │
     │──────────────────────>│                        │                        │
     │                       │                        │                        │
     │                       │  2. setIsLoading(true) │                        │
     │                       │────────────┐           │                        │
     │                       │            │           │                        │
     │                       │<───────────┘           │                        │
     │                       │                        │                        │
     │                       │  3. authService.login()│                        │
     │                       │───────────────────────>│                        │
     │                       │                        │                        │
     │                       │                        │  4. POST /auth/login   │
     │                       │                        │───────────────────────>│
     │                       │                        │                        │
     │                       │                        │  5. AuthResult         │
     │                       │                        │<───────────────────────│
     │                       │                        │                        │
     │                       │  6. Return response    │  (authManager          │
     │                       │<───────────────────────│   .setCredentials)     │
     │                       │                        │                        │
     │  [SUCCESS]            │                        │                        │
     │                       │  7. useAuthStore       │                        │
     │                       │     .setUser()         │                        │
     │                       │────────────┐           │                        │
     │                       │            │           │                        │
     │                       │<───────────┘           │                        │
     │                       │                        │                        │
     │  8. Redirect          │  router.push          │                        │
     │     /v2/chats         │  ('/v2/chats')         │                        │
     │<──────────────────────│                        │                        │
     │                       │                        │                        │
     │  [ERROR]              │                        │                        │
     │                       │  7b. setError()        │                        │
     │  8b. Show error       │                        │                        │
     │<──────────────────────│                        │                        │
```

### 3.2 Diagramme Sequence - Signup

```
┌──────────┐          ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│  User    │          │  V2 Signup  │          │   fetch()   │          │   Gateway   │
└────┬─────┘          └──────┬──────┘          └──────┬──────┘          └──────┬──────┘
     │                       │                        │                        │
     │  STEP 1: Infos        │                        │                        │
     │  (name,email,pwd)     │                        │                        │
     │──────────────────────>│                        │                        │
     │                       │                        │                        │
     │                       │  Validate step 1       │                        │
     │                       │  - name non vide       │                        │
     │                       │  - email format        │                        │
     │                       │  - password >= 8       │                        │
     │                       │                        │                        │
     │                       │  setStep(2)            │                        │
     │                       │                        │                        │
     │  STEP 2: Langue       │                        │                        │
     │──────────────────────>│                        │                        │
     │                       │                        │                        │
     │                       │  POST /auth/register   │                        │
     │                       │───────────────────────>│───────────────────────>│
     │                       │                        │                        │
     │                       │                        │  RegisterResult        │
     │                       │                        │<───────────────────────│
     │                       │<───────────────────────│                        │
     │                       │                        │                        │
     │  [SUCCESS]            │                        │                        │
     │                       │  authManager           │                        │
     │                       │  .setCredentials()     │                        │
     │                       │                        │                        │
     │                       │  useAuthStore          │                        │
     │                       │  .setUser()            │                        │
     │                       │                        │                        │
     │  Redirect /v2/chats   │                        │                        │
     │<──────────────────────│                        │                        │
```

### 3.3 Flow AuthGuard

```
                              ┌─────────────┐
                              │   Render    │
                              │  AuthGuard  │
                              └──────┬──────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │  useAuthStore()       │
                         │  isAuthChecking?      │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │ true           │                │
                    ▼                │                │
         ┌─────────────────┐         │                │
         │  Return         │         │                │
         │  <LoadingSpinner│         │                │
         │  />             │         │                │
         └─────────────────┘         │                │
                                     │ false
                                     ▼
                         ┌───────────────────────┐
                         │  isAuthenticated?     │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │ true           │ false          │
                    ▼                ▼                │
         ┌─────────────────┐  ┌─────────────────┐     │
         │  Return         │  │  redirect to    │     │
         │  {children}     │  │  /v2/login      │     │
         └─────────────────┘  └─────────────────┘     │
```

---

## 4. Integrations Requises

### 4.1 Page Login - Modifications

**Fichier**: `/apps/web/app/v2/login/page.tsx`

**Etape 1 - Ajouter les imports** (debut du fichier):
```typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore, useIsAuthenticated, useIsAuthChecking } from '@/stores/auth-store';
import { authService } from '@/services/auth.service';
import { Button, Card, CardHeader, CardContent, Input, Badge, theme } from '@/components/v2';
```

**Etape 2 - Ajouter les hooks et state** (apres la declaration du composant):
```typescript
export default function V2LoginPage() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const isAuthChecking = useIsAuthChecking();
  const setUser = useAuthStore((state) => state.setUser);
  const setTokens = useAuthStore((state) => state.setTokens);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
```

**Etape 3 - Ajouter le redirect si deja connecte**:
```typescript
  // Redirect si deja authentifie
  useEffect(() => {
    if (!isAuthChecking && isAuthenticated) {
      router.replace('/v2/chats');
    }
  }, [isAuthChecking, isAuthenticated, router]);
```

**Etape 4 - Remplacer handleSubmit**:
```typescript
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await authService.login(email, password);

      if (response.success && response.data) {
        // Mettre a jour le store Zustand
        setUser(response.data.user);
        setTokens(
          response.data.token,
          response.data.refreshToken,
          undefined,
          response.data.expiresIn
        );

        // Redirection vers chats
        router.push('/v2/chats');
      } else {
        setError(response.error || 'Identifiants incorrects');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setIsLoading(false);
    }
  };
```

**Etape 5 - Ajouter l'affichage d'erreur** (avant le bouton submit dans le JSX):
```typescript
{error && (
  <div
    className="p-3 rounded-lg text-sm"
    style={{
      backgroundColor: `${theme.colors.terracotta}15`,
      color: theme.colors.terracotta,
      border: `1px solid ${theme.colors.terracotta}30`
    }}
  >
    {error}
  </div>
)}
```

**Etape 6 - Mettre a jour le checkbox "Se souvenir de moi"**:
```typescript
<input
  type="checkbox"
  className="rounded"
  checked={rememberMe}
  onChange={(e) => setRememberMe(e.target.checked)}
/>
```

### 4.2 Page Signup - Modifications

**Fichier**: `/apps/web/app/v2/signup/page.tsx`

**Etape 1 - Ajouter les imports**:
```typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore, useIsAuthenticated, useIsAuthChecking } from '@/stores/auth-store';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl } from '@/lib/config';
import { Button, Card, Input, Badge, LanguageOrb, theme } from '@/components/v2';
```

**Etape 2 - Ajouter les hooks et state**:
```typescript
export default function V2SignupPage() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const isAuthChecking = useIsAuthChecking();
  const setUser = useAuthStore((state) => state.setUser);
  const setTokens = useAuthStore((state) => state.setTokens);

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});
```

**Etape 3 - Ajouter le redirect si deja connecte**:
```typescript
  useEffect(() => {
    if (!isAuthChecking && isAuthenticated) {
      router.replace('/v2/chats');
    }
  }, [isAuthChecking, isAuthenticated, router]);
```

**Etape 4 - Ajouter la validation**:
```typescript
  const validateStep1 = (): boolean => {
    const errors: typeof fieldErrors = {};

    // Validation nom (prenom + nom requis)
    if (!name.trim()) {
      errors.name = 'Le nom est requis';
    } else if (name.trim().split(' ').length < 2) {
      errors.name = 'Veuillez entrer votre prenom et nom';
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      errors.email = 'L\'email est requis';
    } else if (!emailRegex.test(email)) {
      errors.email = 'Format d\'email invalide';
    }

    // Validation password
    if (!password) {
      errors.password = 'Le mot de passe est requis';
    } else if (password.length < 8) {
      errors.password = 'Minimum 8 caracteres';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
```

**Etape 5 - Remplacer handleSubmit**:
```typescript
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (step === 1) {
      if (validateStep1()) {
        setStep(2);
      }
      return;
    }

    // Step 2: Creer le compte
    setIsLoading(true);

    try {
      // Extraire prenom et nom
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || nameParts[0];

      // Generer un username a partir de l'email
      const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

      const response = await fetch(buildApiUrl('/auth/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          firstName,
          lastName,
          email,
          systemLanguage: selectedLanguage,
          regionalLanguage: selectedLanguage,
        }),
      });

      const data = await response.json();

      if (data.success && data.data?.user) {
        // Definir les credentials via authManager
        authManager.setCredentials(
          data.data.user,
          data.data.token,
          data.data.refreshToken,
          undefined,
          data.data.expiresIn
        );

        // Mettre a jour le store
        setUser(data.data.user);
        setTokens(
          data.data.token,
          data.data.refreshToken,
          undefined,
          data.data.expiresIn
        );

        // Redirection
        router.push('/v2/chats');
      } else if (data.phoneOwnershipConflict) {
        setError('Ce numero de telephone est deja associe a un compte');
      } else {
        setError(data.error || 'Erreur lors de la creation du compte');
      }
    } catch (err) {
      console.error('Register error:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setIsLoading(false);
    }
  };
```

**Etape 6 - Ajouter l'affichage des erreurs de champ** (sous chaque Input):
```typescript
// Exemple pour le nom
<Input
  type="text"
  placeholder="Jean Dupont"
  value={name}
  onChange={(e) => {
    setName(e.target.value);
    setFieldErrors(prev => ({ ...prev, name: undefined }));
  }}
  // ...
/>
{fieldErrors.name && (
  <p className="text-xs mt-1" style={{ color: theme.colors.terracotta }}>
    {fieldErrors.name}
  </p>
)}
```

**Etape 7 - Ajouter l'erreur globale step 2** (avant les boutons):
```typescript
{error && (
  <div
    className="p-3 rounded-lg text-sm mb-4"
    style={{
      backgroundColor: `${theme.colors.terracotta}15`,
      color: theme.colors.terracotta,
      border: `1px solid ${theme.colors.terracotta}30`
    }}
  >
    {error}
  </div>
)}
```

### 4.3 Layout V2 - Initialisation Auth

**Fichier**: `/apps/web/app/v2/layout.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { V2ThemeProvider, ThemeScript } from '@/components/v2';
import { useAuthStore } from '@/stores/auth-store';

export default function V2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <V2ThemeProvider defaultTheme="system">
      <ThemeScript />
      {children}
    </V2ThemeProvider>
  );
}
```

---

## 5. Composants a Creer

### 5.1 AuthGuard V2

**Fichier a creer**: `/apps/web/components/v2/auth/AuthGuard.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useIsAuthenticated, useIsAuthChecking } from '@/stores/auth-store';
import { theme } from '@/components/v2';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * AuthGuard - Protege les routes V2 authentifiees
 *
 * Usage:
 * ```tsx
 * <AuthGuard>
 *   <ProtectedContent />
 * </AuthGuard>
 * ```
 */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useIsAuthenticated();
  const isAuthChecking = useIsAuthChecking();

  useEffect(() => {
    if (!isAuthChecking && !isAuthenticated) {
      // Sauvegarder l'URL de retour
      const returnUrl = encodeURIComponent(pathname);
      router.replace(`/v2/login?returnUrl=${returnUrl}`);
    }
  }, [isAuthChecking, isAuthenticated, pathname, router]);

  // Pendant la verification
  if (isAuthChecking) {
    return fallback || <AuthGuardLoader />;
  }

  // Non authentifie - le useEffect va rediriger
  if (!isAuthenticated) {
    return fallback || <AuthGuardLoader />;
  }

  // Authentifie - afficher le contenu
  return <>{children}</>;
}

/**
 * Loader affiche pendant la verification d'auth
 */
function AuthGuardLoader() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: theme.colors.warmCanvas }}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div
          className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"
          style={{
            borderColor: `${theme.colors.parchment} transparent ${theme.colors.terracotta} ${theme.colors.parchment}`
          }}
        />
        <p style={{ color: theme.colors.textSecondary }}>
          Verification en cours...
        </p>
      </div>
    </div>
  );
}

export default AuthGuard;
```

### 5.2 Export du composant

**Fichier a modifier**: `/apps/web/components/v2/index.ts`

Ajouter a la fin du fichier:
```typescript
// Auth components
export { AuthGuard } from './auth/AuthGuard';
```

### 5.3 Hook useV2Auth (Optionnel - pour simplifier)

**Fichier a creer**: `/apps/web/hooks/v2/useV2Auth.ts`

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { authService } from '@/services/auth.service';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl } from '@/lib/config';

interface LoginParams {
  email: string;
  password: string;
}

interface SignupParams {
  name: string;
  email: string;
  password: string;
  language: string;
}

interface AuthError {
  message: string;
  field?: 'email' | 'password' | 'name' | 'general';
}

export function useV2Auth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  const setUser = useAuthStore((state) => state.setUser);
  const setTokens = useAuthStore((state) => state.setTokens);
  const logout = useAuthStore((state) => state.logout);

  const clearError = useCallback(() => setError(null), []);

  const login = useCallback(async ({ email, password }: LoginParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.login(email, password);

      if (response.success && response.data) {
        setUser(response.data.user);
        setTokens(
          response.data.token,
          response.data.refreshToken,
          undefined,
          response.data.expiresIn
        );
        return { success: true };
      } else {
        const msg = response.error || 'Identifiants incorrects';
        setError({ message: msg, field: 'general' });
        return { success: false, error: msg };
      }
    } catch (err) {
      const msg = 'Erreur de connexion au serveur';
      setError({ message: msg, field: 'general' });
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [setUser, setTokens]);

  const signup = useCallback(async ({ name, email, password, language }: SignupParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || nameParts[0];
      const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

      const response = await fetch(buildApiUrl('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          firstName,
          lastName,
          email,
          systemLanguage: language,
          regionalLanguage: language,
        }),
      });

      const data = await response.json();

      if (data.success && data.data?.user) {
        authManager.setCredentials(
          data.data.user,
          data.data.token,
          data.data.refreshToken,
          undefined,
          data.data.expiresIn
        );
        setUser(data.data.user);
        setTokens(
          data.data.token,
          data.data.refreshToken,
          undefined,
          data.data.expiresIn
        );
        return { success: true };
      } else {
        const msg = data.error || 'Erreur lors de la creation du compte';
        let field: AuthError['field'] = 'general';
        if (msg.toLowerCase().includes('email')) field = 'email';
        if (msg.toLowerCase().includes('utilisateur')) field = 'name';
        setError({ message: msg, field });
        return { success: false, error: msg };
      }
    } catch (err) {
      const msg = 'Erreur de connexion au serveur';
      setError({ message: msg, field: 'general' });
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [setUser, setTokens]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/v2/login');
  }, [logout, router]);

  return {
    isLoading,
    error,
    clearError,
    login,
    signup,
    logout: handleLogout,
  };
}
```

---

## 6. Gestion des Erreurs

### 6.1 Tableau des Erreurs Login

| Situation | Code | Message Backend | Message UI |
|-----------|------|-----------------|------------|
| Credentials invalides | 401 | "Invalid credentials" | "Email ou mot de passe incorrect" |
| Compte desactive | 401 | "Account disabled" | "Votre compte a ete desactive" |
| Rate limit | 429 | "Too many attempts" | "Trop de tentatives. Reessayez plus tard." |
| Erreur serveur | 500 | - | "Erreur serveur. Veuillez reessayer." |
| Erreur reseau | - | - | "Verifiez votre connexion internet" |

### 6.2 Tableau des Erreurs Signup

| Situation | Code | Message Backend | Message UI |
|-----------|------|-----------------|------------|
| Email invalide | 400 | "Email invalide: ..." | "Format d'email invalide" |
| Email pris | 400 | "Email deja utilise" | "Cet email est deja utilise" |
| Username pris | 400 | "Nom d'utilisateur deja utilise" | "Ce nom d'utilisateur existe deja" |
| Tel pris | 200 | phoneOwnershipConflict | "Ce numero est deja associe a un compte" |
| Password faible | 400 | - | "Minimum 8 caracteres" |
| Erreur serveur | 500 | - | "Erreur serveur. Veuillez reessayer." |

### 6.3 Style Erreur V2

```typescript
// Composant reutilisable pour les erreurs
const ErrorMessage = ({ message }: { message: string }) => (
  <div
    className="p-3 rounded-lg text-sm"
    style={{
      backgroundColor: `${theme.colors.terracotta}15`,
      color: theme.colors.terracotta,
      border: `1px solid ${theme.colors.terracotta}30`
    }}
  >
    {message}
  </div>
);
```

---

## 7. Tests a Implementer

### 7.1 Tests Unitaires Login

**Fichier**: `/apps/web/__tests__/app/v2/login/page.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import V2LoginPage from '@/app/v2/login/page';
import { authService } from '@/services/auth.service';

jest.mock('next/navigation');
jest.mock('@/services/auth.service');
jest.mock('@/stores/auth-store');

describe('V2LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login form with email and password fields', () => {
    render(<V2LoginPage />);
    expect(screen.getByPlaceholderText(/vous@exemple.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••/i)).toBeInTheDocument();
  });

  it('shows error message on invalid credentials', async () => {
    (authService.login as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Identifiants incorrects',
    });

    render(<V2LoginPage />);

    fireEvent.change(screen.getByPlaceholderText(/vous@exemple.com/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(screen.getByText(/identifiants incorrects/i)).toBeInTheDocument();
    });
  });

  it('redirects to /v2/chats on successful login', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: jest.fn() });

    (authService.login as jest.Mock).mockResolvedValue({
      success: true,
      data: { user: { id: '1' }, token: 'token123', expiresIn: 3600 },
    });

    render(<V2LoginPage />);

    fireEvent.change(screen.getByPlaceholderText(/vous@exemple.com/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: 'correctpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/v2/chats');
    });
  });

  it('shows loading state during login', async () => {
    (authService.login as jest.Mock).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    render(<V2LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### 7.2 Tests Unitaires Signup

**Fichier**: `/apps/web/__tests__/app/v2/signup/page.test.tsx`

```typescript
describe('V2SignupPage', () => {
  it('validates name field - requires first and last name', async () => {
    render(<V2SignupPage />);

    fireEvent.change(screen.getByPlaceholderText(/jean dupont/i), {
      target: { value: 'Jean' }, // Missing last name
    });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    await waitFor(() => {
      expect(screen.getByText(/prenom et nom/i)).toBeInTheDocument();
    });
  });

  it('validates email format', async () => {
    render(<V2SignupPage />);

    fireEvent.change(screen.getByPlaceholderText(/jean dupont/i), {
      target: { value: 'Jean Dupont' },
    });
    fireEvent.change(screen.getByPlaceholderText(/vous@exemple.com/i), {
      target: { value: 'invalid-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    await waitFor(() => {
      expect(screen.getByText(/format d'email/i)).toBeInTheDocument();
    });
  });

  it('validates password length (min 8 chars)', async () => {
    render(<V2SignupPage />);

    fireEvent.change(screen.getByPlaceholderText(/jean dupont/i), {
      target: { value: 'Jean Dupont' },
    });
    fireEvent.change(screen.getByPlaceholderText(/vous@exemple.com/i), {
      target: { value: 'jean@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/minimum 8/i), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    await waitFor(() => {
      expect(screen.getByText(/8 caracteres/i)).toBeInTheDocument();
    });
  });

  it('advances to step 2 with valid data', async () => {
    render(<V2SignupPage />);

    fireEvent.change(screen.getByPlaceholderText(/jean dupont/i), {
      target: { value: 'Jean Dupont' },
    });
    fireEvent.change(screen.getByPlaceholderText(/vous@exemple.com/i), {
      target: { value: 'jean@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/minimum 8/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    await waitFor(() => {
      expect(screen.getByText(/choisissez votre langue/i)).toBeInTheDocument();
    });
  });
});
```

### 7.3 Tests AuthGuard

**Fichier**: `/apps/web/__tests__/components/v2/auth/AuthGuard.test.tsx`

```typescript
describe('AuthGuard', () => {
  it('shows loader while checking auth', () => {
    mockUseIsAuthChecking.mockReturnValue(true);
    mockUseIsAuthenticated.mockReturnValue(false);

    render(<AuthGuard><div>Protected</div></AuthGuard>);

    expect(screen.getByText(/verification/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    mockUseIsAuthChecking.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(true);

    render(<AuthGuard><div>Protected</div></AuthGuard>);

    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', () => {
    mockUseIsAuthChecking.mockReturnValue(false);
    mockUseIsAuthenticated.mockReturnValue(false);
    const mockReplace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ replace: mockReplace });

    render(<AuthGuard><div>Protected</div></AuthGuard>);

    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('/v2/login'));
  });
});
```

### 7.4 Tests E2E

**Fichier**: `/tests/e2e/v2-auth.e2e.test.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('V2 Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
  });

  test('login with valid credentials redirects to chats', async ({ page }) => {
    await page.goto('/v2/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/v2/chats', { timeout: 10000 });
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/v2/login');
    await page.fill('input[type="email"]', 'wrong@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=incorrect')).toBeVisible();
  });

  test('signup flow creates account', async ({ page }) => {
    const uniqueEmail = `test${Date.now()}@example.com`;
    await page.goto('/v2/signup');

    // Step 1
    await page.fill('input[placeholder*="Jean"]', 'Test User');
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[type="password"]', 'testpassword123');
    await page.click('button:has-text("Continuer")');

    // Step 2
    await page.click('button:has-text("en")'); // Select English
    await page.click('button:has-text("Creer mon compte")');

    await expect(page).toHaveURL('/v2/chats', { timeout: 15000 });
  });

  test('protected route redirects to login', async ({ page }) => {
    await page.goto('/v2/chats');
    await expect(page).toHaveURL(/\/v2\/login/);
  });

  test('authenticated user is redirected from login to chats', async ({ page }) => {
    // Login first
    await page.goto('/v2/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/v2/chats');

    // Try to access login again
    await page.goto('/v2/login');
    await expect(page).toHaveURL('/v2/chats');
  });
});
```

---

## 8. Checklist de Validation

### 8.1 Pre-Implementation

- [ ] Verifier que le backend est accessible (`curl http://localhost:3000/health`)
- [ ] Verifier que l'endpoint `/auth/login` repond correctement
- [ ] Verifier que l'endpoint `/auth/register` repond correctement
- [ ] Creer une branche `feat/v2-auth-integration`

### 8.2 Implementation Login

- [ ] Ajouter les imports dans `/v2/login/page.tsx`
- [ ] Ajouter les hooks (router, auth store)
- [ ] Ajouter le state error
- [ ] Implementer le redirect si deja authentifie
- [ ] Remplacer handleSubmit
- [ ] Ajouter l'affichage des erreurs
- [ ] **TEST**: Login avec credentials valides -> redirect /v2/chats
- [ ] **TEST**: Login avec credentials invalides -> affiche erreur
- [ ] **TEST**: Refresh page apres login -> reste connecte

### 8.3 Implementation Signup

- [ ] Ajouter les imports dans `/v2/signup/page.tsx`
- [ ] Ajouter les hooks et state
- [ ] Implementer le redirect si deja authentifie
- [ ] Ajouter validateStep1
- [ ] Remplacer handleSubmit
- [ ] Ajouter l'affichage des erreurs de champ
- [ ] Ajouter l'affichage des erreurs API
- [ ] **TEST**: Signup step 1 validation -> erreurs affichees
- [ ] **TEST**: Signup complet -> compte cree, redirect /v2/chats
- [ ] **TEST**: Signup email existant -> erreur API affichee

### 8.4 Implementation AuthGuard

- [ ] Creer `/components/v2/auth/AuthGuard.tsx`
- [ ] Ajouter export dans `/components/v2/index.ts`
- [ ] **TEST**: Acces /v2/chats sans auth -> redirect login
- [ ] **TEST**: Acces /v2/chats avec auth -> contenu affiche

### 8.5 Layout V2

- [ ] Ajouter initializeAuth dans layout.tsx
- [ ] **TEST**: Reload page -> session restauree

### 8.6 Tests Automatises

- [ ] Tests unitaires Login passent
- [ ] Tests unitaires Signup passent
- [ ] Tests AuthGuard passent
- [ ] Tests E2E passent

### 8.7 Code Review

- [ ] Pas de console.log en production
- [ ] Gestion erreurs complete
- [ ] Types TypeScript corrects
- [ ] Dark mode fonctionne
- [ ] Mobile responsive

### 8.8 Post-Implementation

- [ ] Mettre a jour v2-architecture-plan.md (Phase 1 = Complete)
- [ ] Creer PR avec description
- [ ] Demander review

---

## Annexes

### A. Structure Fichiers Modifies/Crees

```
apps/web/
├── app/v2/
│   ├── layout.tsx              [MODIFIER] - initializeAuth
│   ├── login/
│   │   └── page.tsx            [MODIFIER] - Connecter backend
│   └── signup/
│       └── page.tsx            [MODIFIER] - Connecter backend
├── components/v2/
│   ├── index.ts                [MODIFIER] - Export AuthGuard
│   └── auth/
│       └── AuthGuard.tsx       [CREER]
├── hooks/v2/
│   └── useV2Auth.ts            [CREER - OPTIONNEL]
└── __tests__/
    ├── app/v2/
    │   ├── login/page.test.tsx [CREER]
    │   └── signup/page.test.tsx[CREER]
    └── components/v2/auth/
        └── AuthGuard.test.tsx  [CREER]

tests/e2e/
└── v2-auth.e2e.test.ts         [CREER]
```

### B. Dependances

Aucune nouvelle dependance requise.

### C. Variables d'Environnement

Existantes suffisantes:
- `NEXT_PUBLIC_BACKEND_URL`
- `NEXT_PUBLIC_FRONTEND_URL`

---

*Document de specifications - Phase 1 Authentification V2*
*Version 2.0 - 2026-01-31*
*SPEC-WRITER - Equipe meeshy-v2-migration*
