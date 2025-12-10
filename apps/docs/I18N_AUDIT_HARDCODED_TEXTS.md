# Audit des traductions i18n - Textes hardcodés à corriger

## 🎯 Objectif
Identifier et corriger tous les textes hardcodés (principalement en français) qui n'utilisent pas le hook `useI18n` pour assurer une traduction complète anglais/français.

## 📋 Fichiers identifiés avec textes hardcodés

### 1. `/frontend/app/links/page.tsx`

#### Ligne 384
```typescript
// ❌ HARDCODÉ
{mainTab === 'shareLinks' ? 'Liens actifs' : t('tracking.stats.activeLinks')}

// ✅ CORRECTION
{t('stats.activeLinks')}
```

**Action** : Le fichier `/frontend/locales/en/links.json` contient déjà `activeLinks`, il suffit d'utiliser `t()` pour les deux cas.

---

### 2. `/frontend/app/profile/page.tsx`

**⚠️ CE FICHIER N'UTILISE PAS DU TOUT `useI18n`**

#### Textes hardcodés identifiés :

**Ligne 122** :
```typescript
// ❌ HARDCODÉ
<span>Modifier</span>
// ✅ CORRECTION
<span>{t('edit')}</span>
```

**Ligne 129** :
```typescript
// ❌ HARDCODÉ
{user.isOnline ? 'En ligne' : 'Hors ligne'}
// ✅ CORRECTION
{user.isOnline ? t('status.online') : t('status.offline')}
```

**Autres textes hardcodés dans le fichier** :
- Ligne 52, 73, 88: `"Profil"` → `t('title')`
- Ligne 44-50: Noms de langues hardcodés en français
- Ligne 33: Format de date en français `'fr-FR'`
- Et beaucoup d'autres...

**Action** : Créer `/frontend/locales/en/profile.json` et `/frontend/locales/fr/profile.json`, puis intégrer `useI18n('profile')`.

---

### 3. `/frontend/app/contacts/page.tsx`

#### Ligne 539
```typescript
// ❌ HARDCODÉ
{searchQuery ? 'Aucun contact trouvé' : 'Aucun contact'}

// ✅ CORRECTION
{searchQuery ? t('noContactsFound') : t('noContacts')}
```

#### Ligne 542-544
```typescript
// ❌ HARDCODÉ
{searchQuery 
  ? 'Essayez de modifier votre recherche ou invitez de nouveaux contacts'
  : 'Commencez à développer votre réseau en invitant des contacts'
}

// ✅ CORRECTION
{searchQuery 
  ? t('noContactsFoundDescription')
  : t('noContactsDescription')
}
```

**Action** : Vérifier si `/frontend/locales/en/contacts.json` contient ces clés, sinon les ajouter.

---

## 🔧 Plan d'action

### Phase 1 : Vérification des fichiers de traduction existants ✅
- [x] Vérifier que tous les fichiers `.json` utilisent `{variable}` (pas `{{variable}}`)
- [x] Créer `/frontend/locales/fr/joinPage.json` (FAIT)
- [x] Corriger syntaxe dans `attachments.json` (FAIT)

### Phase 2 : Correction des fichiers identifiés
1. **`/frontend/app/links/page.tsx`**
   - [ ] Remplacer `'Liens actifs'` par `t('stats.activeLinks')`

2. **`/frontend/app/contacts/page.tsx`**
   - [ ] Vérifier `/frontend/locales/en/contacts.json`
   - [ ] Ajouter clés manquantes si nécessaire
   - [ ] Remplacer textes hardcodés par `t()`

3. **`/frontend/app/profile/page.tsx`**
   - [ ] Créer `/frontend/locales/en/profile.json`
   - [ ] Créer `/frontend/locales/fr/profile.json`
   - [ ] Ajouter `useI18n('profile')` dans le composant
   - [ ] Remplacer TOUS les textes hardcodés

### Phase 3 : Audit complet
- [ ] Scanner tous les fichiers `.tsx` pour détecter les textes hardcodés restants
- [ ] Créer une checklist de vérification
- [ ] Documenter les conventions d'utilisation de `useI18n`

---

## 📚 Conventions i18n pour Meeshy

### 1. Syntaxe d'interpolation
✅ **CORRECT** : `{variable}` (simple accolades)
❌ **INCORRECT** : `{{variable}}` (double accolades - syntaxe i18next)

### 2. Structure des fichiers JSON
```json
{
  "namespace": {
    "key": "Translation text",
    "nestedKey": {
      "subKey": "Nested translation"
    },
    "withParam": "Welcome {username}!",
    "withCount": "{count} items"
  }
}
```

### 3. Utilisation dans les composants
```typescript
import { useI18n } from '@/hooks/use-i18n';

function MyComponent() {
  const { t } = useI18n('namespace');
  
  return (
    <div>
      <h1>{t('key')}</h1>
      <p>{t('withParam', { username: 'John' })}</p>
      <span>{t('withCount', { count: 5 })}</span>
    </div>
  );
}
```

### 4. Namespaces existants
- `common` : Textes communs (boutons, messages d'erreur, etc.)
- `auth` : Authentification et inscription
- `conversations` : Page conversations et chat
- `contacts` : Page contacts
- `links` : Liens de partage et tracking
- `settings` : Paramètres utilisateur
- `joinPage` : Page de jointure `/join/[linkId]`
- `attachments` : Pièces jointes
- `bubbleStream` : Messages en bulles
- `header` : En-tête de navigation
- `modals` : Modales diverses
- `landing` : Page d'accueil
- `dashboard` : Tableau de bord
- `groups` : Groupes

### 5. Règle d'or
**Aucun texte visible par l'utilisateur ne doit être hardcodé directement dans le JSX/TSX.**

Toujours utiliser :
```typescript
{t('key')}  // ✅
"Hardcoded text"  // ❌
```

---

## 🔍 Commandes utiles

### Rechercher textes hardcodés en français
```bash
cd frontend
grep -rn "'" app/ components/ | grep -E "'[A-Z][a-zéèêàâù]+ [a-zéèêàâù]+'"
```

### Rechercher textes hardcodés en anglais
```bash
grep -rn '"' app/ components/ | grep -E '"[A-Z][a-z]+ [a-z]+"'
```

### Vérifier syntaxe d'interpolation incorrecte
```bash
grep -rn "{{" locales/
```

### Lister tous les fichiers utilisant useI18n
```bash
grep -rn "useI18n(" app/ components/ | cut -d: -f1 | sort -u
```

---

## 📊 Statistique actuelle

- ✅ **Fichiers corrigés** : 5
  - `locales/en/joinPage.json`
  - `locales/fr/joinPage.json` (créé)
  - `locales/en/attachments.json`
  - `locales/fr/attachments.json`
  - `docs/FIX_I18N_INTERPOLATION.md`

- ⚠️ **Fichiers identifiés à corriger** : 3
  - `app/links/page.tsx` (1 texte hardcodé)
  - `app/contacts/page.tsx` (3 textes hardcodés)
  - `app/profile/page.tsx` (20+ textes hardcodés, pas de useI18n)

- 🔍 **Fichiers à auditer** : ~50 composants

---

**Date** : 16 octobre 2025  
**Auteur** : GitHub Copilot  
**Statut** : 🚧 En cours
