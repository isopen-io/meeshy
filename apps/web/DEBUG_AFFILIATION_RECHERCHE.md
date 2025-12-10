# 🐛 Guide de Débogage - Affiliation & Recherche

**Date:** 2025-11-21
**Problèmes signalés:**
1. ❌ Création de compte avec affiliation ne fonctionne pas
2. ❌ Recherche d'utilisateur dans /contacts ne fonctionne pas

---

## 🔍 Problème 1: Affiliation lors de la création de compte

### Logs ajoutés pour débogage

#### Dans `RegisterForm` (`/components/auth/register-form.tsx`)

**Lignes 204-215:**
```typescript
// Logs pour débogage de l'affiliation
if (affiliateToken) {
  console.log('[REGISTER_FORM] ✅ Token d\'affiliation détecté:', affiliateToken.substring(0, 10) + '...');
} else {
  console.log('[REGISTER_FORM] ⚠️ Aucun token d\'affiliation trouvé dans localStorage');
}

console.log('[REGISTER_FORM] Request body (sans password):', {
  ...requestBody,
  password: '[HIDDEN]',
  affiliateToken: requestBody.affiliateToken ? requestBody.affiliateToken.substring(0, 10) + '...' : undefined
});
```

### Comment déboguer ?

#### **Étape 1: Vérifier que le token est stocké**

1. Aller sur `/join/[linkId]` (exemple: `/join/mshy_abc123`)
2. Ouvrir la console du navigateur (F12)
3. Chercher les logs:
   ```
   [JOIN] Token d'affiliation du créateur stocké: aff_...
   ```

4. Vérifier localStorage:
   ```javascript
   localStorage.getItem('meeshy_affiliate_token')
   ```

**Si aucun log n'apparaît:**
- ❌ Le créateur du lien n'a pas de token d'affiliation actif
- ❌ L'endpoint `GET /users/:userId/affiliate-token` ne fonctionne pas
- ❌ Le `creator.id` n'est pas présent dans les données du lien

---

#### **Étape 2: Vérifier que le token est envoyé**

1. Sur la page `/join/[linkId]`, cliquer sur "S'inscrire"
2. Remplir le formulaire d'inscription
3. Soumettre le formulaire
4. Chercher dans la console:

**Si token détecté:**
```
[REGISTER_FORM] ✅ Token d'affiliation détecté: aff_abc123...
[REGISTER_FORM] Request body (sans password): {
  username: "...",
  firstName: "...",
  lastName: "...",
  email: "...",
  affiliateToken: "aff_abc123..."
}
```

**Si token non détecté:**
```
[REGISTER_FORM] ⚠️ Aucun token d'affiliation trouvé dans localStorage
[REGISTER_FORM] Request body (sans password): {
  username: "...",
  firstName: "...",
  lastName: "...",
  email: "...",
  affiliateToken: undefined  // ❌ Pas de token !
}
```

---

#### **Étape 3: Vérifier la réponse du backend**

Après soumission, chercher:
```
[REGISTER_FORM] Réponse HTTP: 201 Created
```

**Si 400 Bad Request:**
- Le backend rejette le token d'affiliation
- Vérifier que le backend accepte le champ `affiliateToken`

**Si 201 mais pas d'association:**
- Le backend créé l'utilisateur mais n'associe pas l'affiliation
- Vérifier la logique backend de création d'affiliation

---

### Checklist de débogage

- [ ] Le créateur du lien a un token d'affiliation actif
- [ ] L'endpoint `GET /users/:userId/affiliate-token` retourne un token
- [ ] Le token est stocké dans `localStorage` après chargement de `/join`
- [ ] Le token est stocké dans le cookie
- [ ] Le log `✅ Token d'affiliation détecté` apparaît dans RegisterForm
- [ ] Le `requestBody` contient `affiliateToken`
- [ ] La requête POST `/api/auth/register` contient le token
- [ ] Le backend retourne 201 Created
- [ ] Le backend crée l'association d'affiliation

---

## 🔍 Problème 2: Recherche d'utilisateurs dans /contacts

### Logs ajoutés pour débogage

