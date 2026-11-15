# Solution pérenne pour PUBLIC_URL - Meeshy

## Problème résolu

Les URLs d'attachements étaient perdues lors du déploiement d'images Docker, pointant vers `http://gateway:3000` au lieu de `https://gate.meeshy.me`.

## Solution mise en place

### 1. Code robuste (AttachmentService.ts)

Le service a maintenant une logique de fallback intelligente qui fonctionne même sans PUBLIC_URL explicite:

```typescript
if (process.env.PUBLIC_URL) {
  // 1. Priorité à PUBLIC_URL si définie
  this.publicUrl = process.env.PUBLIC_URL;
} else if (isProduction) {
  // 2. En production, construire à partir de DOMAIN
  const domain = process.env.DOMAIN || 'meeshy.me';
  this.publicUrl = `https://gate.${domain}`;
} else {
  // 3. En développement, localhost
  this.publicUrl = 'http://localhost:3000';
}
```

**Avantages:**
- ✅ Fonctionne même si PUBLIC_URL n'est pas défini en production
- ✅ Utilise automatiquement `https://gate.${DOMAIN}`
- ✅ Logs détaillés pour débogage
- ✅ Validation automatique au démarrage

### 2. Configuration Docker Compose améliorée

Le fichier `docker-compose.traefik.yml` passe maintenant **DOMAIN** et **PUBLIC_URL** avec fallbacks:

```yaml
gateway:
  environment:
    - DOMAIN=${DOMAIN:-meeshy.me}
    - PUBLIC_URL=${PUBLIC_URL:-https://gate.${DOMAIN:-meeshy.me}}
```

**Garanties:**
- Si PUBLIC_URL n'est pas défini → utilise `https://gate.${DOMAIN}`
- Si DOMAIN n'est pas défini → utilise `meeshy.me`
- Double fallback = toujours une URL correcte en production

### 3. Fichier .env sans guillemets

Les variables doivent être définies **SANS guillemets** dans le `.env`:

```env
# ✅ CORRECT
DOMAIN=meeshy.me
PUBLIC_URL=https://gate.meeshy.me

# ❌ INCORRECT (guillemets bloquent Docker Compose)
DOMAIN="meeshy.me"
PUBLIC_URL="https://gate.meeshy.me"
```

### 4. Script de vérification automatique

Le script `scripts/check-public-url.sh` vérifie automatiquement:
- Configuration dans `.env`
- Variables chargées dans le container
- Logs de l'AttachmentService
- Exemples d'URLs en base de données

```bash
/opt/meeshy/scripts/check-public-url.sh
```

Résultat attendu:
```
✅ PUBLIC_URL correcte dans le container!
🎉 Configuration correcte!
```

## Workflow de déploiement pérenne

### 1. Build local de l'image

```bash
cd gateway
docker build --platform linux/amd64 -t isopen/meeshy-gateway:latest .
docker push isopen/meeshy-gateway:latest
```

**Note:** L'image build localement fonctionne maintenant car le code a un fallback intelligent.

### 2. Vérification avant déploiement (optionnel mais recommandé)

```bash
ssh root@157.230.15.51 "/opt/meeshy/scripts/check-public-url.sh"
```

### 3. Déploiement en production

```bash
ssh root@157.230.15.51
cd /opt/meeshy

# Pull de la nouvelle image
docker compose -f docker-compose.traefik.yml pull gateway

# Redémarrage du service
docker compose -f docker-compose.traefik.yml up -d gateway
```

### 4. Vérification post-déploiement

```bash
# Vérifier la configuration
/opt/meeshy/scripts/check-public-url.sh

# Vérifier les logs
docker logs meeshy-gateway 2>&1 | grep -A 7 'AttachmentService.*Configuration' | tail -10
```

Attendu dans les logs:
```
[AttachmentService] Configuration: {
  environment: 'production',
  publicUrl: 'https://gate.meeshy.me',
  uploadBasePath: '/app/uploads',
  domain: 'meeshy.me',
  publicUrlSource: 'PUBLIC_URL env var'
}
```

## Scénarios de fallback

### Scénario 1: Configuration complète (idéal)
```env
DOMAIN=meeshy.me
PUBLIC_URL=https://gate.meeshy.me
```
→ Utilise `PUBLIC_URL` directement ✅

### Scénario 2: Seulement DOMAIN
```env
DOMAIN=meeshy.me
```
→ Construit automatiquement `https://gate.meeshy.me` ✅

### Scénario 3: Aucune variable (ne devrait jamais arriver)
→ Utilise le fallback hardcodé `https://gate.meeshy.me` ✅

### Scénario 4: DOMAIN incorrect mais PUBLIC_URL correct
```env
DOMAIN=wrongdomain.com
PUBLIC_URL=https://gate.meeshy.me
```
→ Utilise `PUBLIC_URL` (priorité absolue) ✅

## Que faire en cas de problème

### URLs incorrectes après déploiement

1. **Vérifier immédiatement:**
```bash
ssh root@157.230.15.51 "/opt/meeshy/scripts/check-public-url.sh"
```

2. **Corriger le .env si nécessaire:**
```bash
ssh root@157.230.15.51
cd /opt/meeshy
vi .env  # ou nano .env

# S'assurer que (SANS guillemets):
DOMAIN=meeshy.me
PUBLIC_URL=https://gate.meeshy.me
```

3. **Redémarrer le gateway:**
```bash
docker compose -f docker-compose.traefik.yml up -d gateway
```

4. **Corriger les URLs en base si nécessaire:**
```bash
# Les URLs générées avec l'ancienne config doivent être corrigées
docker cp /opt/meeshy/scripts/fix-urls-to-gate.js meeshy-database:/tmp/
docker exec meeshy-database mongosh meeshy --quiet /tmp/fix-urls-to-gate.js
```

## Maintenance préventive

### Checklist avant chaque déploiement

- [ ] Vérifier que `.env` contient `DOMAIN=meeshy.me` (sans guillemets)
- [ ] Vérifier que `.env` contient `PUBLIC_URL=https://gate.meeshy.me` (sans guillemets)
- [ ] Run `check-public-url.sh` avant le déploiement
- [ ] Run `check-public-url.sh` après le déploiement
- [ ] Vérifier les logs AttachmentService
- [ ] Tester l'upload d'un fichier test

### Monitoring continu

Ajouter au cron (optionnel):
```bash
# Vérification quotidienne
0 9 * * * /opt/meeshy/scripts/check-public-url.sh >> /var/log/meeshy/public-url-check.log 2>&1
```

## Documentation complète

Voir: `/Users/smpceo/Documents/Services/Meeshy/meeshy/docs/PUBLIC_URL_CONFIGURATION.md`

## Résumé

**Avant:** Les URLs étaient perdues à chaque déploiement d'image Docker  
**Après:** Les URLs sont toujours correctes grâce à:
1. Fallback intelligent dans le code
2. Configuration Docker robuste avec doubles fallbacks
3. Variables DOMAIN et PUBLIC_URL sans guillemets
4. Script de vérification automatique
5. Documentation complète

**Test de robustesse réussi:**
- ✅ Déploiement image locale → URLs correctes
- ✅ Redémarrage gateway → URLs correctes
- ✅ .env minimal (seulement DOMAIN) → URLs correctes
- ✅ .env complet → URLs correctes

