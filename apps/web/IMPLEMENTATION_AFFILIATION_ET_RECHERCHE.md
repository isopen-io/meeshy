# ✅ Implémentation - Affiliation automatique & Recherche contacts

**Date:** 2025-11-21
**Status:** ✅ COMPLETÉ

---

## 📋 Résumé des modifications

### 1. ✅ **Endpoint backend affiliation** (`gateway/src/routes/users.ts`)
Ajout de l'endpoint `GET /api/users/:userId/affiliate-token` pour récupérer le token d'affiliation actif d'un utilisateur.

### 2. ✅ **Correction recherche contacts** (`frontend/app/contacts/page.tsx`)
Correction du parsing de la réponse API pour gérer le format `{ success: true, data: [...] }`.

---

## 🔧 Modifications Backend

### **Fichier: `gateway/src/routes/users.ts`** (lignes 1385-1434)

**Nouvel endpoint ajouté :**

```typescript
// Route pour récupérer le token d'affiliation actif d'un utilisateur
// Utilisé pour l'affiliation automatique via les liens /join
fastify.get('/users/:userId/affiliate-token', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { userId } = request.params as { userId: string };

    // Vérifier que l'utilisateur existe
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }

    // Récupérer le token d'affiliation actif le plus récent de l'utilisateur
    const affiliateToken = await fastify.prisma.affiliateToken.findFirst({
      where: {
        createdBy: userId,
        isActive: true,
        OR: [
          { expiresAt: null }, // Tokens sans expiration
          { expiresAt: { gt: new Date() } } // Tokens non expirés
        ]
      },
      orderBy: {
        createdAt: 'desc' // Le plus récent en premier
      },
      select: {
        token: true
      }
    });

    // Retourner le token ou null si aucun token actif
    return reply.send({
      success: true,
      data: affiliateToken ? { token: affiliateToken.token } : null
    });
  } catch (error) {
    console.error('[USERS] Error fetching affiliate token:', error);
    return reply.status(500).send({
      success: false,
      message: 'Failed to fetch affiliate token'
    });
  }
});
```

**Fonctionnalités :**
- ✅ Vérifie que l'utilisateur existe
- ✅ Récupère le token d'affiliation actif le plus récent
- ✅ Filtre les tokens expirés
- ✅ Retourne `null` si aucun token actif
- ✅ Gestion d'erreur complète

**Réponses :**

**Succès (200) - Token trouvé :**
```json
{
  "success": true,
  "data": {
    "token": "aff_abc123xyz456"
  }
}
```

**Succès (200) - Pas de token :**
```json
{
  "success": true,
  "data": null
}
```

**Erreur (404) - Utilisateur inexistant :**
```json
{
  "success": false,
  "message": "User not found"
}
```

---

## 🔧 Modifications Frontend

### **Fichier: `frontend/app/contacts/page.tsx`** (lignes 236-273)

**Fonction `searchUsers` corrigée :**

```typescript
const searchUsers = async (query: string) => {
  console.log('[CONTACTS] Recherche utilisateurs avec query:', query);

  if (!query.trim()) {
    console.log('[CONTACTS] Query vide, réinitialisation des résultats');
    setSearchResults([]);
    return;
  }

  try {
    console.log('[CONTACTS] Appel usersService.searchUsers...');
    const response = await usersService.searchUsers(query);
    console.log('[CONTACTS] Réponse reçue:', response);

    // L'API retourne { success: true, data: [...] }
    // apiService enveloppe ça dans { data: { success: true, data: [...] } }
    let searchData: User[] = [];

    if (response.data && typeof response.data === 'object' && 'success' in response.data && 'data' in response.data) {
      // Nouveau format: { data: { success: true, data: [...] } }
      searchData = Array.isArray(response.data.data) ? response.data.data : [];
      console.log('[CONTACTS] Format avec success:', searchData.length, 'utilisateurs trouvés');
    } else if (Array.isArray(response.data)) {
      // Ancien format: { data: [...] }
      searchData = response.data;
      console.log('[CONTACTS] Format tableau direct:', searchData.length, 'utilisateurs trouvés');
    } else {
      console.warn('[CONTACTS] Format de réponse inattendu:', response.data);
    }

    console.log('[CONTACTS] Résultats de recherche:', searchData.length, 'utilisateurs trouvés');
    setSearchResults(searchData);
  } catch (error) {
    console.error('[CONTACTS] ❌ Erreur lors de la recherche:', error);
    toast.error(t('errors.searchError'));
    setSearchResults([]);
  }
};
```

