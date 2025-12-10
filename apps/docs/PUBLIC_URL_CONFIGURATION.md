# Configuration de PUBLIC_URL - Guide complet

## Problème

Les attachements (images, fichiers) doivent être accessibles via une URL publique HTTPS. Sans configuration correcte, les URLs peuvent pointer vers l'adresse interne du container Docker (`http://gateway:3000`) au lieu de l'URL publique (`https://gate.meeshy.me`).

## Solution pérenne

### 1. Configuration dans docker-compose.traefik.yml

Le fichier `docker-compose.traefik.yml` définit déjà la bonne configuration avec fallback:

```yaml
gateway:
  environment:
    - PUBLIC_URL=${PUBLIC_URL:-https://gate.${DOMAIN:-localhost}}
    - DOMAIN=${DOMAIN:-meeshy.me}
```

Cette configuration:
- Utilise `PUBLIC_URL` du fichier `.env` en priorité
- Si `PUBLIC_URL` n'est pas défini, utilise `https://gate.${DOMAIN}`
- Si `DOMAIN` n'est pas défini, utilise `localhost`

### 2. Configuration dans .env (Production)

Le fichier `/opt/meeshy/.env` doit contenir (SANS guillemets):

```env
DOMAIN=meeshy.me
PUBLIC_URL=https://gate.meeshy.me
```

**IMPORTANT:** Les guillemets empêchent Docker Compose de charger correctement les variables!

❌ Incorrect: `PUBLIC_URL="https://gate.meeshy.me"`  
✅ Correct: `PUBLIC_URL=https://gate.meeshy.me`

### 3. Code de l'AttachmentService (Logique robuste)

Le service `AttachmentService` a maintenant une logique de fallback intelligente:

```typescript
if (process.env.PUBLIC_URL) {
  // 1. Priorité absolue à PUBLIC_URL si définie
  this.publicUrl = process.env.PUBLIC_URL;
} else if (isProduction) {
  // 2. En production, construire l'URL à partir du domaine
  const domain = process.env.DOMAIN || 'meeshy.me';
  this.publicUrl = `https://gate.${domain}`;
} else {
  // 3. En développement, utiliser localhost
  this.publicUrl = 'http://localhost:3000';
}
```

### 4. Validation au démarrage

Le service affiche maintenant des logs détaillés et des avertissements:

```
[AttachmentService] Configuration: {
  environment: 'production',
  publicUrl: 'https://gate.meeshy.me',
  domain: 'meeshy.me',
  publicUrlSource: 'PUBLIC_URL env var'
}
```

En cas de problème:
```
⚠️  PUBLIC_URL non définie, utilisation du domaine par défaut: https://gate.meeshy.me
❌ ERREUR CRITIQUE: PUBLIC_URL pointe vers localhost en production!
```

## Procédure de déploiement

### 1. Vérifier la configuration .env

```bash
ssh root@157.230.15.51
cd /opt/meeshy
grep -E '^(DOMAIN|PUBLIC_URL)=' .env
```

Devrait afficher (sans guillemets):
```
DOMAIN=meeshy.me
PUBLIC_URL=https://gate.meeshy.me
```

### 2. Corriger si nécessaire

```bash
# Supprimer les guillemets et corriger la valeur
sed -i 's|^PUBLIC_URL=.*|PUBLIC_URL=https://gate.meeshy.me|g' .env
sed -i 's|^DOMAIN=.*|DOMAIN=meeshy.me|g' .env
```

### 3. Build et déploiement de l'image

```bash
# Sur la machine locale
cd gateway
docker build --platform linux/amd64 -t isopen/meeshy-gateway:latest .
docker push isopen/meeshy-gateway:latest

# Sur le serveur de production
ssh root@157.230.15.51
cd /opt/meeshy
docker compose -f docker-compose.traefik.yml pull gateway
docker compose -f docker-compose.traefik.yml up -d gateway
```

### 4. Vérifier les logs

```bash
docker logs meeshy-gateway 2>&1 | grep -A 5 'AttachmentService.*Configuration'
```

Devrait afficher:
```
[AttachmentService] Configuration: {
  environment: 'production',
  publicUrl: 'https://gate.meeshy.me',
  uploadBasePath: '/app/uploads',
  domain: 'meeshy.me',
  publicUrlSource: 'PUBLIC_URL env var'
}
```

### 5. Test rapide

```bash
# Créer un fichier de test dans MongoDB pour vérifier
docker exec meeshy-database mongosh meeshy --quiet --eval \
  'db.MessageAttachment.findOne({}, {fileUrl: 1, _id: 0})'
