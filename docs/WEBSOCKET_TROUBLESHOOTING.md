# WebSocket et Traductions - Guide de dépannage

## Problèmes identifiés et solutions

### 1. ❌ "Socket connecté mais pas prêt" lors de l'envoi de messages

#### Cause
Le frontend attend l'événement `AUTHENTICATED` du backend pour confirmer l'authentification, mais le backend ne l'émet pas toujours (notamment après redémarrage).

#### Solution immédiate
✅ **Correction appliquée** : Le frontend vérifie maintenant `socket.connected` au lieu de bloquer strictement sur `isConnected`.

#### Solution complète
**Redémarrer le gateway** pour que les événements `AUTHENTICATED` soient émis correctement :

```bash
# Option 1: Redémarrer via script
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/gateway
./gateway.sh

# Option 2: Redémarrer via Docker
cd /Users/smpceo/Documents/Services/Meeshy/meeshy
docker-compose restart gateway

# Option 3: Redémarrer tous les services
./start-dev.sh
```

#### Vérification
Après redémarrage, vous devriez voir dans les logs frontend :
```
✅ Authentification confirmée par le serveur
```

---

### 2. ❌ Pas de réception de traductions

#### Causes possibles

1. **Le service de traduction n'est pas démarré**
   ```bash
   # Vérifier si le translator est actif
   docker-compose ps translator
   
   # Redémarrer si nécessaire
   docker-compose restart translator
   ```

2. **Le gateway n'envoie pas les requêtes au translator**
   - Vérifier les logs du gateway pour voir si les requêtes de traduction sont envoyées
   - Vérifier la configuration ZeroMQ entre gateway et translator

3. **Le message n'a pas de traduction en cache**
   - Les traductions sont créées à la volée lors de l'envoi des messages
   - Si vous demandez une traduction pour un vieux message, elle peut ne pas exister

#### Solution
```bash
# 1. Redémarrer le translator
docker-compose restart translator

# 2. Redémarrer le gateway
docker-compose restart gateway

# 3. Vérifier les logs
docker-compose logs -f translator
docker-compose logs -f gateway
```

#### Vérification
Envoyez un nouveau message et vérifiez dans les logs du gateway :
```
🌍 Demande de traduction: [messageId] -> [langue]
✅ Traduction envoyée: [messageId] -> [langue]
```

---

### 3. ⚠️ Clé de traduction manquante

#### Problème résolu
La clé `bubbleStream.connectingWebSocket` existe déjà dans :
- ✅ `/apps/web/locales/en/bubbleStream.json` (ligne 19)
- ✅ `/apps/web/locales/fr/bubbleStream.json` (ligne 19)

Si vous voyez encore la clé brute, c'est probablement un problème de cache navigateur.

#### Solution
```bash
# Vider le cache du navigateur
# OU
# Recharger la page avec Cmd+Shift+R (Mac) ou Ctrl+Shift+R (Windows/Linux)
```

---

## Checklist de dépannage rapide

- [ ] Le gateway est-il démarré et accessible ?
- [ ] Le translator est-il démarré et accessible ?
- [ ] Les logs du gateway montrent-ils l'événement `AUTHENTICATED` après connexion ?
- [ ] Les logs du frontend montrent-ils "✅ Authentification confirmée" ?
- [ ] Le cache du navigateur a-t-il été vidé ?
- [ ] Les services ont-ils été redémarrés depuis les dernières modifications ?

---

## Commandes utiles

```bash
# Voir tous les services actifs
docker-compose ps

# Voir les logs en temps réel
docker-compose logs -f gateway translator

# Redémarrer un service spécifique
docker-compose restart gateway
docker-compose restart translator

# Redémarrer tous les services
docker-compose restart

# Vérifier la santé du gateway
curl http://localhost:3000/health

# Vérifier la santé du translator
curl http://localhost:5000/health
```

---

## Améliorations apportées

### Frontend
✅ Logique de fallback pour `socket.connected`  
✅ Meilleure gestion des erreurs d'authentification  
✅ Warnings au lieu de blocages stricts  

### Backend
✅ Émission de l'événement `AUTHENTICATED` après auth automatique  
✅ Support des utilisateurs authentifiés et anonymes  
✅ Gestion correcte des multi-onglets  

---

## Notes techniques

### Flow d'authentification WebSocket

```
1. Frontend: new Socket(url, { auth: { token } })
2. Backend: Reçoit connexion avec headers
3. Backend: Authentifie via JWT ou session token
4. Backend: Émet SERVER_EVENTS.AUTHENTICATED ⬅️ IMPORTANT
5. Frontend: Reçoit AUTHENTICATED, met isConnected = true
6. Frontend: Peut maintenant envoyer des messages
```

### Flow de traduction

```
1. Frontend: Demande traduction (CLIENT_EVENTS.REQUEST_TRANSLATION)
2. Gateway: Reçoit la demande
3. Gateway: Cherche dans cache/DB ou demande au translator
4. Gateway: Émet SERVER_EVENTS.TRANSLATION_RECEIVED
5. Frontend: Affiche la traduction
```

---

Date de création : 15 octobre 2025
Dernière mise à jour : 15 octobre 2025

