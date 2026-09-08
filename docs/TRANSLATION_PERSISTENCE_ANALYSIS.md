# 📊 Analyse de la Persistance des Traductions - Meeshy

**Date**: 15 octobre 2025  
**Système**: Meeshy v1.0.39-alpha  
**Base de données**: MongoDB avec volumes Docker

---

## ✅ **Réponse Directe**

**NON, les traductions NE sont PAS supprimées lors des redémarrages ou mises à jour du système.**

Les traductions sont **persistées de manière permanente** dans MongoDB grâce aux volumes Docker et ne sont supprimées que dans des cas très spécifiques décrits ci-dessous.

---

## 🔍 **Architecture de Persistance**

### **1. Stockage des Traductions**

```yaml
# docker-compose.yml - Configuration des volumes
volumes:
  database_data:     # 💾 Contient toutes les données MongoDB (Messages + MessageTranslations)
  database_config:   # ⚙️ Configuration MongoDB
  redis_data:        # ⚡ Cache Redis (temporaire, purgeable)
  translator_models: # 🤖 Modèles ML (MT5, NLLB)
```

#### **Schéma Prisma - MessageTranslation**
```prisma
model MessageTranslation {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  messageId         String   @db.ObjectId
  sourceLanguage    String
  targetLanguage    String
  translatedContent String
  translationModel  String
  cacheKey          String   @unique
  confidenceScore   Float?
  createdAt         DateTime @default(now())
  
  message           Message  @relation(fields: [messageId], references: [id], onDelete: NoAction, onUpdate: NoAction)
}
```

---

## 🛡️ **Protection des Données**

### **A. Persistance Garantie**

| Scénario | Impact sur Traductions | Raison |
|----------|------------------------|---------|
| **Redémarrage conteneur** | ✅ **Aucun** | Volume `database_data` persisté |
| **Mise à jour image Gateway** | ✅ **Aucun** | Données hors conteneur |
| **Mise à jour image Translator** | ✅ **Aucun** | Données hors conteneur |
| **Mise à jour image Frontend** | ✅ **Aucun** | Frontend ne touche pas la BDD |
| **Redémarrage serveur** | ✅ **Aucun** | Volumes Docker persistés sur disque |
| **`docker-compose restart`** | ✅ **Aucun** | Volumes intacts |
| **`docker-compose down && up`** | ✅ **Aucun** | Volumes conservés |

### **B. Cas de Suppression (DANGER ⚠️)**

| Scénario | Impact | Commande |
|----------|--------|----------|
| **`FORCE_DB_RESET=true`** | ❌ **TOUT supprimé** | Variable d'environnement |
| **Suppression volume** | ❌ **TOUT supprimé** | `docker volume rm database_data` |
| **Purge manuelle admin** | ⚠️ **Traductions ciblées** | API admin `/admin/translations/clear` |

---

## 🔧 **Configuration Actuelle en Production**

### **Fichier: `env.production`**
```bash
# ===== CONFIGURATION INITIALISATION BASE DE DONNÉES =====
# Forcer la réinitialisation complète de la base de données au démarrage
# ATTENTION: Ceci supprimera TOUTES les données existantes !
FORCE_DB_RESET="false"  # ✅ Désactivé en production
```

### **Code: `gateway/src/services/init.service.ts`**
```typescript
async initializeDatabase(): Promise<void> {
  const forceReset = process.env.FORCE_DB_RESET === 'true';
  
  if (forceReset) {
    console.log('[INIT] 🔄 FORCE_DB_RESET=true détecté - Réinitialisation forcée...');
    await this.resetDatabase(); // ⚠️ DANGER: Supprime tout
  } else {
    console.log('[INIT] 🚀 Démarrage normal - Données conservées');
  }
}

private async resetDatabase(): Promise<void> {
  // Supprime dans l'ordre des dépendances
  await this.prisma.messageTranslation.deleteMany(); // ❌ Supprime toutes les traductions
  await this.prisma.message.deleteMany();
  await this.prisma.conversationMember.deleteMany();
  await this.prisma.conversation.deleteMany();
  await this.prisma.user.deleteMany();
}
```

