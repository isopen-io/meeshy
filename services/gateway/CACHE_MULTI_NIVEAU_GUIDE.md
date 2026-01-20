# Guide d'utilisation du Cache Multi-Niveau

## Vue d'ensemble

Le `MultiLevelCache<T>` est un cache générique réutilisable qui combine :
- **Niveau 1 : Mémoire** (Map) - Rapide, toujours disponible
- **Niveau 2 : Redis** - Persistant, optionnel

Ce cache garantit le fonctionnement même sans Redis, ce qui est idéal pour le développement local et la résilience en production.

## Caractéristiques

✅ **Générique** : Fonctionne avec n'importe quel type `<T>`
✅ **Multi-niveau** : Mémoire (prioritaire) + Redis (optionnel)
✅ **TTL configurable** : Différent pour chaque niveau
✅ **Nettoyage automatique** : Suppression périodique des entrées expirées
✅ **Sérialisation personnalisable** : JSON par défaut, surcharger si nécessaire
✅ **Type-safe** : Support complet de TypeScript
✅ **Logs détaillés** : Traçabilité complète des opérations

## Installation

```typescript
import { MultiLevelCache } from './services/MultiLevelCache';
import { Redis } from 'ioredis';
```

## Utilisation basique

### 1. Cache simple (sans Redis)

```typescript
// Cache en mémoire seulement
const userCache = new MultiLevelCache<User>({
  name: 'UserCache',
  memoryTtlMs: 5 * 60 * 1000, // 5 minutes
});

// Sauvegarder
await userCache.set('user123', { id: 'user123', name: 'Alice' });

// Récupérer
const user = await userCache.get('user123');

// Vérifier l'existence
const exists = await userCache.has('user123');

// Supprimer
await userCache.delete('user123');
```

### 2. Cache avec Redis

```typescript
import { Redis } from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
});

const sessionCache = new MultiLevelCache<SessionData>({
  name: 'SessionCache',
  memoryTtlMs: 10 * 60 * 1000, // 10 minutes en mémoire
  redisTtlSeconds: 3600, // 1 heure dans Redis
  redis, // Redis est optionnel
});

// Si Redis est down, le cache fonctionne quand même avec la mémoire
await sessionCache.set('session_abc', { userId: '123', token: 'xyz' });
```

## Exemples d'utilisation

### Cache de traductions

```typescript
interface TranslationEntry {
  sourceText: string;
  targetLanguage: string;
  translatedText: string;
  timestamp: number;
}

const translationCache = new MultiLevelCache<TranslationEntry>({
  name: 'TranslationCache',
  memoryTtlMs: 30 * 60 * 1000, // 30 minutes
  redisTtlSeconds: 7200, // 2 heures
  keyPrefix: 'translation:',
  redis: redisInstance,
});

// Sauvegarder une traduction
const key = `${messageId}_${targetLang}`;
await translationCache.set(key, {
  sourceText: 'Hello',
  targetLanguage: 'fr',
  translatedText: 'Bonjour',
  timestamp: Date.now()
});

// Récupérer une traduction mise en cache
const cached = await translationCache.get(key);
```

### Cache de sessions utilisateur

```typescript
interface UserSession {
  userId: string;
  token: string;
  expiresAt: number;
  deviceInfo: string;
}

const sessionCache = new MultiLevelCache<UserSession>({
  name: 'SessionCache',
  memoryTtlMs: 15 * 60 * 1000, // 15 minutes
  redisTtlSeconds: 86400, // 24 heures
  keyPrefix: 'session:',
  redis: redisInstance,
});

// Créer une session
await sessionCache.set(sessionToken, {
  userId: 'user123',
  token: sessionToken,
  expiresAt: Date.now() + 86400000,
  deviceInfo: 'Chrome/Windows'
});

// Valider une session (récupérer et supprimer)
const session = await sessionCache.getAndDelete(sessionToken);
if (session && session.expiresAt > Date.now()) {
  // Session valide
}
```

### Cache de données API

