# Installation des Tests E2E Meeshy

## Prérequis

- Node.js 22+
- pnpm (ou npm/yarn)
- Gateway Meeshy en cours d'exécution
- Service de traduction actif
- Base de données PostgreSQL accessible

## Installation rapide

### 1. Installation des dépendances

```bash
cd tests/
pnpm install
```

### 2. Configuration de l'environnement

Copier le fichier d'exemple et l'adapter:

```bash
cp .env.example .env
```

Modifier `.env` selon votre configuration:

```env
# URL du Gateway Meeshy
GATEWAY_URL=http://localhost:3001

# ID de la conversation à tester
TEST_CONVERSATION_ID=meeshy

# Configuration utilisateur de test
TEST_USER_ID=test-user-1
TEST_USER_LANGUAGE=fr

# Base de données (pour vérification)
DATABASE_URL=postgresql://meeshy:meeshy@localhost:5432/meeshy
```

### 3. Rendre le script de test exécutable

```bash
chmod +x run-test.sh
```

### 4. Vérifier l'installation

```bash
./run-test.sh quick meeshy
```

Si tout fonctionne, vous devriez voir:

```
✅ Gateway accessible
🚀 Lancement du test rapide...
✅ Connecté au WebSocket
📤 Envoi du message...
✅ Message envoyé
🌐 Traduction reçue...
```

## Installation manuelle (si le script automatique ne fonctionne pas)

### 1. Vérifier que ts-node est installé

```bash
pnpm add -D ts-node @types/node
```

### 2. Vérifier que Prisma Client est généré

```bash
cd ../shared/prisma
pnpm prisma generate
```

### 3. Tester manuellement

```bash
cd ../tests
pnpm ts-node quick-translation-test.ts meeshy
```

## Résolution des problèmes d'installation

### Problème: "Cannot find module 'socket.io-client'"

**Solution:**
```bash
pnpm install socket.io-client
```

### Problème: "Prisma Client not found"

**Solution:**
```bash
cd ../shared/prisma
pnpm prisma generate
cd ../../tests
```

### Problème: "ts-node: command not found"

**Solution:**
```bash
pnpm add -g ts-node
# Ou installer localement
pnpm add -D ts-node
```

### Problème: "Gateway non accessible"

**Vérifications:**

1. Le Gateway est-il démarré?
```bash
docker ps | grep gateway
```

2. Le Gateway écoute-t-il sur le bon port?
```bash
curl http://localhost:3001/health
```

3. Le port est-il correct dans `.env`?
```bash
cat .env | grep GATEWAY_URL
```

### Problème: "Cannot connect to database"

**Vérifications:**

1. PostgreSQL est-il démarré?
```bash
docker ps | grep postgres
```

2. L'URL de base de données est-elle correcte?
```bash
cat .env | grep DATABASE_URL
```

3. Tester la connexion:
```bash
cd ../shared/prisma
pnpm prisma db pull
```

## Structure des fichiers installés

```
tests/
├── .env.example              # Exemple de configuration
├── .env                      # Votre configuration (ignoré par git)
├── package.json              # Dépendances
├── tsconfig.json             # Configuration TypeScript
├── run-test.sh              # Script de lancement principal
├── e2e-translation-test.ts  # Test complet
├── quick-translation-test.ts # Test rapide
├── diagnostic-helper.ts      # Outil de diagnostic
├── README.md                 # Documentation complète
├── QUICKSTART.md            # Guide de démarrage rapide
└── INSTALLATION.md          # Ce fichier
```

## Prochaines étapes

Une fois l'installation terminée:

1. **Lire le guide de démarrage rapide:** [QUICKSTART.md](QUICKSTART.md)
2. **Exécuter le test rapide:** `./run-test.sh quick meeshy`
3. **Lire la documentation complète:** [README.md](README.md)
4. **Analyser une conversation:** `pnpm diagnostic:analyze meeshy`

## Support

Si vous rencontrez des problèmes d'installation:

1. Vérifiez les logs: `docker logs meeshy-gateway-1`
2. Vérifiez la configuration: `cat .env`
3. Testez la connexion réseau: `curl http://localhost:3001/health`
4. Consultez la documentation: [README.md](README.md)

