# Plan de Rollback - Système de Notifications

## Vue d'ensemble

Ce document décrit comment désactiver ou rollback le système de notifications si nécessaire.

**IMPORTANT:** Le système de notifications est conçu avec un fallback gracieux. Il ne devrait JAMAIS crasher l'application, même en cas de problème.

## Niveaux de Rollback

### Niveau 1: Désactiver Firebase Push (Conserver WebSocket)

**Quand l'utiliser:**
- Firebase pose des problèmes
- Quota Firebase dépassé
- Credentials Firebase compromis

**Actions:**
```bash
# Option A: Via variables d'environnement
ENABLE_PUSH_NOTIFICATIONS=false

# Option B: Supprimer le fichier credentials
rm gateway/secrets/firebase-admin.json

# Option C: Commenter la variable
# FIREBASE_ADMIN_CREDENTIALS_PATH=./secrets/firebase-admin.json
```

**Résultat:**
- ✅ Notifications WebSocket continuent de fonctionner
- ✅ Notifications in-app continuent
- ❌ Push notifications mobiles/web désactivées
- ✅ Aucun crash, logs clairs

**Vérification:**
```bash
# Vérifier les logs au démarrage
pnpm dev

# Doit afficher:
# [Notifications] → Push notifications DISABLED (WebSocket only)
```

### Niveau 2: Désactiver Complètement les Notifications

**Quand l'utiliser:**
- Problème critique dans NotificationService
- Charge système trop élevée
- Debug nécessaire

**Actions:**
```bash
# Ajouter dans .env
ENABLE_NOTIFICATION_SYSTEM=false
```

**Modifications code (si ENABLE_NOTIFICATION_SYSTEM supporté):**
```typescript
// Dans server.ts ou SocketIOManager
if (process.env.ENABLE_NOTIFICATION_SYSTEM !== 'false') {
  this.notificationService = new NotificationService(this.prisma);
  this.notificationService.setSocketIO(io, userSocketsMap);
}
```

**Résultat:**
- ❌ Notifications WebSocket désactivées
- ❌ Notifications Firebase désactivées
- ✅ Application continue de fonctionner normalement
- ✅ Conversations et messages fonctionnent

**Impact utilisateur:**
- Pas de notifications pour nouveaux messages
- Pas de compteur de notifications non lues
- Fonctionnalités principales (chat, appels) NON affectées

### Niveau 3: Rollback du Code

**Quand l'utiliser:**
- Bug critique dans le code modifié
- Régression détectée
- Rollback complet nécessaire

**Fichiers à restaurer:**

1. **NotificationService.ts**
   ```bash
   # Restaurer depuis git (si commit précédent disponible)
   git checkout HEAD~1 -- gateway/src/services/NotificationService.ts
   ```

2. **.env.example**
   ```bash
   # Supprimer les lignes ajoutées (79-94)
   git checkout HEAD~1 -- gateway/.env.example
   ```

3. **package.json**
   ```bash
   # Désinstaller firebase-admin
   pnpm remove firebase-admin --filter ./gateway
   ```

**Vérification post-rollback:**
```bash
# 1. Rebuild
pnpm run build

# 2. Démarrer
pnpm dev

# 3. Vérifier qu'il n'y a pas d'erreurs liées à Firebase
```

### Niveau 4: Rollback Git Complet

**Quand l'utiliser:**
- Rollback d'urgence nécessaire
- Tous les autres niveaux ont échoué

**Actions:**
```bash
# 1. Identifier le commit avant l'intégration
git log --oneline

# 2. Créer une branche de sauvegarde
git branch backup-notifications

# 3. Rollback
git reset --hard <commit-hash-avant-integration>

# 4. Force push (ATTENTION: coordination équipe nécessaire)
git push --force origin dev
```

**⚠️ ATTENTION:** Coordination avec l'équipe obligatoire avant force push!

## Commandes de Debug

### Vérifier l'état Firebase
```bash
# Dans Node.js REPL ou script de test
const fs = require('fs');
const credPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;

console.log('Credentials path:', credPath);
console.log('File exists:', fs.existsSync(credPath));

if (fs.existsSync(credPath)) {
  const content = fs.readFileSync(credPath, 'utf8');
  const json = JSON.parse(content);
  console.log('Project ID:', json.project_id);
}
```

