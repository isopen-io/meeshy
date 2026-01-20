# Plan d'Alignement des Rôles : BDD ↔ TypeScript

**Date** : 20 janvier 2026
**Objectif** : Éliminer toutes les transformations de rôles en alignant la base de données sur les valeurs les plus explicites

---

## 🎯 Principe Directeur

> **La base de données doit stocker les valeurs les plus cohérentes et compréhensibles.**
> Pas d'abréviations, pas de transformations, juste de la cohérence.

---

## 📊 État Actuel vs État Cible

| Rôle | Prisma (Actuel) | Types TS (Actuel) | Cible Unifiée |
|------|-----------------|-------------------|---------------|
| Utilisateur standard | `"USER"` | `"USER"` | `"USER"` ✅ |
| Administrateur | `"ADMIN"` | `"ADMIN"` | `"ADMIN"` ✅ |
| Modérateur | `"MODO"` ❌ | `"MODERATOR"` | `"MODERATOR"` ✅ |
| Super admin | `"BIGBOSS"` | `"BIGBOSS"` | `"BIGBOSS"` ✅ |
| Auditeur | `"AUDIT"` | `"AUDIT"` | `"AUDIT"` ✅ |
| Analyste | `"ANALYST"` | `"ANALYST"` | `"ANALYST"` ✅ |

**Aliases à supprimer** :
- ❌ `"CREATOR"` → Utiliser `"ADMIN"` (contexte communauté)
- ❌ `"MEMBER"` → Utiliser `"USER"` (contexte général)

---

## 🚀 Plan d'Exécution

### **Étape 1 : Backup de la Base de Données** ⚠️

```bash
# Créer un backup complet avant toute modification
mongodump --uri="$DATABASE_URL" --out=./backup-$(date +%Y%m%d-%H%M%S)
```

---

### **Étape 2 : Mettre à Jour le Schema Prisma**

#### Fichier : `packages/shared/prisma/schema.prisma`

```prisma
// ===== AVANT =====
model User {
  /// USER, ADMIN, MODO, AUDIT, ANALYST, BIGBOSS
  role String @default("USER")
}

// ===== APRÈS =====
enum UserRole {
  USER
  ADMIN
  MODERATOR  // ✅ Explicite au lieu de "MODO"
  BIGBOSS
  AUDIT
  ANALYST
}

model User {
  role UserRole @default(USER)
}
```

**Commande** :
```bash
cd packages/shared
bunx prisma format
```

---

### **Étape 3 : Migrer les Données Existantes**

```bash
# Exécuter le script de migration
cd packages/shared/prisma/migrations
bun run migrate-user-roles.ts
```

**Ce que fait le script** :
1. ✅ Affiche les statistiques actuelles
2. ✅ Migre `"MODO"` → `"MODERATOR"`
3. ✅ Détecte les rôles invalides
4. ✅ Affiche les statistiques finales

---

### **Étape 4 : Générer le Client Prisma**

```bash
cd packages/shared
bunx prisma generate
```

**Résultat** : Le client Prisma utilisera maintenant l'enum `UserRole`.

---

### **Étape 5 : Nettoyer les Types TypeScript**

#### Fichier : `packages/shared/types/role-types.ts`

```typescript
// ===== AVANT =====
export enum GlobalUserRole {
  BIGBOSS = 'BIGBOSS',
  ADMIN = 'ADMIN',
  MODO = 'MODO',        // ❌ Abréviation
  AUDIT = 'AUDIT',
  ANALYST = 'ANALYST',
  USER = 'USER',
  // Aliases pour rétrocompatibilité
  MODERATOR = 'MODO',   // ❌ Transformation
  CREATOR = 'ADMIN',    // ❌ Alias inutile
  MEMBER = 'USER'       // ❌ Alias inutile
}

// ===== APRÈS =====
export enum GlobalUserRole {
  BIGBOSS = 'BIGBOSS',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',  // ✅ Explicite
  AUDIT = 'AUDIT',
  ANALYST = 'ANALYST',
  USER = 'USER'
}

// Type union pour compatibilité
export type GlobalUserRoleType =
  | 'USER'
  | 'ADMIN'
  | 'MODERATOR'  // ✅ Aligné
  | 'BIGBOSS'
  | 'AUDIT'
  | 'ANALYST';

// ❌ SUPPRIMER GLOBAL_ROLE_ALIASES (plus nécessaire)
```

---

#### Fichier : `packages/shared/types/user.ts`

```typescript
// ===== AVANT =====
export type UserRole = 'USER' | 'ADMIN' | 'MODERATOR' | 'BIGBOSS' | 'CREATOR' | 'AUDIT' | 'ANALYST' | 'MEMBER';

// ===== APRÈS =====
export type UserRole =
  | 'USER'
  | 'ADMIN'
  | 'MODERATOR'  // ✅ Aligné avec Prisma
  | 'BIGBOSS'
  | 'AUDIT'
  | 'ANALYST';
```

---

#### Fichier : `packages/shared/types/conversation.ts`

```typescript
// ===== AVANT =====
export type UserRole = 'USER' | 'ADMIN' | 'MODO' | 'BIGBOSS' | 'AUDIT' | 'ANALYST' |
  // Aliases pour rétrocompatibilité
  'MODERATOR' | 'CREATOR' | 'MEMBER';

// ===== APRÈS =====
// ❌ SUPPRIMER cette ligne (doublon)
// ✅ IMPORTER depuis user.ts
import type { UserRole } from './user.js';
```

---

