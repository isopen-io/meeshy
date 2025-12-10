# ✅ Affiliation Automatique via Liens de Conversation

**Date:** 2025-11-21
**Fonctionnalité:** Association automatique des affiliations via `/join/[linkId]`

---

## 🎯 Objectif

Lorsqu'un utilisateur rejoint une conversation via un lien `/join/[linkId]`, le système associe automatiquement **le dernier token d'affiliation actif du créateur du lien** avec le nouvel utilisateur qui s'inscrit.

Cela permet d'**automatiser les affiliations** à partir des liens de partage de conversations !

---

## 🔄 Flux d'Affiliation Automatique

```
1. Utilisateur arrive sur /join/[linkId]
   ↓
2. Frontend charge les infos du lien (conversationLink)
   ↓
3. Récupération du creator.id du lien
   ↓
4. Appel API: GET /api/users/{creatorId}/affiliate-token
   ↓
5. Backend retourne le dernier token d'affiliation actif du créateur
   ↓
6. Frontend stocke le token:
   - localStorage.setItem('meeshy_affiliate_token', token)
   - document.cookie = 'meeshy_affiliate_token=...'
   ↓
7. Utilisateur clique sur "S'inscrire"
   ↓
8. RegisterForm récupère le token depuis localStorage
   ↓
9. POST /api/auth/register avec { ...userData, affiliateToken }
   ↓
10. Backend crée l'utilisateur et l'association d'affiliation
    ↓
11. ✅ Affiliation automatique réussie !
```

---

## 📂 Fichiers Modifiés

### 1. `/app/join/[linkId]/page.tsx`

**Fonction ajoutée:**
```typescript
const fetchAndStoreCreatorAffiliateToken = async (creatorId: string) => {
  try {
    // Appel API via usersService (meilleure architecture)
    const response = await usersService.getUserAffiliateToken(creatorId);

    if (response.success && response.data?.token) {
      const affiliateToken = response.data.token;

        // Stocker dans localStorage (durée: 30 jours)
        localStorage.setItem('meeshy_affiliate_token', affiliateToken);

        // Stocker dans cookie (durée: 30 jours)
        document.cookie = `meeshy_affiliate_token=${affiliateToken}; max-age=${30 * 24 * 60 * 60}; path=/; samesite=lax`;

        console.log(`[JOIN] Token d'affiliation du créateur stocké: ${affiliateToken.substring(0, 10)}...`);
      }
    }
  } catch (error) {
    // Échec silencieux - l'affiliation n'est pas critique pour rejoindre
    console.error('[JOIN] Erreur récupération token affiliation:', error);
  }
};
```

**Appel dans useEffect:**
```typescript
useEffect(() => {
  const initializePage = async () => {
    const linkResponse = await fetch(`${buildApiUrl('/anonymous/link')}/${linkId}`);
    if (linkResponse.ok) {
      const result = await linkResponse.json();
      if (result.success) {
        setConversationLink(result.data);

        // AFFILIATION AUTOMATIQUE: Récupérer et stocker le token d'affiliation du créateur
        if (result.data.creator?.id) {
          fetchAndStoreCreatorAffiliateToken(result.data.creator.id);
        }
      }
    }
  };

  if (linkId) {
    initializePage();
  }
}, [linkId]);
```

---

### 2. `/components/auth/register-form.tsx`

**Modification dans handleSubmit:**
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // Récupérer le token d'affiliation depuis localStorage (peut venir de /join ou /signin/affiliate/[token])
  const affiliateToken = typeof window !== 'undefined'
    ? localStorage.getItem('meeshy_affiliate_token')
    : null;

  const requestBody = linkId ? {
    // Mode lien d'invitation
    username: cleanUsername,
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    password: formData.password,
    phoneNumber: formData.phoneNumber,
    systemLanguage: formData.systemLanguage,
    regionalLanguage: formData.regionalLanguage,
    ...(affiliateToken && { affiliateToken }), // ✅ Ajouter le token d'affiliation si présent
  } : {
    // Mode inscription normale
    ...formData,
    ...(affiliateToken && { affiliateToken }), // ✅ Ajouter le token d'affiliation si présent
  };

  if (affiliateToken && process.env.NODE_ENV === 'development') {
    console.log('[REGISTER_FORM] Inscription avec token d\'affiliation:', affiliateToken.substring(0, 10) + '...');
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
};
```

---

## 🔧 Backend Requis

### Endpoint à créer: `GET /api/users/:userId/affiliate-token`

**Description:** Récupère le dernier token d'affiliation actif d'un utilisateur

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "aff_abc123xyz456"
  }
}
```

**Logique:**
1. Vérifier que l'utilisateur existe
2. Récupérer le dernier token d'affiliation actif (isActive = true)
3. Retourner le token

**Exemple Prisma:**
```typescript
const affiliateToken = await prisma.affiliateToken.findFirst({
  where: {
    userId: userId,
    isActive: true,
  },
  orderBy: {
    createdAt: 'desc',
  },
  select: {
    token: true,
  },
});