### Vérifier les métriques NotificationService
```bash
# Ajouter une route de debug temporaire
GET /api/notifications/debug/metrics

# Réponse:
{
  "notificationsCreated": 42,
  "webSocketSent": 38,
  "firebaseSent": 12,
  "firebaseFailed": 2,
  "firebaseEnabled": true
}
```

### Logs à Surveiller
```bash
# Tail des logs en production
tail -f logs/combined.log | grep Notifications

# Chercher les erreurs
grep -i "error.*notification" logs/error.log
```

## Procédures d'Urgence

### Urgence 1: Application ne démarre pas
**Cause probable:** Erreur dans NotificationService

**Solution immédiate:**
```bash
# 1. Désactiver complètement
ENABLE_NOTIFICATION_SYSTEM=false

# 2. Redémarrer
pm2 restart meeshy-gateway

# 3. Vérifier
curl http://localhost:3000/health
```

### Urgence 2: Quotas Firebase dépassés
**Cause:** Trop de push notifications envoyées

**Solution immédiate:**
```bash
# 1. Désactiver Firebase push
ENABLE_PUSH_NOTIFICATIONS=false

# 2. Ou supprimer credentials
rm gateway/secrets/firebase-admin.json

# 3. Redémarrer
pm2 restart meeshy-gateway

# 4. Notifications WebSocket continuent de fonctionner
```

### Urgence 3: Credentials Firebase compromis
**Cause:** Fuite de sécurité

**Actions:**
1. **Immédiat:**
   ```bash
   # Supprimer le fichier
   rm gateway/secrets/firebase-admin.json

   # Restart
   pm2 restart meeshy-gateway
   ```

2. **Firebase Console:**
   - Révoquer l'ancien service account
   - Générer nouveau credentials
   - Déployer nouvelles credentials sécurisées

3. **Git:**
   ```bash
   # Vérifier que jamais committé
   git log --all --full-history -- "*firebase*.json"

   # Si trouvé, nettoyer l'historique (avancé)
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch secrets/firebase-admin.json" \
     --prune-empty --tag-name-filter cat -- --all
   ```

## Tests Post-Rollback

### Test 1: Application démarre
```bash
pnpm dev
# Doit démarrer sans erreurs
```

### Test 2: Routes fonctionnent
```bash
# Health check
curl http://localhost:3000/health

# Doit retourner 200 OK
```

### Test 3: Conversations fonctionnent
```bash
# Envoyer un message
# Via l'interface frontend ou API

# Vérifier:
# - Message envoyé ✅
# - Message reçu ✅
# - Pas de crash ✅
```

### Test 4: WebSocket fonctionne
```bash
# Se connecter via frontend
# Vérifier dans les logs:
# "Socket.IO initialized"
# "User connected"
```

## Checklist de Rollback

- [ ] Backup du code actuel créé
- [ ] Équipe notifiée du rollback
- [ ] Niveau de rollback choisi (1, 2, 3, ou 4)
- [ ] Variables d'environnement mises à jour
- [ ] Application redémarrée
- [ ] Health check réussi
- [ ] Routes testées
- [ ] Fonctionnalités critiques testées
- [ ] Logs vérifiés (pas d'erreurs)
- [ ] Équipe notifiée du succès du rollback
- [ ] Post-mortem planifié

## Contact d'Urgence

En cas de problème critique:
1. Désactiver via variables d'environnement (Niveau 1 ou 2)
2. Contacter l'équipe backend
3. Ne PAS supprimer le code sans backup
4. Documenter le problème pour post-mortem

## Notes Importantes

### Sécurité
- ✅ **JAMAIS** committer `secrets/firebase-admin.json`
- ✅ **TOUJOURS** vérifier `.gitignore` avant commit
- ✅ **TOUJOURS** utiliser variables d'environnement pour credentials

### Fallback Gracieux
Le système est conçu pour:
- ✅ Ne **JAMAIS** crasher si Firebase manquant
- ✅ Logger clairement l'état Firebase
- ✅ Continuer avec WebSocket si Firebase échoue
- ✅ Fonctionner 100% sans Firebase

### Monitoring
En production, surveiller:
- Logs d'erreur Firebase
- Métriques de notifications
- Taux d'échec Firebase
- Latence des notifications

## Historique des Rollbacks

| Date | Raison | Niveau | Résultat | Notes |
|------|--------|--------|----------|-------|
| - | - | - | - | Aucun rollback à ce jour |

---

**Dernière mise à jour:** 2025-11-22
**Responsable:** Backend Team
**Version:** 1.0.0