#### Dans `/app/contacts/page.tsx`

**Lignes 236-259:**
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

    const searchData = Array.isArray(response.data) ? response.data : [];
    console.log('[CONTACTS] Résultats de recherche:', searchData.length, 'utilisateurs trouvés');
    setSearchResults(searchData);
  } catch (error) {
    console.error('[CONTACTS] ❌ Erreur lors de la recherche:', error);
    toast.error(t('errors.searchError'));
    setSearchResults([]);
  }
};
```

#### Dans `/services/users.service.ts`

**Lignes 49-64:**
```typescript
async searchUsers(query: string): Promise<ApiResponse<User[]>> {
  console.log('[UsersService] searchUsers appelé avec query:', query);
  try {
    const url = `/users/search?q=${encodeURIComponent(query)}`;
    console.log('[UsersService] URL de recherche:', url);

    const response = await apiService.get<User[]>(url);
    console.log('[UsersService] ✅ Réponse API:', response);
    console.log('[UsersService] Nombre d\'utilisateurs trouvés:', Array.isArray(response.data) ? response.data.length : 'N/A');

    return response;
  } catch (error) {
    console.error('[UsersService] ❌ Erreur lors de la recherche d\'utilisateurs:', error);
    throw error;
  }
}
```

---

### Comment déboguer ?

#### **Étape 1: Vérifier que la recherche est déclenchée**

1. Aller sur `/contacts`
2. Ouvrir la console (F12)
3. Taper dans le champ de recherche (ex: "john")
4. Chercher les logs:

**Comportement attendu:**
```
[CONTACTS] Recherche utilisateurs avec query: j
[CONTACTS] Appel usersService.searchUsers...
[UsersService] searchUsers appelé avec query: j
[UsersService] URL de recherche: /users/search?q=j
```

**Si aucun log n'apparaît:**
- ❌ Le `onChange` n'est pas déclenché
- ❌ Vérifier que l'Input est bien connecté à `setSearchQuery`

---

#### **Étape 2: Vérifier la réponse de l'API**

**Si tout fonctionne bien:**
```
[UsersService] ✅ Réponse API: { data: [...], status: 200 }
[UsersService] Nombre d'utilisateurs trouvés: 5
[CONTACTS] Réponse reçue: { data: [...], status: 200 }
[CONTACTS] Résultats de recherche: 5 utilisateurs trouvés
```

**Si erreur 401 Unauthorized:**
```
[UsersService] ❌ Erreur lors de la recherche d'utilisateurs: ApiServiceError: Unauthorized
```
→ Problème d'authentification, vérifier le token

**Si erreur 404 Not Found:**
```
[UsersService] ❌ Erreur lors de la recherche d'utilisateurs: ApiServiceError: Not Found
```
→ L'endpoint `/users/search` n'existe pas sur le backend

**Si erreur 500 Internal Server Error:**
```
[UsersService] ❌ Erreur lors de la recherche d'utilisateurs: ApiServiceError: Internal Server Error
```
→ Erreur backend, vérifier les logs du serveur

**Si timeout:**
```
[UsersService] ❌ Erreur lors de la recherche d'utilisateurs: Error: Request timeout
```
→ Le backend est trop lent ou inaccessible

---

#### **Étape 3: Vérifier le format de la réponse**

Si des logs apparaissent mais aucun résultat n'est affiché:

**Vérifier le format de `response.data`:**
```javascript
// Dans la console
console.log(response.data)
```

**Format attendu:**
```json
[
  {
    "id": "user123",
    "username": "john_doe",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "avatar": "...",
    "isOnline": true,
    ...
  }
]
```

**Si le format est différent:**
```json
{
  "success": true,
  "data": {
    "users": [...]  // ❌ Imbriqué dans un objet
  }
}
```
→ Adapter le code pour extraire le bon champ

---

### Checklist de débogage

- [ ] Le champ de recherche est visible sur `/contacts`
- [ ] Taper dans le champ déclenche `onChange`
- [ ] Le log `[CONTACTS] Recherche utilisateurs avec query:` apparaît
- [ ] Le log `[UsersService] searchUsers appelé` apparaît
- [ ] L'URL de l'API est correcte (`/users/search?q=...`)
- [ ] Le backend répond avec status 200
- [ ] Le backend retourne un tableau d'utilisateurs
- [ ] Les utilisateurs sont stockés dans `searchResults`
- [ ] Les résultats s'affichent dans l'interface

---

## 🛠️ Solutions Rapides

### Problème: Pas de token d'affiliation stocké

**Causes possibles:**
1. Le créateur n'a pas de token d'affiliation actif
2. L'endpoint backend n'existe pas
3. Le `creator.id` est null ou undefined

**Solution:**
1. Vérifier que le créateur a un token actif dans la DB
2. Implémenter l'endpoint `GET /api/users/:userId/affiliate-token`
3. Vérifier que `conversationLink.creator.id` est présent

---

### Problème: Token stocké mais non envoyé

**Causes possibles:**
1. Le token est stocké mais `localStorage.getItem()` retourne null
2. Le spread operator `...(affiliateToken && { affiliateToken })` ne fonctionne pas

**Solution:**
1. Vérifier que le token existe vraiment dans localStorage:
   ```javascript
   console.log(localStorage.getItem('meeshy_affiliate_token'))
   ```

2. Forcer l'inclusion du token:
   ```typescript
   const requestBody = {
     ...formData,
     affiliateToken: affiliateToken || undefined
   };
   ```

---

### Problème: Recherche ne retourne rien

**Causes possibles:**
1. Le backend n'est pas accessible
2. L'endpoint `/users/search` n'existe pas
3. La requête nécessite une authentification

**Solution:**
1. Tester l'endpoint manuellement:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/users/search?q=john
   ```

