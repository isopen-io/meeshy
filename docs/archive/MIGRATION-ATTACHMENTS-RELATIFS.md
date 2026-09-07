# Migration des URLs d'Attachements - URLs Dynamiques

## 🎯 Problème résolu

Avant cette modification, les URLs d'attachements étaient stockées en dur dans la base de données avec le domaine complet :
- `http://localhost:3000/api/attachments/file/...` ❌
- `https://smpdev02.local:3000/api/attachments/file/...` ❌
- `https://gate.meeshy.me/api/attachments/file/...` ❌

**Conséquence** : Les URLs ne fonctionnaient pas lorsqu'on changeait de domaine (localhost → IP locale → production).

## ✅ Solution implémentée

Les URLs sont maintenant stockées comme **chemins relatifs** en base de données :
- `/api/attachments/file/2024/11/userId/photo.jpg` ✅

Le **frontend construit l'URL complète dynamiquement** selon son environnement :
- Localhost : `http://localhost:3000` + `/api/attachments/file/...`
- IP locale : `https://smpdev02.local:3000` + `/api/attachments/file/...`
- Production : `https://gate.meeshy.me` + `/api/attachments/file/...`

## 📋 Fichiers modifiés

### Backend (Gateway)

**1. `gateway/src/services/AttachmentService.ts`**
- ✅ `getAttachmentPath()` : Génère des chemins relatifs `/api/attachments/file/...`
- ✅ `buildFullUrl()` : Construit des URLs complètes à la volée (pour compatibilité)
- ✅ `uploadFile()` : Stocke maintenant des chemins relatifs en DB (lignes 526-527)

### Frontend

**2. `frontend/utils/attachment-url.ts`** (NOUVEAU)
```typescript
// Construit l'URL complète à partir d'un chemin relatif
export function buildAttachmentUrl(relativePath: string): string | null {
  // Si déjà une URL complète (anciennes données), retourner telle quelle
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }

  // Si chemin relatif, construire avec NEXT_PUBLIC_BACKEND_URL
  if (relativePath.startsWith('/')) {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    return `${backendUrl}${relativePath}`;
  }

  return relativePath;
}

// Construit les URLs pour un tableau d'attachements
export function buildAttachmentsUrls<T extends { fileUrl?: string; thumbnailUrl?: string }>(
  attachments: T[]
): Array<T & { fileUrl: string | null; thumbnailUrl: string | null }> {
  return attachments.map(buildAttachmentUrls);
}
```

**3. `frontend/components/attachments/MessageAttachments.tsx`**
```typescript
import { buildAttachmentsUrls } from '@/utils/attachment-url';

export const MessageAttachments = React.memo(function MessageAttachments({
  attachments,
  ...
}: MessageAttachmentsProps) {
  // Construire les URLs complètes des attachments à partir des chemins relatifs
  const attachmentsWithUrls = useMemo(() => {
    return buildAttachmentsUrls(attachments);
  }, [attachments]);

  // Utiliser attachmentsWithUrls au lieu de attachments partout dans le composant
  const imageAttachments = attachmentsWithUrls.filter(...);
  const videoAttachments = attachmentsWithUrls.filter(...);
  // ...
});
```

### Migration MongoDB

**4. `scripts/migrate-attachment-urls-to-relative.js`** (NOUVEAU)

Script qui transforme toutes les URLs absolues en chemins relatifs dans MongoDB.

**5. `scripts/README-migrate-attachments.md`** (NOUVEAU)

Guide complet d'exécution du script de migration.

## 🚀 Déploiement de la migration

### Étape 1 : Déployer le code

```bash
# Deployer le backend (gateway)
cd gateway
pnpm install
pnpm build

# Déployer le frontend
cd ../frontend
pnpm install
pnpm build
```

### Étape 2 : Exécuter le script de migration MongoDB

**⚠️ IMPORTANT : Faire un backup de la base de données avant !**

```bash
# Backup MongoDB
mongodump --uri="mongodb://localhost:27017/meeshy" --out=/backup/meeshy-$(date +%Y%m%d)

# Exécuter la migration
mongosh "mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true" \\
  --file scripts/migrate-attachment-urls-to-relative.js
```

**Sortie attendue :**
```
🚀 Démarrage de la migration des URLs d'attachments...

📊 Analyse des attachments:
Total attachments: 1234

✅ [1/1234] photo_vacation.jpg
   fileUrl: http://localhost:3000/api/attachments/file/... → /api/attachments/file/...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Résumé de la migration:
  ✅ Attachments mis à jour: 856
  ⏭️  Attachments déjà relatifs: 378
  ❌ Erreurs: 0

✅ Parfait! Toutes les URLs sont maintenant relatives.
```

### Étape 3 : Vérifier

