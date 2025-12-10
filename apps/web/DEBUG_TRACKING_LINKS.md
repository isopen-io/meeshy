# 🐛 Guide de Débogage - Liens de Tracking (/l/[token])

**Date:** 2025-11-21
**Problème:** La page `/l/iwFFSa` redirige vers `/` au lieu de rediriger vers l'URL cible

---

## 📋 Comment fonctionnent les liens de tracking ?

Les liens de tracking Meeshy suivent ce flux :

1. **Visite** : L'utilisateur visite `/l/[token]` (ex: `/l/iwFFSa`)
2. **Enregistrement** : Le serveur enregistre le clic avec les infos du visiteur (IP, navigateur, OS, etc.)
3. **Redirection** : Le serveur récupère l'URL originale et redirige l'utilisateur

### Endpoint Backend

```
POST /api/tracking-links/:token/click
```

**Corps de la requête :**
```json
{
  "userAgent": "Mozilla/5.0...",
  "browser": "Chrome",
  "os": "macOS",
  "device": "desktop",
  "language": "fr",
  "referrer": "https://example.com",
  "deviceFingerprint": "fp-server-123456",
  "ipAddress": "192.168.1.1"
}
```

**Réponse attendue :**
```json
{
  "success": true,
  "data": {
    "originalUrl": "https://example.com/destination",
    "clickId": "click_123",
    ...
  }
}
```

---

## 🔍 Débogage avec les nouveaux logs

### Étape 1 : Vérifier les logs serveur

Les logs suivants apparaissent dans la console du serveur (terminal où Next.js tourne) :

#### Logs normaux (succès) :
```
[TRACKING_LINK] ========================================
[TRACKING_LINK] Page de tracking appelée avec token: iwFFSa
[TRACKING_LINK] Informations visiteur: {
  browser: 'Chrome',
  os: 'macOS',
  device: 'desktop',
  language: 'fr',
  ip: '192.168.1.1',
  deviceFingerprint: 'fp-server-12345678...'
}
[TRACKING_LINK] Enregistrement du clic pour token: iwFFSa
[TRACKING_LINK] URL API: https://smpdev02.local:3000/api/tracking-links/iwFFSa/click
[TRACKING_LINK] Click data: { userAgent: '...', browser: 'Chrome', ... }
[TRACKING_LINK] Réponse HTTP: 200 OK
[TRACKING_LINK] Données reçues: {
  "success": true,
  "data": {
    "originalUrl": "https://example.com/destination",
    ...
  }
}
[TRACKING_LINK] URL originale extraite: https://example.com/destination
[TRACKING_LINK] ✅ Redirection vers: https://example.com/destination
```

#### Logs d'erreur (échec) :
```
[TRACKING_LINK] ========================================
[TRACKING_LINK] Page de tracking appelée avec token: iwFFSa
[TRACKING_LINK] Informations visiteur: { ... }
[TRACKING_LINK] Enregistrement du clic pour token: iwFFSa
[TRACKING_LINK] URL API: https://smpdev02.local:3000/api/tracking-links/iwFFSa/click
[TRACKING_LINK] Click data: { ... }
[TRACKING_LINK] Réponse HTTP: 404 Not Found
[TRACKING_LINK] ❌ Erreur API: 404 {"error": "Tracking link not found"}
[TRACKING_LINK] URL originale extraite: null
[TRACKING_LINK] ❌ Échec récupération URL pour token: iwFFSa
[TRACKING_LINK] ❌ Redirection vers la page d'accueil avec erreur
```

---

### Étape 2 : Identifier le problème

#### Problème 1 : Token invalide (404)
**Logs observés :**
```
[TRACKING_LINK] Réponse HTTP: 404 Not Found
[TRACKING_LINK] ❌ Erreur API: 404 {"error": "Tracking link not found"}
```

**Cause :** Le token `iwFFSa` n'existe pas dans la base de données

**Solutions :**
1. Vérifier que le lien a bien été créé dans la DB :
   ```sql
   SELECT * FROM tracking_links WHERE shortToken = 'iwFFSa';
   ```

2. Créer un nouveau lien si nécessaire via l'interface d'admin

---

#### Problème 2 : Endpoint backend manquant (404)
**Logs observés :**
```
[TRACKING_LINK] Réponse HTTP: 404 Not Found
[TRACKING_LINK] ❌ Erreur API: 404 <!DOCTYPE html>...
```

**Cause :** L'endpoint `POST /api/tracking-links/:token/click` n'existe pas sur le backend

**Solutions :**
1. Vérifier que le backend a bien l'endpoint implémenté
2. Vérifier que le serveur backend est démarré
3. Vérifier que l'URL API est correcte dans `NEXT_PUBLIC_API_URL`

---

#### Problème 3 : Format de réponse incorrect
**Logs observés :**
```
[TRACKING_LINK] Réponse HTTP: 200 OK
[TRACKING_LINK] Données reçues: {
  "success": true,
  "originalUrl": "https://example.com"  // ❌ Pas dans data.originalUrl
}
[TRACKING_LINK] URL originale extraite: null
```