---

## 📊 **Résultat de l'Analyse Production Actuelle**

### **État du Système (15 octobre 2025)**

```
📨 Total de messages: 45
🌐 Total de traductions: 0
📈 Ratio traductions/messages: 0.00
❌ 100% des messages sans traductions
```

### **Diagnostic**

Le problème actuel n'est **PAS** que les traductions sont supprimées, mais qu'**elles ne sont jamais créées** en premier lieu !

**Causes possibles:**
1. ❌ Service Translator non fonctionnel
2. ❌ Communication gRPC/ZMQ entre Gateway et Translator rompue
3. ❌ Les messages ne déclenchent pas de requêtes de traduction
4. ❌ Erreurs dans le service Translator qui empêchent la création

---

## 🔐 **Garanties de Sécurité des Données**

### **1. Volumes Docker Persistés**
```yaml
# Les volumes sont créés sur le disque hôte
# Chemin: /var/lib/docker/volumes/meeshy_database_data/_data
volumes:
  database_data:  # Survit aux redémarrages et mises à jour
```

### **2. Politique de Rétention**
- ✅ **Traductions conservées indéfiniment** (pas de TTL automatique)
- ✅ **Relation forte avec Message** via `messageId`
- ✅ **Suppression en cascade désactivée** (`onDelete: NoAction`)
- ✅ **Cache Redis séparé** (peut être purgé sans affecter MongoDB)

### **3. Sauvegardes Recommandées**
```bash
# Backup MongoDB
docker exec meeshy-database mongodump --out=/backup

# Backup volume
docker run --rm -v meeshy_database_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/database_backup.tar.gz /data
```

---

## 🚨 **Points d'Attention**

### **A. DANGER: Variables à NE JAMAIS activer en production**
```bash
FORCE_DB_RESET=true  # ❌ JAMAIS EN PRODUCTION !
```

### **B. Actions Sûres pour Mises à Jour**
```bash
# ✅ Mise à jour sans perte de données
cd /opt/meeshy
docker-compose pull                    # Télécharge nouvelles images
docker-compose up -d                   # Redémarre avec nouvelles images
# Les volumes database_data restent intacts

# ✅ Redémarrage propre
docker-compose restart gateway         # Redémarre uniquement le gateway
docker-compose restart translator      # Redémarre uniquement le translator
```

### **C. Nettoyage du Cache (Sans Affecter la BDD)**
```bash
# ✅ Purge Redis uniquement (cache temporaire)
docker exec meeshy-redis redis-cli FLUSHALL

# Les traductions dans MongoDB restent intactes
```

---

## 📝 **Recommandations**

### **1. Stratégie de Backup**
```bash
# Créer un cron job pour backup quotidien
0 2 * * * /opt/meeshy/scripts/backup-database.sh
```

### **2. Monitoring**
- ✅ Surveiller le ratio traductions/messages
- ✅ Alertes si ratio < 0.5 (moins de 0.5 traduction par message)
- ✅ Vérifier régulièrement la santé du Translator

### **3. Documentation**
- ✅ Documenter la procédure de mise à jour
- ✅ Lister les variables d'environnement dangereuses
- ✅ Créer un script de vérification post-déploiement

---

## ✅ **Conclusion**

### **Traductions et Redémarrages**
Les traductions sont **100% persistées** dans MongoDB via des volumes Docker et **ne sont jamais supprimées** lors de :
- ✅ Redémarrages de conteneurs
- ✅ Mises à jour d'images Docker
- ✅ Redémarrages du serveur
- ✅ `docker-compose down && up`

### **Seules Exceptions (Suppressions Intentionnelles)**
- ❌ `FORCE_DB_RESET=true` (désactivé en production)
- ❌ Suppression manuelle de volumes
- ❌ Purge admin via API

### **Problème Actuel**
Le vrai problème n'est **pas la suppression**, mais la **non-création** des traductions.  
Le service Translator doit être diagnostiqué pour identifier pourquoi aucune traduction n'est générée.

---

**Prochaine Étape Recommandée**: Diagnostic approfondi du service Translator pour identifier pourquoi les traductions ne sont pas créées.