2. Vérifier que le token d'auth est envoyé (apiService le fait automatiquement)

3. Implémenter l'endpoint backend si manquant

---

## 📝 Commandes utiles

### Vérifier localStorage dans la console
```javascript
// Voir tous les tokens
console.log('Auth token:', localStorage.getItem('auth_token'))
console.log('Affiliate token:', localStorage.getItem('meeshy_affiliate_token'))

// Vérifier les cookies
console.log('Cookies:', document.cookie)
```

### Vérifier l'état de l'application
```javascript
// Dans /contacts
console.log('Search query:', searchQuery)
console.log('Search results:', searchResults)
console.log('Contacts:', contacts)
```

### Tester l'API manuellement
```bash
# Backend local
curl http://localhost:3000/api/users/search?q=john

# Avec authentification
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/users/search?q=john

# Token d'affiliation
curl http://localhost:3000/api/users/USER_ID/affiliate-token
```

---

## ✅ Validation finale

Une fois les logs ajoutés, suivre ce processus:

### Pour l'affiliation:
1. [ ] Aller sur `/join/[linkId]`
2. [ ] Vérifier log: `[JOIN] Token d'affiliation du créateur stocké`
3. [ ] Cliquer "S'inscrire"
4. [ ] Vérifier log: `[REGISTER_FORM] ✅ Token d'affiliation détecté`
5. [ ] Vérifier log: `[REGISTER_FORM] Request body` contient `affiliateToken`
6. [ ] Soumettre le formulaire
7. [ ] Vérifier log: `[REGISTER_FORM] Réponse HTTP: 201`
8. [ ] Vérifier dans la DB que l'association d'affiliation est créée

### Pour la recherche:
1. [ ] Aller sur `/contacts`
2. [ ] Taper "john" dans le champ de recherche
3. [ ] Vérifier log: `[CONTACTS] Recherche utilisateurs avec query: john`
4. [ ] Vérifier log: `[UsersService] ✅ Réponse API`
5. [ ] Vérifier log: `[CONTACTS] Résultats de recherche: X utilisateurs trouvés`
6. [ ] Vérifier que les résultats s'affichent dans l'interface

---

**Date:** 2025-11-21
**Status:** ⏳ **EN ATTENTE DE TESTS**
**Prochaine étape:** Suivre le guide de débogage ci-dessus et partager les logs observés
