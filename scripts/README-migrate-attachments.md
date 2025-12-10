# Migration des URLs d'Attachements vers Chemins Relatifs

## 🎯 Objectif

Ce script transforme toutes les URLs complètes d'attachements stockées en base de données en chemins relatifs. Cela permet au frontend de construire l'URL dynamiquement selon le domaine utilisé (localhost, IP locale, domaine de production, etc.).

## 📋 Avant la migration

### URLs actuelles (absolues):
```
http://localhost:3000/api/attachments/file/2024/11/userId/photo.jpg
https://smpdev02.local:3000/api/attachments/file/2024/11/userId/document.pdf
https://gate.meeshy.me/api/attachments/file/2024/11/userId/video.mp4
```

### URLs après migration (relatives):
```
/api/attachments/file/2024/11/userId/photo.jpg
/api/attachments/file/2024/11/userId/document.pdf
/api/attachments/file/2024/11/userId/video.mp4
```

## ✅ Avantages

1. **Flexibilité multi-domaine**: Les mêmes données fonctionnent sur localhost, IP locale, et production
2. **Pas de migration nécessaire** lors du changement de domaine
3. **URLs construites dynamiquement** par le frontend selon le contexte
4. **Compatibilité backward**: Le système gère aussi les anciennes URLs complètes

## 🚀 Exécution du script

### Étape 1: Vérification de la base de données

Avant d'exécuter la migration, vérifiez l'état actuel:

```bash
mongosh mongodb://localhost:27017/meeshy --eval "db.MessageAttachment.countDocuments({ fileUrl: { \$regex: /^https?:\/\// } })"
```

### Étape 2: Exécution du script de migration

**Pour MongoDB local (développement):**
```bash
mongosh mongodb://localhost:27017/meeshy --file scripts/migrate-attachment-urls-to-relative.js
```

**Pour MongoDB avec replica set (développement local):**
```bash
mongosh "mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" --file scripts/migrate-attachment-urls-to-relative.js
```

**Pour MongoDB en production:**
```bash
# Adapter la connexion selon votre configuration
mongosh "mongodb://user:password@prod-server:27017/meeshy" --file scripts/migrate-attachment-urls-to-relative.js
```

### Étape 3: Vérification post-migration

Vérifier qu'il ne reste plus d'URLs absolues:

```bash
mongosh mongodb://localhost:27017/meeshy --eval "
  print('Attachments avec URLs absolues restantes:');
  printjson(db.MessageAttachment.countDocuments({
    \$or: [
      { fileUrl: { \$regex: /^https?:\/\// } },
      { thumbnailUrl: { \$regex: /^https?:\/\// } }
    ]
  }));
"
```

Devrait retourner `0` si la migration est réussie.

## 📊 Sortie du script

Le script affiche:
- Nombre total d'attachements analysés
- Nombre d'attachements mis à jour
- Nombre d'attachements déjà relatifs
- Détails des modifications (fileUrl et/ou thumbnailUrl)
- Exemples d'URLs après migration
- Avertissement si des URLs absolues persistent

Exemple de sortie:
```
🚀 Démarrage de la migration des URLs d'attachments...

📊 Analyse des attachments:
Total attachments: 1234

✅ [1/1234] photo_vacation.jpg
   fileUrl: http://localhost:3000/api/attachments/file/2024/11/user123/photo.jpg → /api/attachments/file/2024/11/user123/photo.jpg
   thumbnailUrl: http://localhost:3000/api/attachments/file/2024/11/user123/photo_thumb.jpg → /api/attachments/file/2024/11/user123/photo_thumb.jpg
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Résumé de la migration:

  ✅ Attachments mis à jour: 856
     - fileUrl modifiées: 856
     - thumbnailUrl modifiées: 342
     - Les deux modifiées: 342
  ⏭️  Attachments déjà relatifs: 378
  ⏭️  Total ignorés: 378
  ❌ Erreurs: 0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Parfait! Toutes les URLs sont maintenant relatives.

✨ Migration terminée avec succès!
```

## 🔄 Compatibilité backward

Le système continue de fonctionner avec les anciennes URLs complètes grâce à la méthode `buildFullUrl()` dans `AttachmentService.ts`:

```typescript
buildFullUrl(relativePath: string): string {
  // Si c'est déjà une URL complète (anciennes données), la retourner telle quelle
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  // Sinon, construire l'URL complète avec le domaine actuel
  return `${this.publicUrl}${relativePath}`;
}
```

## ⚠️ Remarques importantes

1. **Backup recommandé**: Effectuer un backup de la base de données avant la migration
2. **Environnement de test**: Tester d'abord sur un environnement de développement
3. **Vérification**: Vérifier quelques attachements manuellement après la migration
4. **Nouveaux uploads**: Les nouveaux fichiers uploadés après le déploiement utilisent automatiquement les chemins relatifs

## 🛠️ Rollback (si nécessaire)

Si vous devez revenir en arrière, vous pouvez reconstruire les URLs avec:

```javascript
// Script de rollback (à adapter selon votre domaine)
db.MessageAttachment.find({ fileUrl: { $regex: /^\/api/ } }).forEach(att => {
  const baseUrl = 'https://gate.meeshy.me'; // Adapter selon l'environnement
  db.MessageAttachment.updateOne(
    { _id: att._id },
    {
      $set: {
        fileUrl: att.fileUrl.startsWith('/') ? baseUrl + att.fileUrl : att.fileUrl,
        thumbnailUrl: att.thumbnailUrl && att.thumbnailUrl.startsWith('/')
          ? baseUrl + att.thumbnailUrl
          : att.thumbnailUrl
      }
    }
  );
});
```

## 📝 Modifications associées

Les fichiers suivants ont été modifiés pour supporter les chemins relatifs:

1. **gateway/src/services/AttachmentService.ts**
   - Ajout de `getAttachmentPath()`: génère chemins relatifs
   - Ajout de `buildFullUrl()`: construit URLs complètes à la volée
   - Modification de `uploadFile()`: stocke chemins relatifs en DB

2. **frontend** (selon votre implémentation)
   - Construction dynamique des URLs d'attachements
   - Utilisation de `NEXT_PUBLIC_BACKEND_URL` ou domaine courant

## 📞 Support

En cas de problème:
1. Vérifier les logs du script
2. Consulter les exemples d'URLs affichés
3. Vérifier la configuration de `PUBLIC_URL` dans `.env`
4. Contacter l'équipe de développement si nécessaire