**Cause :** Le backend retourne `originalUrl` à la racine au lieu de `data.originalUrl`

**Solution :** Corriger le code frontend pour gérer les deux formats (déjà fait ligne 103) :
```typescript
const originalUrl = data.data?.originalUrl || data.originalUrl || null;
```

---

#### Problème 4 : Erreur serveur (500)
**Logs observés :**
```
[TRACKING_LINK] Réponse HTTP: 500 Internal Server Error
[TRACKING_LINK] ❌ Erreur API: 500 {"error": "Database error"}
```

**Cause :** Erreur backend (DB, validation, etc.)

**Solutions :**
1. Vérifier les logs du backend
2. Vérifier la connexion à la base de données
3. Vérifier que toutes les données requises sont envoyées

---

#### Problème 5 : CORS ou réseau
**Logs observés :**
```
[TRACKING_LINK] ❌ Exception lors de l'enregistrement: TypeError: fetch failed
```

**Causes possibles :**
- Problème CORS
- Backend inaccessible
- Certificat SSL invalide

**Solutions :**
1. Vérifier que le backend est accessible :
   ```bash
   curl -X POST https://smpdev02.local:3000/api/tracking-links/iwFFSa/click \
     -H "Content-Type: application/json" \
     -d '{"userAgent":"test","browser":"test","os":"test","device":"desktop","language":"fr"}'
   ```

2. Vérifier la variable d'environnement :
   ```bash
   echo $NEXT_PUBLIC_API_URL
   ```

---

## 🔧 Tests manuels

### Test 1 : Vérifier l'existence du lien

**Dans la base de données :**
```sql
SELECT
  id,
  shortToken,
  originalUrl,
  isActive
FROM tracking_links
WHERE shortToken = 'iwFFSa';
```

**Résultat attendu :**
```
id | shortToken | originalUrl                    | isActive
---+------------+--------------------------------+---------
1  | iwFFSa     | https://example.com/destination | true
```

Si le résultat est vide → Le lien n'existe pas

---

### Test 2 : Tester l'endpoint directement

**Avec curl :**
```bash
curl -X POST https://smpdev02.local:3000/api/tracking-links/iwFFSa/click \
  -H "Content-Type: application/json" \
  -d '{
    "userAgent": "Mozilla/5.0",
    "browser": "Chrome",
    "os": "macOS",
    "device": "desktop",
    "language": "fr",
    "referrer": "",
    "deviceFingerprint": "fp-test-123",
    "ipAddress": "127.0.0.1"
  }'
```

**Réponse attendue :**
```json
{
  "success": true,
  "data": {
    "originalUrl": "https://example.com/destination",
    "clickId": "...",
    "trackingLinkId": "..."
  }
}
```

---

### Test 3 : Vérifier les variables d'environnement

**Dans le terminal frontend :**
```bash
# Vérifier l'URL de l'API
echo $NEXT_PUBLIC_API_URL
# Devrait afficher : https://smpdev02.local:3000
```

**Si vide ou incorrect :**
1. Vérifier le fichier `.env.local` :
   ```env
   NEXT_PUBLIC_API_URL=https://smpdev02.local:3000
   ```

2. Redémarrer le serveur Next.js :
   ```bash
   pnpm dev
   ```

---

## ✅ Checklist de débogage

### Vérifications frontend :
- [ ] Les logs `[TRACKING_LINK]` apparaissent dans la console serveur (terminal)
- [ ] Le token est correctement extrait (`token: iwFFSa`)
- [ ] L'URL API est correcte (`https://smpdev02.local:3000`)
- [ ] Les données du visiteur sont collectées (browser, os, device)

### Vérifications backend :
- [ ] L'endpoint `POST /api/tracking-links/:token/click` existe
- [ ] Le serveur backend est démarré et accessible
- [ ] Le lien avec token `iwFFSa` existe dans la DB
- [ ] Le lien est actif (`isActive = true`)
- [ ] Le lien a une `originalUrl` définie

### Vérifications réseau :
- [ ] Le frontend peut joindre le backend (pas d'erreur CORS)
- [ ] Le certificat SSL est valide (si HTTPS)
- [ ] `NEXT_PUBLIC_API_URL` est définie et correcte

---

## 🚀 Prochaines étapes

### 1. Récupérer les logs
Visitez `https://smpdev02.local:3100/l/iwFFSa` et partagez les logs du terminal serveur (là où `pnpm dev` tourne).

### 2. Identifier le problème
Les logs vont révéler exactement où ça bloque :
- ❌ **404 sur l'API** → Le token n'existe pas ou l'endpoint backend manque
- ❌ **500 sur l'API** → Erreur backend (DB, validation, etc.)
- ❌ **URL null** → Format de réponse incorrect
- ❌ **Exception fetch** → Problème réseau/CORS

### 3. Appliquer la solution
Selon le problème identifié, appliquer la solution correspondante du guide ci-dessus.

---

**Date:** 2025-11-21
**Status:** ⏳ **EN ATTENTE DE LOGS**
**Prochaine étape:** Visitez `/l/iwFFSa` et partagez les logs du terminal serveur Next.js