```bash
# Vérifier qu'il ne reste plus d'URLs absolues
mongosh mongodb://localhost:27017/meeshy --eval "
  print('URLs absolues restantes:');
  printjson(db.MessageAttachment.countDocuments({
    \$or: [
      { fileUrl: { \$regex: /^https?:\/\// } },
      { thumbnailUrl: { \$regex: /^https?:\/\// } }
    ]
  }));
"
```

Devrait retourner **0**.

### Étape 4 : Redémarrer les services

```bash
# Redémarrer le gateway
pm2 restart gateway

# Redémarrer le frontend
pm2 restart frontend
```

## 🔍 Comment ça fonctionne

### Nouveaux uploads (après déploiement)

1. Utilisateur uploade un fichier
2. **Backend** stocke en DB : `/api/attachments/file/2024/11/userId/photo.jpg`
3. **Frontend** reçoit : `{ fileUrl: "/api/attachments/file/..." }`
4. **Frontend** construit : `https://smpdev02.local:3000/api/attachments/file/...`
5. **Navigateur** télécharge depuis l'URL complète ✅

### Anciens attachments (avant migration)

**Avant migration** :
- DB contient : `http://localhost:3000/api/attachments/file/...`
- Frontend détecte URL complète → utilise telle quelle
- ⚠️ Fonctionne seulement sur localhost

**Après migration** :
- DB contient : `/api/attachments/file/...`
- Frontend construit : `https://smpdev02.local:3000/api/attachments/file/...`
- ✅ Fonctionne partout !

## 🎁 Avantages

1. **Flexibilité multi-environnement**
   - localhost ✅
   - IP locale (smpdev02.local) ✅
   - Production (meeshy.me) ✅

2. **Pas de migration future**
   - Changement de domaine = modification de `NEXT_PUBLIC_BACKEND_URL` uniquement
   - Pas besoin de toucher la base de données

3. **Compatibilité backward**
   - Les anciennes URLs complètes (après migration) continuent de fonctionner
   - Transition en douceur

4. **Performance**
   - Construction d'URL une seule fois par composant (useMemo)
   - Pas de surcharge

## 📊 Configuration requise

### Frontend (.env)

```bash
# L'URL que le frontend utilise pour construire les URLs d'attachements
NEXT_PUBLIC_BACKEND_URL=https://smpdev02.local:3000

# Alternatives
# NEXT_PUBLIC_API_URL=https://smpdev02.local:3000
```

### Gateway (.env)

```bash
# L'URL publique du backend
PUBLIC_URL=https://smpdev02.local:3000

# Alternatives
# BACKEND_URL=https://smpdev02.local:3000
```

## 🐛 Dépannage

### Les images ne s'affichent pas

**Vérifier la configuration** :
```bash
# Frontend
echo $NEXT_PUBLIC_BACKEND_URL

# Gateway
echo $PUBLIC_URL
```

**Vérifier les URLs en DB** :
```bash
mongosh mongodb://localhost:27017/meeshy --eval "
  db.MessageAttachment.findOne({}, { fileUrl: 1, thumbnailUrl: 1 })
"
```

Si les URLs sont encore absolues, relancer la migration.

### Erreur de chargement d'images

**Vérifier dans le navigateur (DevTools > Network)** :
- URL complète construite : `https://smpdev02.local:3000/api/attachments/file/...`
- Code de réponse : 200 OK ✅ ou 404 Not Found ❌

Si 404, vérifier que le fichier physique existe sur le serveur.

## 📚 Références

- **Guide de migration** : `scripts/README-migrate-attachments.md`
- **Script de migration** : `scripts/migrate-attachment-urls-to-relative.js`
- **Fonction utilitaire** : `frontend/utils/attachment-url.ts`
- **Composant principal** : `frontend/components/attachments/MessageAttachments.tsx`
- **Service backend** : `gateway/src/services/AttachmentService.ts`

## ✅ Checklist de déploiement

- [ ] Backup de la base de données MongoDB
- [ ] Déploiement du backend (gateway) avec le nouveau code
- [ ] Déploiement du frontend avec le nouveau code
- [ ] Vérification des variables d'environnement (PUBLIC_URL, NEXT_PUBLIC_BACKEND_URL)
- [ ] Exécution du script de migration MongoDB
- [ ] Vérification qu'il ne reste plus d'URLs absolues
- [ ] Redémarrage des services
- [ ] Test d'upload d'un nouveau fichier
- [ ] Test d'affichage d'un ancien fichier
- [ ] Test sur localhost
- [ ] Test sur IP locale (smpdev02.local)
- [ ] Test en production (si applicable)

---

**Date de création** : 2025-11-19
**Auteur** : Claude Code
**Version** : 1.0
