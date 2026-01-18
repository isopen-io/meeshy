# Configuration du Polling ZMQ

**Date** : 2026-01-18
**Service** : gateway
**Composant** : ZmqConnectionPool

## 🎯 À Quoi Sert le Heartbeat ?

Le **heartbeat** du `ZmqConnectionPool` vérifie que :
1. ✅ La boucle de polling ZMQ est **active**
2. ✅ Le client écoute bien les **messages du service translator**
3. ✅ Aucun **blocage** n'est survenu dans la communication

---

## ⚙️ Configuration

### Variables d'Environnement

```bash
# Intervalle de polling ZMQ (en millisecondes)
ZMQ_POLL_INTERVAL_MS=500  # Par défaut: 500ms (2 fois/sec)
```

### Fréquences Recommandées

| Environnement | Intervalle | Fréquence | Usage |
|---------------|------------|-----------|-------|
| **Development** | 500ms | 2/sec | Équilibre debug/performance |
| **Production** | 500-1000ms | 1-2/sec | Performance optimale |
| **Haute charge** | 1000ms | 1/sec | Économie de CPU |
| **Faible latence** | 200-300ms | 3-5/sec | Réactivité maximale |

---

## 📊 Impact des Modifications

### AVANT (Problématique)

```typescript
pollIntervalMs: 100  // Hardcodé à 100ms
```

**Impact** :
- ❌ **10 polling/seconde** = très agressif
- ❌ Logs de heartbeat **toutes les 5 secondes**
- ❌ Consommation CPU **inutile**
- ❌ Logs pollués en production

### APRÈS (Optimisé)

```typescript
pollIntervalMs: parseInt(process.env.ZMQ_POLL_INTERVAL_MS || '500')
```

**Impact** :
- ✅ **2 polling/seconde** = équilibré
- ✅ Heartbeat log **uniquement en development**
- ✅ Heartbeat log **toutes les 5 minutes** (600 itérations × 500ms)
- ✅ CPU économisé
- ✅ Logs propres en production

---

## 🔍 Calculs de Fréquence

### Avec `ZMQ_POLL_INTERVAL_MS=500` (par défaut)

```
Polling : 500ms = 2 fois/seconde
Heartbeat : 600 itérations × 500ms = 300 secondes = 5 minutes
```

**Logs de heartbeat** :
```
[ConnectionPool] Polling active (heartbeat 0)      # Au démarrage
[ConnectionPool] Polling active (heartbeat 600)    # Après 5 minutes
[ConnectionPool] Polling active (heartbeat 1200)   # Après 10 minutes
```

### Avec `ZMQ_POLL_INTERVAL_MS=1000` (production haute charge)

```
Polling : 1000ms = 1 fois/seconde
Heartbeat : 600 itérations × 1000ms = 600 secondes = 10 minutes
```

---

## 🚀 Configuration Recommandée

### `.env` (Development)

```bash
# Gateway
ZMQ_POLL_INTERVAL_MS=500
NODE_ENV=development
```

### `.env.production` (Production)

```bash
# Gateway
ZMQ_POLL_INTERVAL_MS=1000
NODE_ENV=production
```

---

## 🐛 Debugging

### Activer les logs de heartbeat en production

Si vous devez déboguer un problème de connexion ZMQ en production :

```bash
# Temporairement
NODE_ENV=development npm start
```

**OU** modifier le code temporairement :

```typescript
// ZmqConnectionPool.ts ligne 92
if (this.heartbeatCount % 100 === 0) {  // Log toutes les 50 secondes
  console.log(`[ConnectionPool] Polling active (heartbeat ${this.heartbeatCount})`);
}
```

### Vérifier la santé de la connexion

```bash
# Vérifier les logs
grep "Polling active" logs/gateway.log

# Vérifier les ports ZMQ
lsof -i :5555  # PUSH
lsof -i :5558  # SUB

# Tester la connexion
curl http://localhost:3000/api/v1/translator/health
```

---

## 📝 Bonnes Pratiques

### ✅ DO

- Utiliser `ZMQ_POLL_INTERVAL_MS` pour ajuster selon la charge
- Réduire l'intervalle (200-300ms) pour des traductions temps-réel
- Augmenter l'intervalle (1000ms+) pour économiser le CPU en prod

### ❌ DON'T

- Ne pas descendre sous **100ms** (trop agressif)
- Ne pas dépasser **5000ms** (perte de réactivité)
- Ne pas logger le heartbeat en production sans raison

---

## 🔧 Fichiers Modifiés

1. **`src/services/zmq-translation/ZmqTranslationClient.ts:98`**
   - Ajout de `process.env.ZMQ_POLL_INTERVAL_MS`
   - Valeur par défaut : 500ms

2. **`src/services/zmq-translation/ZmqConnectionPool.ts:92`**
   - Heartbeat désactivé en production
   - Fréquence réduite : toutes les 5 minutes en dev

---

## 📊 Monitoring

### Métriques à Surveiller

```typescript
// Stats disponibles via connectionPool.getStats()
{
  pushConnected: boolean,
  subConnected: boolean,
  messagesReceived: number,
  messagesSent: number,
  lastActivityTimestamp: number
}
```

### Alertes Recommandées

- ⚠️ **lastActivityTimestamp** > 30 secondes → Connexion potentiellement bloquée
- ⚠️ **messagesReceived = 0** après 5 minutes → Service translator down
- ⚠️ **pushConnected = false** → Impossible d'envoyer des requêtes

---

## ✅ Validation

Après redémarrage du gateway :

```bash
# 1. Vérifier que le polling est configuré
grep "ZMQ_POLL_INTERVAL_MS" .env

# 2. Démarrer le gateway
npm run dev

# 3. Observer les logs
# En dev : heartbeat toutes les 5 minutes
# En prod : pas de heartbeat (silencieux)

# 4. Tester une traduction
curl -X POST http://localhost:3000/api/v1/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello", "source_lang": "en", "target_lang": "fr"}'
```

---

## 🔄 Rollback

Si les changements causent des problèmes, revenir à l'ancien comportement :

```bash
# .env
ZMQ_POLL_INTERVAL_MS=100
```

Ou dans le code :

```typescript
// ZmqTranslationClient.ts:98
pollIntervalMs: 100  // Restaurer hardcodé
```