#### Fichier : `packages/shared/types/api-schemas.ts`

```typescript
// ===== AVANT (ligne 59) =====
role: {
  type: 'string',
  enum: ['USER', 'MODERATOR', 'ADMIN', 'CREATOR', 'ANALYST', 'AUDIT', 'BIGBOSS'],
}

// ===== APRÈS =====
role: {
  type: 'string',
  enum: ['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST'],
}

// ===== AVANT (ligne 674) =====
role: {
  type: 'string',
  enum: ['USER', 'ADMIN', 'MODO', 'BIGBOSS', 'AUDIT', 'ANALYST', 'MODERATOR', 'CREATOR', 'MEMBER'],
}

// ===== APRÈS =====
role: {
  type: 'string',
  enum: ['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST'],
}
```

---

#### Fichier : `packages/shared/types/validation.ts`

```typescript
// ===== AVANT (ligne 105) =====
role: z.enum(['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'MODO', 'AUDIT', 'ANALYST', 'CREATOR', 'MEMBER']).default('USER'),

// ===== APRÈS =====
role: z.enum(['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST']).default('USER'),

// ===== AVANT (ligne 140) =====
role: z.enum(['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'MODO', 'AUDIT', 'ANALYST', 'CREATOR', 'MEMBER']),

// ===== APRÈS =====
role: z.enum(['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST']),
```

---

### **Étape 6 : Supprimer les Transformations dans le Frontend**

#### Fichier : `apps/web/services/conversations/transformers.service.ts`

```typescript
// ===== SUPPRIMER ENTIÈREMENT =====
stringToUserRole(role: string): UserRoleEnum {
  // ❌ Plus nécessaire - le backend retourne directement "MODERATOR"
}

mapUserRoleToString(role: string): 'admin' | 'moderator' | 'member' {
  // ❌ Plus nécessaire - utiliser directement les valeurs du backend
}
```

---

### **Étape 7 : Mettre à Jour les Permissions**

#### Fichier : `packages/shared/types/index.ts` (ligne 405)

```typescript
// ===== AVANT =====
[UserRoleEnum.MODO]: {
  canAccessAdmin: true,
  // ...
}

// ===== APRÈS =====
[UserRoleEnum.MODERATOR]: {
  canAccessAdmin: true,
  // ...
}
```

---

### **Étape 8 : Tester l'Alignement**

#### Test 1 : Vérifier les Types

```bash
cd packages/shared
bun run tsc --noEmit
```

#### Test 2 : Tester l'API

```typescript
// Créer un utilisateur avec rôle MODERATOR
const user = await prisma.user.create({
  data: {
    username: 'test-moderator',
    email: 'test@example.com',
    role: 'MODERATOR'  // ✅ Doit être accepté par Prisma
  }
});

console.log(user.role);  // "MODERATOR" ✅
```

#### Test 3 : Vérifier Socket.IO

```typescript
// Émettre un utilisateur via Socket.IO
socket.emit('user:connected', {
  id: user.id,
  username: user.username,
  role: user.role  // "MODERATOR" ✅
});

// Frontend reçoit directement
socket.on('user:connected', (data) => {
  console.log(data.role);  // "MODERATOR" ✅ (sans transformation)
});
```

---

## ✅ Résultat Final

### Avant
```
┌─────────┐      ┌──────────┐      ┌─────────────┐      ┌──────────┐
│ Prisma  │ ───▶ │ Backend  │ ───▶ │ transformers│ ───▶ │ Frontend │
│ "MODO"  │      │ "MODO"   │      │ → MODERATOR │      │ ✅       │
└─────────┘      └──────────┘      └─────────────┘      └──────────┘
                                          ⚠️ Couche de transformation
```

### Après
```
┌────────────┐      ┌──────────────┐      ┌──────────────┐
│ Prisma     │ ───▶ │ Backend      │ ───▶ │ Frontend     │
│ MODERATOR  │      │ MODERATOR    │      │ MODERATOR ✅ │
└────────────┘      └──────────────┘      └──────────────┘
                         ✅ Aucune transformation
```

---

## 📊 Impact

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| **Sources de vérité** | 3 (Prisma, user.ts, conversation.ts) | 1 (Prisma enum) | **-66%** |
| **Transformations** | 2+ (stringToUserRole, mapUserRole) | 0 | **-100%** |
| **Aliases** | 3 (MODO, CREATOR, MEMBER) | 0 | **-100%** |
| **Type safety** | String (Prisma) | Enum (Prisma) | **✅ Fort** |
| **Code à maintenir** | transformers.service.ts (450 lignes) | 0 lignes | **-100%** |

---

## ⚠️ Précautions

1. **Backup BDD** : Obligatoire avant migration
2. **Tester en staging** : Ne PAS déployer directement en production
3. **Migration progressive** : Vérifier chaque étape avant de continuer
4. **Rollback plan** : Garder le backup et être prêt à revenir en arrière

---

## 📝 Checklist de Validation

- [ ] Backup BDD créé
- [ ] Schema Prisma mis à jour avec enum
- [ ] Script de migration exécuté
- [ ] Client Prisma régénéré
- [ ] Types TypeScript nettoyés
- [ ] Transformers supprimés
- [ ] Tests TypeScript passent
- [ ] Tests API passent
- [ ] Tests Socket.IO passent
- [ ] Documentation mise à jour
- [ ] Déployé en staging
- [ ] Validé en staging
- [ ] Prêt pour production

---

**Prochaine étape recommandée** : Exécuter les étapes 1-4 en environnement de développement local.
