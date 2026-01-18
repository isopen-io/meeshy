# Message Translation Service - Architecture Modulaire

## Structure

```
message-translation/
├── MessageTranslationService.ts  # Orchestrateur principal (387 lignes)
├── TranslationCache.ts           # Cache LRU mémoire (75 lignes)
├── LanguageCache.ts              # Cache TTL langues (115 lignes)
├── TranslationStats.ts           # Statistiques (140 lignes)
├── EncryptionHelper.ts           # Chiffrement (180 lignes)
└── index.ts                      # Exports sélectifs
```

## Modules

### MessageTranslationService
Service orchestrateur principal utilisant la composition forte.

**Responsabilités:**
- Initialisation ZMQ
- Gestion du cycle de vie des messages
- Coordination entre modules
- API publique du service

**Dépendances:**
- TranslationCache
- LanguageCache
- TranslationStats
- EncryptionHelper (via composition)

### TranslationCache
Cache LRU en mémoire pour les résultats de traduction.

**Fonctionnalités:**
- Cache LRU de 1000 entrées
- Génération de clés unique
- Éviction automatique

### LanguageCache
Cache TTL pour les langues de conversation.

**Fonctionnalités:**
- TTL de 5 minutes
- Éviction automatique des entrées expirées
- Max 100 conversations en cache

### TranslationStats
Gestion des statistiques et métriques.

**Métriques:**
- Messages sauvegardés
- Requêtes envoyées
- Traductions reçues
- Erreurs
- Temps de traitement moyen
- Uptime
- Utilisation mémoire

### EncryptionHelper
Gestion du chiffrement/déchiffrement des traductions.

**Fonctionnalités:**
- Récupération clés de chiffrement
- Chiffrement AES-256-GCM
- Déchiffrement sécurisé
- Vérification mode chiffrement (e2ee/server/hybrid)

## Usage

```typescript
import { MessageTranslationService } from './message-translation';

const service = new MessageTranslationService(prisma);
await service.initialize();

// Traiter un message
await service.handleNewMessage({
  conversationId: 'conv-123',
  content: 'Hello world',
  originalLanguage: 'en',
  encryptionMode: 'server'
});

// Récupérer les stats
const stats = service.getStats();
```

## Principes de conception

1. **Composition forte**: Modules injectés via constructeur
2. **Single Responsibility**: Chaque module a une responsabilité unique
3. **Types forts**: Interfaces explicites, pas de 'any'
4. **Exports sélectifs**: API publique contrôlée via index.ts
5. **Immutabilité**: Pas de mutation d'état externe

## Migration depuis MessageTranslationService.ts

Le fichier original (2217 lignes) a été refactorisé en:
- 5 modules < 400 lignes chacun
- Séparation des responsabilités claire
- Meilleure testabilité
- Code plus maintenable

## TODO

Les méthodes suivantes doivent être migrées dans des modules dédiés:
- `_processTranslationsAsync` → TranslationProcessor
- `_processRetranslationAsync` → TranslationProcessor
- `_handleTranslationCompleted` → TranslationHandler
- `_handleAudioProcessCompleted` → AudioHandler
- Méthodes d'extraction de langues → LanguageExtractor