```

L'URL doit commencer par `https://gate.meeshy.me/api/attachments/...`

## Maintenance

### Script de vérification automatique

Créer `/opt/meeshy/scripts/check-public-url.sh`:

```bash
#!/bin/bash

echo "=== Vérification de PUBLIC_URL ==="
echo ""

# Vérifier le fichier .env
echo "1. Fichier .env:"
grep -E '^(DOMAIN|PUBLIC_URL)=' /opt/meeshy/.env || echo "❌ Variables manquantes!"
echo ""

# Vérifier la variable dans le container
echo "2. Container gateway:"
docker exec meeshy-gateway env | grep -E '^(DOMAIN|PUBLIC_URL)=' || echo "❌ Variables non chargées!"
echo ""

# Vérifier les logs
echo "3. Logs AttachmentService:"
docker logs meeshy-gateway 2>&1 | grep 'AttachmentService.*Configuration' | tail -1
echo ""

# Vérifier un exemple d'URL en base
echo "4. Exemple d'URL en base:"
docker exec meeshy-database mongosh meeshy --quiet --eval \
  'const att = db.MessageAttachment.findOne({}, {fileUrl: 1}); if(att) print(att.fileUrl); else print("Aucun attachement");'
echo ""

# Analyse
echo "=== Analyse ==="
PUBLIC_URL=$(docker exec meeshy-gateway env | grep '^PUBLIC_URL=' | cut -d'=' -f2)
if [ "$PUBLIC_URL" == "https://gate.meeshy.me" ]; then
  echo "✅ Configuration correcte!"
elif [ -z "$PUBLIC_URL" ]; then
  echo "⚠️  PUBLIC_URL non définie - vérifiez .env"
else
  echo "⚠️  PUBLIC_URL inattendue: $PUBLIC_URL"
fi
```

Rendre exécutable:
```bash
chmod +x /opt/meeshy/scripts/check-public-url.sh
```

### Exécuter la vérification

```bash
/opt/meeshy/scripts/check-public-url.sh
```

## Checklist avant chaque déploiement

- [ ] Vérifier que `.env` contient `PUBLIC_URL=https://gate.meeshy.me` (sans guillemets)
- [ ] Vérifier que `.env` contient `DOMAIN=meeshy.me` (sans guillemets)
- [ ] Après déploiement, vérifier les logs: `docker logs meeshy-gateway | grep AttachmentService`
- [ ] Vérifier qu'aucun avertissement sur PUBLIC_URL n'apparaît
- [ ] Tester l'upload d'un fichier et vérifier l'URL générée

## Rollback en cas de problème

Si après un déploiement les URLs sont incorrectes:

```bash
# 1. Corriger le .env
ssh root@157.230.15.51
cd /opt/meeshy
sed -i 's|^PUBLIC_URL=.*|PUBLIC_URL=https://gate.meeshy.me|g' .env

# 2. Redémarrer le gateway
docker compose -f docker-compose.traefik.yml up -d gateway

# 3. Corriger les URLs en base (si nécessaire)
docker cp /opt/meeshy/scripts/fix-urls-to-gate.js meeshy-database:/tmp/
docker exec meeshy-database mongosh meeshy --quiet /tmp/fix-urls-to-gate.js
```

## Questions fréquentes

**Q: Pourquoi ne pas hardcoder l'URL dans le code?**  
R: Pour permettre le développement local et la flexibilité pour d'autres environnements.

**Q: Que se passe-t-il si PUBLIC_URL n'est pas défini?**  
R: Le service utilise automatiquement `https://gate.${DOMAIN}`, donc `https://gate.meeshy.me` en production.

**Q: Les guillemets dans .env posent-ils vraiment problème?**  
R: Oui! Docker Compose ne charge pas correctement les variables avec guillemets doubles.

**Q: Comment vérifier rapidement si la configuration est correcte?**  
R: `docker logs meeshy-gateway | grep -A 5 'AttachmentService.*Configuration'`

