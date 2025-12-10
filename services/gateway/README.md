# Meeshy Gateway Service

Service gateway haute performance utilisant Fastify pour l'API REST et WebSocket.

## Structure

```
gateway/
├── src/
│   └── index.ts          # Point d'entrée principal
├── Dockerfile            # Configuration Docker optimisée
├── .dockerignore         # Exclusions Docker
├── package.json          # Dépendances Node.js
└── tsconfig.json         # Configuration TypeScript
```

## Optimisations Docker

Le Dockerfile utilise une approche multi-stage pour :
- **Stage deps** : Installation des dépendances uniquement
- **Stage builder** : Compilation TypeScript 
- **Stage runner** : Image de production minimale

### Fichiers exclus via .dockerignore

- `node_modules/` - Réinstallés durant le build
- `dist/` - Généré durant le build
- Fichiers de développement et de test
- Configuration IDE

## Commandes

```bash
# Développement
npm run dev

# Build
npm run build

# Production
npm start

# Tests
npm test
```

## Variables d'environnement

- `PORT` : Port d'écoute (défaut: 3000)
- `HOST` : Adresse d'écoute (défaut: 0.0.0.0)
- `NODE_ENV` : Environnement (production/development)