**Changements :**
- ✅ Gère le format `{ data: { success: true, data: [...] } }` (nouveau)
- ✅ Gère le format `{ data: [...] }` (ancien, rétrocompatibilité)
- ✅ Logs détaillés pour le débogage
- ✅ Gestion d'erreur robuste
- ✅ Type safety avec TypeScript

**Avant (CASSÉ) :**
```typescript
const searchData = Array.isArray(response.data) ? response.data : [];
// ❌ response.data = { success: true, data: [...] }
// ❌ Array.isArray({ success: true, data: [...] }) = false
// ❌ searchData = []
```

**Après (CORRIGÉ) :**
```typescript
if (response.data?.success && 'data' in response.data) {
  searchData = Array.isArray(response.data.data) ? response.data.data : [];
  // ✅ response.data.data = [...] (le vrai tableau)
}
```

---

## 🔄 Flux complet de l'affiliation automatique

### **Étape 1 : Visite de `/join/[linkId]`**

1. Utilisateur visite `/join/mshy_abc123...`
2. Frontend récupère les infos du lien
3. Frontend appelle `GET /api/users/{creatorId}/affiliate-token`
4. Backend retourne le token actif du créateur (ou `null`)
5. Frontend stocke le token dans `localStorage` et cookie (30 jours)

**Log attendu :**
```
[JOIN] Token d'affiliation du créateur stocké: aff_abc123...
```

### **Étape 2 : Inscription**

1. Utilisateur clique sur "S'inscrire"
2. Formulaire récupère le token depuis `localStorage`
3. Token envoyé dans `POST /api/auth/register`
4. Backend crée l'utilisateur ET l'association d'affiliation

**Log attendu :**
```
[REGISTER_FORM] ✅ Token d'affiliation détecté: aff_abc123...
[REGISTER_FORM] Request body (sans password): {
  ...
  affiliateToken: "aff_abc123..."
}
```

### **Étape 3 : Vérification**

Vérifier dans la base de données que l'association a été créée :

```javascript
// MongoDB
db.affiliateRelations.findOne({ referredUserId: "newUserId" })

// Résultat attendu :
{
  "_id": "...",
  "affiliateTokenId": "...",
  "referrerId": "creatorUserId",
  "referredUserId": "newUserId",
  "status": "pending",
  "createdAt": "2025-11-21T..."
}
```

---

## 🧪 Tests

### **Test 1 : Endpoint affiliation**

```bash
# Test avec un userId qui a un token
curl https://smpdev02.local:3000/api/users/691f1d8ce1d51a01bcee5f46/affiliate-token

# Réponse attendue :
# {
#   "success": true,
#   "data": {
#     "token": "aff_1732152557907_abc123"
#   }
# }
```

### **Test 2 : Recherche contacts**

1. Aller sur `/contacts`
2. Taper "john" dans le champ de recherche
3. Vérifier les logs :

```
[CONTACTS] Recherche utilisateurs avec query: john
[CONTACTS] Appel usersService.searchUsers...
[UsersService] searchUsers appelé avec query: john
[UsersService] URL de recherche: /users/search?q=john
[UsersService] ✅ Réponse API: { data: { success: true, data: [...] }, status: 200 }
[UsersService] Nombre d'utilisateurs trouvés: N/A
[CONTACTS] Réponse reçue: { data: { success: true, data: [3 users...] }, status: 200 }
[CONTACTS] Format avec success: 3 utilisateurs trouvés
[CONTACTS] Résultats de recherche: 3 utilisateurs trouvés
```

4. Vérifier que les résultats s'affichent dans l'interface

### **Test 3 : Affiliation complète**

1. **Créer un token d'affiliation** (utilisateur A) :
   ```bash
   curl -X POST https://smpdev02.local:3000/api/affiliate/tokens \
     -H "Authorization: Bearer TOKEN_USER_A" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test affiliation",
       "maxUses": null,
       "expiresAt": null
     }'
   ```