```typescript
interface ApiResponse {
  data: any;
  fetchedAt: number;
  statusCode: number;
}

const apiCache = new MultiLevelCache<ApiResponse>({
  name: 'ApiCache',
  memoryTtlMs: 60 * 1000, // 1 minute
  redisTtlSeconds: 300, // 5 minutes
  redis: redisInstance,
});

// Mise en cache d'une réponse API
await apiCache.set(`api:/users/${userId}`, {
  data: userData,
  fetchedAt: Date.now(),
  statusCode: 200
});
```

### Cache avec sérialisation personnalisée

```typescript
// Pour des objets complexes (Date, Buffer, etc.)
const complexCache = new MultiLevelCache<ComplexObject>({
  name: 'ComplexCache',
  memoryTtlMs: 60 * 1000,
  redisTtlSeconds: 300,
  redis: redisInstance,

  // Sérialisation personnalisée
  serialize: (data) => {
    return JSON.stringify({
      ...data,
      date: data.date?.toISOString(),
      buffer: data.buffer?.toString('base64')
    });
  },

  // Désérialisation personnalisée
  deserialize: (value) => {
    const parsed = JSON.parse(value);
    return {
      ...parsed,
      date: parsed.date ? new Date(parsed.date) : undefined,
      buffer: parsed.buffer ? Buffer.from(parsed.buffer, 'base64') : undefined
    };
  }
});
```

## API complète

### Méthodes

| Méthode | Description | Retour |
|---------|-------------|--------|
| `set(key, data)` | Sauvegarde une valeur dans les deux niveaux | `Promise<void>` |
| `get(key)` | Récupère une valeur (mémoire prioritaire) | `Promise<T \| null>` |
| `getAndDelete(key)` | Récupère et supprime atomiquement | `Promise<T \| null>` |
| `has(key)` | Vérifie l'existence d'une clé | `Promise<boolean>` |
| `delete(key)` | Supprime une valeur | `Promise<boolean>` |
| `clear()` | Vide complètement le cache | `Promise<void>` |
| `getStats()` | Retourne les statistiques | `Object` |
| `disconnect()` | Nettoie et ferme le cache | `Promise<void>` |

### Options du constructeur

```typescript
interface MultiLevelCacheOptions {
  name: string;                    // Nom du cache (obligatoire)
  memoryTtlMs?: number;            // TTL mémoire en ms (défaut: 30min)
  redisTtlSeconds?: number;        // TTL Redis en secondes (défaut: 1h)
  keyPrefix?: string;              // Préfixe Redis (défaut: name + ':')
  redis?: Redis;                   // Instance Redis optionnelle
  cleanupIntervalMs?: number;      // Intervalle de nettoyage (défaut: 5min)
  serialize?: (data: T) => string; // Fonction de sérialisation personnalisée
  deserialize?: (value: string) => T; // Fonction de désérialisation personnalisée
}
```

## Patterns recommandés

### 1. Pattern "Get-or-Fetch"

```typescript
async function getUserData(userId: string): Promise<User> {
  // Essayer le cache d'abord
  const cached = await userCache.get(userId);
  if (cached) {
    return cached;
  }

  // Sinon, récupérer depuis la DB
  const user = await db.users.findUnique({ where: { id: userId } });

  // Mettre en cache pour les prochaines fois
  if (user) {
    await userCache.set(userId, user);
  }

  return user;
}
```

### 2. Pattern "Cache-Aside" avec invalidation

```typescript
// Mise à jour de données
async function updateUser(userId: string, data: Partial<User>) {
  // Mettre à jour la DB
  const updated = await db.users.update({
    where: { id: userId },
    data
  });

  // Invalider le cache
  await userCache.delete(userId);

  return updated;
}
```

### 3. Pattern "Write-Through"

```typescript
// Écriture dans DB + cache simultanément
async function createUser(user: User) {
  // Sauvegarder dans la DB
  const created = await db.users.create({ data: user });

  // Mettre immédiatement en cache
  await userCache.set(created.id, created);

  return created;
}
```

### 4. Pattern "Read-Through" avec verrou

