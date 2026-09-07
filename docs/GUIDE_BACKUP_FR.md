# 💾 Guide Rapide : Backups Automatiques

## ✅ Vos données sont maintenant protégées !

Le système de backup automatique **sauvegarde vos données AVANT chaque déploiement** et conserve les **3 derniers backups**.

## 🚀 Utilisation Simple

### Déployer (avec backup automatique)

```bash
# Le backup se fait automatiquement AVANT le déploiement
./meeshy.sh deploy deploy 192.168.1.100
```

**Le système fait** :
1. ✅ Validation de la configuration
2. 💾 **BACKUP AUTOMATIQUE** (vos données sont sauvegardées)
3. ✅ Déploiement de la nouvelle version

### Créer un Backup Manuel

```bash
# Sur votre machine locale
./meeshy.sh prod backup

# Sur le serveur distant
./meeshy.sh deploy backup 192.168.1.100
```

### Lister les Backups Disponibles

```bash
./meeshy.sh prod list-backups
```

Affiche :
```
Backups disponibles dans /path/to/backups:

  • pre-update-20241019_143022.tar.gz (245M) - Oct 19 14:30
  • pre-update-20241019_150145.tar.gz (248M) - Oct 19 15:01
  • pre-update-20241019_163012.tar.gz (251M) - Oct 19 16:30
```

### Restaurer un Backup

```bash
# Méthode interactive (recommandée)
./meeshy.sh prod restore

# Ou spécifier directement le fichier
./meeshy.sh prod restore /path/to/backups/pre-update-20241019_143022.tar.gz
```

**Le système vous demandera** :
```
⚠️  ATTENTION: Cette opération va restaurer les données depuis le backup
⚠️  Les données actuelles seront écrasées

Voulez-vous continuer? (tapez 'OUI' pour confirmer):
```

Tapez `OUI` pour confirmer la restauration.

## 🛡️ Protection Automatique

### Les 3 Derniers Backups

Le système conserve automatiquement les **3 derniers backups** :

- Backup le plus récent (aujourd'hui 16:30)
- Backup précédent (aujourd'hui 15:01)
- Backup encore avant (aujourd'hui 14:30)

Les backups plus anciens sont **automatiquement supprimés** pour économiser l'espace disque.

### Espace Disque Utilisé

Typiquement, **3 backups = 1 à 3 GB** (selon la taille de vos données).

## 🚨 En Cas de Problème

### Si vous perdez des données après un upload

```bash
# 1. Arrêter les services
./meeshy.sh prod stop

# 2. Voir les backups disponibles
./meeshy.sh prod list-backups

# 3. Restaurer le dernier backup
./meeshy.sh prod restore

# 4. Taper "OUI" pour confirmer

# 5. Redémarrer les services
cd /opt/meeshy && docker-compose restart
```

### Restauration Complète en 4 Étapes

1. **Arrêt** : `./meeshy.sh prod stop`
2. **Restauration** : `./meeshy.sh prod restore`
3. **Confirmation** : Taper `OUI`
4. **Redémarrage** : `docker-compose restart`

## 📊 Ce Qui Est Sauvegardé

### Backup de Base de Données (rapide)
- ✅ Base de données MongoDB complète
- ✅ Toutes les conversations et messages
- ✅ Tous les utilisateurs et paramètres
- Temps : ~30 secondes

### Backup Complet (si reset)
- ✅ Base de données MongoDB
- ✅ Uploads (avatars, fichiers)
- ✅ Cache Redis (traductions)
- ✅ Modèles ML
- ✅ Configuration système
- Temps : ~2-3 minutes

## ⚙️ Options Avancées

### Désactiver le Backup (NON RECOMMANDÉ)

```bash
# ⚠️ RISQUE DE PERTE DE DONNÉES !
./meeshy.sh deploy deploy 192.168.1.100 --skip-backup
```

> **Ne faites ceci que si vous savez ce que vous faites !**

### Backup Distant (sur le serveur)

```bash
# Créer un backup sur le serveur
./meeshy.sh deploy backup 192.168.1.100

# Restaurer depuis le serveur
./meeshy.sh deploy restore 192.168.1.100
```

## 📁 Où Sont les Backups ?

### Sur Votre Machine Locale

```
/Users/smpceo/Documents/Services/Meeshy/meeshy/backups/
```

### Sur le Serveur de Production

```
/opt/meeshy/backups/
```

## ✨ Exemples Pratiques

### Exemple 1 : Déploiement Normal

```bash
# Le backup se fait automatiquement !
./meeshy.sh deploy deploy 192.168.1.100
```

**Sortie** :
```
ℹ️  Étape 0/8: Validation de la configuration
✅ Configuration validée avec succès
ℹ️  Étape 1/8: 💾 Backup automatique pré-déploiement
⚠️  🛡️  Protection des données: sauvegarde avant modifications
✅ Backup pré-déploiement créé avec succès
ℹ️  Étape 2/8: Test de connexion SSH
...
```

### Exemple 2 : Restauration d'Urgence

```bash
# Vous venez de perdre des données après un upload
./meeshy.sh prod stop
./meeshy.sh prod restore

# Le système affiche les backups disponibles
# Choisissez le backup le plus récent
# Tapez "OUI" pour confirmer

# Redémarrez
cd /opt/meeshy && docker-compose restart
```

### Exemple 3 : Vérification Régulière

```bash
# Voir quels backups existent
./meeshy.sh prod list-backups

# Créer un backup manuel avant une opération risquée
./meeshy.sh prod backup

# Continuer avec l'opération risquée...
```

## 🎯 Bonnes Pratiques

1. **NE JAMAIS utiliser `--skip-backup`** sauf si absolument nécessaire
2. **Vérifier régulièrement** que les backups existent : `./meeshy.sh prod list-backups`
3. **Tester une restauration** au moins une fois pour s'assurer que ça fonctionne
4. **Créer un backup manuel** avant toute modification importante
5. **Surveiller l'espace disque** : `df -h`

## 📞 Besoin d'Aide ?

### Vérifier si les backups fonctionnent

```bash
# Créer un backup de test
./meeshy.sh prod backup

# Vérifier qu'il existe
./meeshy.sh prod list-backups

# Vous devriez voir le nouveau backup dans la liste !
```

### En cas de problème

1. Vérifier l'espace disque : `df -h`
2. Vérifier que Docker fonctionne : `docker ps`
3. Consulter les logs : `./meeshy.sh prod logs`
4. Contacter le support technique

## 🔒 Sécurité

- Les backups contiennent **toutes vos données** (conversations, utilisateurs, uploads)
- Gardez les backups dans un **endroit sécurisé**
- **Ne partagez jamais** vos fichiers de backup publiquement
- Considérez **chiffrer** les backups sensibles avec `gpg -c`

## 📝 Résumé

| Action | Commande |
|--------|----------|
| Déployer avec backup auto | `./meeshy.sh deploy deploy IP` |
| Backup manuel | `./meeshy.sh prod backup` |
| Lister les backups | `./meeshy.sh prod list-backups` |
| Restaurer | `./meeshy.sh prod restore` |
| Restaurer un fichier spécifique | `./meeshy.sh prod restore /path/to/backup.tar.gz` |

---

**🎉 Vos données sont maintenant protégées !**

Chaque déploiement crée automatiquement un backup. Vous avez toujours les 3 dernières versions de vos données pour une restauration rapide en cas de problème.