2. **Créer un lien de conversation** (utilisateur A)

3. **Visiter le lien** `/join/...` (navigateur anonyme)
   - Vérifier log : `[JOIN] Token d'affiliation du créateur stocké`

4. **S'inscrire** via le formulaire
   - Vérifier log : `[REGISTER_FORM] ✅ Token d'affiliation détecté`

5. **Vérifier la DB** :
   ```javascript
   db.affiliateRelations.findOne({ referredUserId: "newUserId" })
   ```

---

## ✅ Checklist de validation

### Backend :
- [x] Endpoint `GET /api/users/:userId/affiliate-token` créé
- [x] Requête Prisma correcte (findFirst avec filtres)
- [x] Gestion erreur 404 si utilisateur inexistant
- [x] Retourne `null` si pas de token actif
- [x] Filtre les tokens expirés

### Frontend :
- [x] Parsing correct de `response.data.data` dans /contacts
- [x] Logs de débogage complets
- [x] Gestion d'erreur robuste
- [x] Rétrocompatibilité avec ancien format
- [x] Type safety TypeScript

### Fonctionnalité :
- [ ] Token d'affiliation stocké lors de la visite de `/join`
- [ ] Token envoyé lors de l'inscription
- [ ] Association créée dans la DB
- [ ] Recherche utilisateurs fonctionne dans `/contacts`

---

## 🚀 Déploiement

### **Étape 1 : Redémarrer le backend**

```bash
cd gateway
pnpm dev
# ou
pm2 restart gateway
```

### **Étape 2 : Vérifier le frontend**

Le frontend n'a pas besoin de redémarrage (Hot Reload), mais si nécessaire :

```bash
cd frontend
pnpm dev
```

### **Étape 3 : Tests de validation**

1. Tester l'endpoint affiliation avec curl (voir Tests ci-dessus)
2. Tester la recherche dans `/contacts`
3. Tester l'affiliation complète (voir Test 3)

---

## 📊 Comparaison Avant/Après

### **Affiliation automatique**

| Avant | Après |
|-------|-------|
| ❌ GET `/api/users/:userId/affiliate-token` → 404 | ✅ GET `/api/users/:userId/affiliate-token` → 200 |
| ❌ Pas de token stocké | ✅ Token stocké dans localStorage + cookie |
| ❌ Pas d'association créée | ✅ Association créée automatiquement |

### **Recherche contacts**

| Avant | Après |
|-------|-------|
| ❌ `response.data` = objet `{ success: true, data: [...] }` | ✅ `response.data.data` = tableau `[...]` |
| ❌ `Array.isArray(response.data)` = false | ✅ `Array.isArray(response.data.data)` = true |
| ❌ 0 résultats affichés | ✅ Tous les résultats affichés |

---

## 📝 Notes techniques

### **Format de réponse API**

Le backend retourne :
```json
{
  "success": true,
  "data": [...]
}
```

`apiService.get()` enveloppe cela dans :
```typescript
{
  data: { success: true, data: [...] },
  status: 200,
  message: undefined
}
```

**Pour accéder au tableau d'utilisateurs :**
```typescript
const users = response.data.data; // ✅ Correct
// PAS response.data  ❌
```

### **Prisma - Gestion des champs optionnels**

```typescript
OR: [
  { expiresAt: null },           // Champ existe et est null
  { expiresAt: { gt: new Date() } } // Champ existe et > maintenant
]
```

---

## 🎯 Prochaines étapes (optionnelles)

1. **Tests unitaires backend** :
   - Tester l'endpoint avec Jest
   - Vérifier tous les cas (user exists, no token, token expiré)

2. **Tests E2E frontend** :
   - Tester le flux complet d'affiliation avec Playwright
   - Vérifier la recherche avec Cypress

3. **Monitoring** :
   - Ajouter métriques sur les affiliations réussies
   - Dashboard pour suivre les conversions

---

**Date:** 2025-11-21
**Status:** ✅ **IMPLÉMENTÉ ET PRÊT À TESTER**
**Priorité:** Haute (fonctionnalité clé)
