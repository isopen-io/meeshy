# Beta Playground - Contrôle d'Accès

## 🔒 Restriction d'Accès

Le tab **Beta Playground** est réservé aux utilisateurs ayant au minimum le rôle **MODERATOR**.

### Rôles Autorisés

Les rôles suivants peuvent accéder au Beta Playground :
- ✅ `MODERATOR` - Modérateurs
- ✅ `ADMIN` - Administrateurs
- ✅ `BIGBOSS` - Super administrateurs
- ✅ `CREATOR` - Créateurs de contenu
- ✅ `MODO` - Alias de MODERATOR

### Rôles Non Autorisés

- ❌ `USER` - Utilisateurs standards
- ❌ `MEMBER` - Membres basiques
- ❌ `ANALYST` - Analystes
- ❌ `AUDIT` - Auditeurs

## 🔧 Implémentation Technique

### Vérification du Rôle

```typescript
const hasModeratorAccess = useMemo(() => {
  if (!currentUser?.role) return false;
  const moderatorRoles = ['MODERATOR', 'ADMIN', 'BIGBOSS', 'CREATOR', 'MODO'];
  return moderatorRoles.includes(currentUser.role);
}, [currentUser]);
```

### Filtrage Dynamique des Tabs

Le tab Beta est ajouté dynamiquement uniquement si l'utilisateur a les permissions :

```typescript
const tabs = useMemo(() => {
  const allTabs = [...standardTabs];

  // Only add Beta Playground for moderators and above
  if (hasModeratorAccess) {
    allTabs.push(betaTab);
  }

  return allTabs;
}, [t, hasModeratorAccess]);
```

### Protection URL

Si un utilisateur non autorisé essaie d'accéder directement à `/settings#beta` :
1. La validation détecte que le tab n'est pas dans la liste des tabs disponibles
2. L'utilisateur est automatiquement redirigé vers le tab `profile`
3. Aucune erreur n'est affichée (comportement silencieux)

```typescript
useEffect(() => {
  if (tabs.length > 0) {
    const validTabValues = tabs.map(tab => tab.value);
    if (!validTabValues.includes(activeTab)) {
      setActiveTab('profile'); // Redirection silencieuse
    }
  }
}, [tabs, activeTab]);
```

## 🎮 Fonctionnalités Beta

Le Beta Playground permet de tester les modèles Edge AI :

1. **LLM Edge** - Modèles de langage dans le navigateur (Chrome Built-in AI)
2. **Translation** - API de traduction navigateur
3. **Transcription** - Reconnaissance vocale (Web Speech API)
4. **TTS** - Synthèse vocale (Speech Synthesis API)

## 🔐 Sécurité

### Backend

Même si le frontend cache le tab, **toute API backend liée aux fonctionnalités beta DOIT également vérifier le rôle** :

```typescript
// Example middleware backend
export function requireModerator(req, res, next) {
  const userRole = req.user.role;
  const moderatorRoles = ['MODERATOR', 'ADMIN', 'BIGBOSS', 'CREATOR', 'MODO'];

  if (!moderatorRoles.includes(userRole)) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Moderator access required'
    });
  }

  next();
}
```

### Principe de Sécurité

> **Never trust the frontend** - Le contrôle d'accès frontend est uniquement pour l'UX. La sécurité réelle se fait toujours côté backend.

## 🚀 Évolution Future

### Ajout de Nouveaux Rôles

Pour ajouter un nouveau rôle autorisé, modifier la constante :

```typescript
const moderatorRoles = [
  'MODERATOR',
  'ADMIN',
  'BIGBOSS',
  'CREATOR',
  'MODO',
  'NEW_ROLE' // Nouveau rôle ici
];
```

### Permissions Granulaires

Pour des permissions plus fines (par feature), créer un système de permissions :

```typescript
const hasFeatureAccess = (user: User, feature: string) => {
  const permissions = {
    'beta.llm': ['ADMIN', 'BIGBOSS'],
    'beta.translation': ['MODERATOR', 'ADMIN', 'BIGBOSS'],
    'beta.transcription': ['MODERATOR', 'ADMIN', 'BIGBOSS'],
    'beta.tts': ['MODERATOR', 'ADMIN', 'BIGBOSS']
  };

  return permissions[feature]?.includes(user.role) ?? false;
};
```

## 📊 Métriques

Pour suivre l'utilisation du Beta Playground par rôle :

```typescript
// Analytics event
trackEvent('beta_playground_access', {
  user_role: currentUser.role,
  tab_opened: 'beta',
  timestamp: new Date().toISOString()
});
```

## ✅ Checklist de Validation

Avant de déployer en production :

- [ ] Vérifier que les utilisateurs `USER` ne voient pas le tab
- [ ] Vérifier que les `MODERATOR` voient le tab
- [ ] Tester l'accès direct via URL `/settings#beta` pour un USER
- [ ] Vérifier que le backend refuse les requêtes non autorisées
- [ ] Tester le comportement avec un utilisateur sans rôle défini
- [ ] Vérifier les logs pour détecter les tentatives d'accès non autorisées

## 🐛 Debugging

### L'utilisateur ne voit pas le tab Beta

```typescript
// Dans la console navigateur
console.log('Current user:', currentUser);
console.log('User role:', currentUser?.role);
console.log('Has moderator access:', hasModeratorAccess);
console.log('Available tabs:', tabs.map(t => t.value));
```

### Le tab Beta apparaît pour tout le monde

Vérifier que :
1. Le rôle est bien récupéré depuis l'API `/api/v1/auth/me`
2. Le champ `role` n'est pas `undefined` ou `null`
3. La logique `hasModeratorAccess` est bien exécutée

---

**Dernière mise à jour** : 2026-01-18
**Version** : 1.0.0