```typescript
const loadingKeys = new Set<string>();

async function getWithReadThrough(key: string): Promise<Data | null> {
  // Vérifier le cache
  const cached = await cache.get(key);
  if (cached) return cached;

  // Éviter les appels parallèles pour la même clé
  if (loadingKeys.has(key)) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return cache.get(key);
  }

  try {
    loadingKeys.add(key);

    // Charger depuis la source
    const data = await loadFromSource(key);

    // Mettre en cache
    if (data) {
      await cache.set(key, data);
    }

    return data;
  } finally {
    loadingKeys.delete(key);
  }
}
```

## Monitoring et debugging

### Statistiques du cache

```typescript
const stats = cache.getStats();
console.log(`Cache ${stats.name}:`);
console.log(`  - Entrées en mémoire: ${stats.memorySize}`);
```

### Logs

Le cache génère des logs détaillés :
- `info` : Initialisation, opérations importantes
- `debug` : Lectures/écritures, nettoyages
- `error` : Erreurs lors des opérations

```typescript
// Les logs incluent automatiquement le nom du cache
// [JobMapping] Cache multi-niveau initialisé
// [JobMapping] Valeur sauvegardée en mémoire: job_123
// [JobMapping] Nettoyage: 5 entrée(s) expirée(s) supprimée(s)
```

## Migration depuis les anciens caches

### Depuis TranslationCache

```typescript
// Avant
const cache = new TranslationCache(1000);
cache.set(key, value);
const value = cache.get(key);

// Après
const cache = new MultiLevelCache<TranslationResult>({
  name: 'TranslationCache',
  memoryTtlMs: 30 * 60 * 1000,
  redis: redisInstance // Optionnel !
});
await cache.set(key, value);
const value = await cache.get(key);
```

### Depuis LanguageCache

```typescript
// Avant
const cache = new LanguageCache(5 * 60 * 1000, 100);
cache.set(conversationId, languages);
const languages = cache.get(conversationId);

// Après
const cache = new MultiLevelCache<string[]>({
  name: 'LanguageCache',
  memoryTtlMs: 5 * 60 * 1000,
  redis: redisInstance // Optionnel !
});
await cache.set(conversationId, languages);
const languages = await cache.get(conversationId);
```

## Bonnes pratiques

1. **Nommage** : Utilisez des noms descriptifs (`UserCache`, `SessionCache`, etc.)
2. **TTL** : Mémoire < Redis (ex: 10min mémoire, 1h Redis)
3. **Préfixes** : Utilisez des préfixes Redis distincts pour chaque cache
4. **Nettoyage** : Laissez le nettoyage automatique faire son travail
5. **Résilience** : Ne passez Redis que si disponible, le cache fonctionnera en mémoire
6. **Type-safety** : Utilisez toujours les génériques `<T>` pour la sécurité des types

## Questions fréquentes

**Q : Que se passe-t-il si Redis est indisponible ?**
R : Le cache fonctionne normalement en mode mémoire uniquement.

**Q : Les TTL sont-ils différents entre mémoire et Redis ?**
R : Oui ! Par défaut : 30min en mémoire, 1h dans Redis (configurable).

**Q : Le cache est-il thread-safe ?**
R : Oui, mais attention aux race conditions dans votre code métier.

**Q : Puis-je utiliser plusieurs caches dans la même application ?**
R : Oui ! Créez une instance par type de données avec des noms et préfixes distincts.

**Q : Comment monitorer les performances ?**
R : Utilisez `getStats()` et les logs (niveau `debug`).

## Conclusion

Le `MultiLevelCache<T>` est un cache robuste, flexible et réutilisable qui s'adapte à tous les besoins :
- ✅ Développement local sans Redis
- ✅ Production avec Redis
- ✅ Résilience en cas de panne Redis
- ✅ Type-safe et facile à utiliser
- ✅ Performance optimale avec les deux niveaux

Remplacez progressivement tous les caches spécifiques par ce cache générique pour simplifier et unifier votre infrastructure de mise en cache !