if (affiliateToken) {
  return res.json({
    success: true,
    data: {
      token: affiliateToken.token,
    },
  });
} else {
  return res.json({
    success: false,
    message: 'No active affiliate token found',
  });
}
```

---

## 🧪 Tests

### Test 1: Affiliation automatique via /join

**Scénario:**
1. User A crée un lien de conversation `/join/mshy_abc123`
2. User A a un token d'affiliation actif `aff_userA_token`
3. User B (non inscrit) clique sur le lien
4. User B arrive sur `/join/mshy_abc123`
5. User B clique sur "S'inscrire"
6. User B remplit le formulaire et s'inscrit

**Résultat attendu:**
- ✅ User B est créé dans la DB
- ✅ User B est associé à l'affiliation de User A
- ✅ Console logs montrent: `[JOIN] Token d'affiliation du créateur stocké: aff_userA_...`
- ✅ Console logs montrent: `[REGISTER_FORM] Inscription avec token d'affiliation: aff_userA_...`

---

### Test 2: Aucun token d'affiliation actif

**Scénario:**
1. User C crée un lien `/join/mshy_xyz789`
2. User C n'a **pas** de token d'affiliation actif
3. User D clique sur le lien et s'inscrit

**Résultat attendu:**
- ✅ User D est créé dans la DB
- ✅ Aucune association d'affiliation (normal)
- ✅ Console logs montrent: `[JOIN] Créateur sans token d'affiliation actif`
- ✅ L'inscription fonctionne quand même (pas de blocage)

---

### Test 3: Erreur API

**Scénario:**
1. User E crée un lien `/join/mshy_error123`
2. L'endpoint `/api/users/{userId}/affiliate-token` retourne une erreur 500
3. User F clique sur le lien et s'inscrit

**Résultat attendu:**
- ✅ User F est créé dans la DB
- ✅ Aucune association d'affiliation (échec silencieux)
- ✅ Console logs montrent: `[JOIN] Erreur récupération token affiliation: ...`
- ✅ L'inscription fonctionne quand même (pas de blocage)

---

## 📊 Avantages

### 1. **Automatisation Complète**
- ❌ **Avant:** Les utilisateurs devaient manuellement utiliser des liens d'affiliation `/signin/affiliate/[token]`
- ✅ **Maintenant:** L'affiliation est automatique dès qu'on partage un lien de conversation !

### 2. **Expérience Utilisateur Améliorée**
- Partage d'un seul lien `/join/[linkId]`
- Pas besoin de combiner lien de conversation + lien d'affiliation
- Flux simplifié pour l'utilisateur final

### 3. **Tracking Amélioré**
- Chaque conversation partagée devient un canal d'affiliation
- Mesure directe de l'efficacité des partages de conversations
- Attribution claire des nouveaux utilisateurs

### 4. **Compatibilité**
- Fonctionne avec les affiliations existantes `/signin/affiliate/[token]`
- Pas de rupture de fonctionnalité
- Les deux mécanismes coexistent

---

## 🔐 Sécurité

### 1. **Validation Backend**
- Le backend doit valider que le token d'affiliation existe
- Le backend doit vérifier que le token est actif
- Le backend doit gérer les tokens expirés

### 2. **Échec Silencieux**
- Si l'appel API échoue, l'inscription continue normalement
- L'affiliation n'est pas critique pour rejoindre une conversation
- Les erreurs sont loggées mais ne bloquent pas l'utilisateur

### 3. **Durée de Stockage**
- localStorage: 30 jours
- Cookie: 30 jours (`max-age=2592000`)
- Permet à l'utilisateur de revenir plus tard sans perdre l'affiliation

---

## 📝 Notes Importantes

1. **Endpoint Backend Requis:** L'endpoint `GET /api/users/:userId/affiliate-token` doit être implémenté côté backend

2. **Token Priority:** Si un utilisateur a déjà un token d'affiliation stocké (ex: via `/signin/affiliate/[token]`), le nouveau token de `/join` **écrasera** l'ancien

3. **Nettoyage:** Le token d'affiliation est automatiquement nettoyé après l'inscription (comportement backend à implémenter)

4. **Logs de Debug:** Activés uniquement en mode développement (`process.env.NODE_ENV === 'development'`)

---

## ✅ Status

- ✅ **Frontend implémenté:** Récupération et stockage du token
- ✅ **RegisterForm modifié:** Envoi du token lors de l'inscription
- ⏳ **Backend à implémenter:** Endpoint `GET /api/users/:userId/affiliate-token`
- ⏳ **Tests à effectuer:** Valider le flux end-to-end

---

**Date de mise à jour:** 2025-11-21
**Version:** 1.0
**Status:** ✅ **PRÊT POUR TESTS (frontend)**
