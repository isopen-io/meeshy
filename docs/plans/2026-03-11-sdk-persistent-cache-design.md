# SDK Persistent Cache — Design Document

**Date**: 2026-03-11
**Goal**: Migrer le cache en memoire du SDK vers SQLite (GRDB) persistant, avec invalidation par socket events et TTL 24h de securite.

## Etat actuel

### Deux bases SQLite paralleles (dette technique)
- `AppDatabase.shared` → `~/Library/Application Support/Database/meeshy.sqlite` (DatabasePool)
- `LocalStore.shared` → `~/Documents/meeshy_cache_db/meeshy_cache.sqlite` (DatabasePool, actor)

Les deux ont le meme schema (conversations + messages en BLOB encoding). LocalStore ajoute du trimming et cleanup.

### Cache participants
`ParticipantCacheManager` est un actor in-memory — perdu au redemarrage de l'app.

## Architecture cible

### Base unique
Consolider sur `AppDatabase.shared.databaseWriter` comme unique point d'acces SQLite.
`LocalStore` sera deprecie puis supprime.

### Strategie d'encodage
- **Conversations/Messages** : BLOB encoding (pattern existant, conserve pour compatibilite)
- **Participants** : Colonnes normalisees (permet mutations individuelles via socket events)

### Tables

#### `cached_participants` (nouvelle, normalisee)
```sql
CREATE TABLE cached_participants (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL,
    userId TEXT,
    username TEXT,
    firstName TEXT,
    lastName TEXT,
    displayName TEXT,
    avatar TEXT,
    conversationRole TEXT,
    isOnline INTEGER,
    lastActiveAt DATETIME,
    joinedAt DATETIME,
    isActive INTEGER,
    cachedAt DATETIME NOT NULL
);
CREATE INDEX idx_participants_conversationId ON cached_participants(conversationId);
```

#### `cache_metadata` (nouvelle)
```sql
CREATE TABLE cache_metadata (
    key TEXT PRIMARY KEY,
    nextCursor TEXT,
    hasMore INTEGER NOT NULL DEFAULT 1,
    totalCount INTEGER,
    lastFetchedAt DATETIME NOT NULL
);
```
- Key format: `participants:{conversationId}`, `conversations:list`, `messages:{conversationId}`

### TTL et invalidation

| Source | Action |
|--------|--------|
| Ouverture app | Lecture SQLite directe, affichage immediat |
| Socket event | Update/delete cible en SQLite |
| Pull-to-refresh | Force refresh API → ecrase SQLite |
| TTL 24h expire | Prochain acces declenche refresh API |

### Socket events → invalidation participants

| Event | Action SQLite |
|-------|--------------|
| `participant:role-updated` | UPDATE role du participant cible |
| `conversation:joined` | Invalidate cache participants de la conversation |
| `conversation:left` | DELETE participant cible |

## Phases d'implementation

### Phase 1 : Participants (prototype TDD)
1. Migration GRDB v2 : tables `cached_participants` + `cache_metadata`
2. `DBCachedParticipant` : FetchableRecord + PersistableRecord
3. Refactor `ParticipantCacheManager` : actor avec GRDB backend
   - `loadFirstPage()` : lit SQLite si TTL valide, sinon API
   - `loadNextPage()` : API → save SQLite
   - `updateRole()` : UPDATE SQL direct
   - `removeParticipant()` : DELETE SQL direct
   - `invalidate()` : DELETE WHERE conversationId
4. Tests unitaires complets (protocol + mock DB)
5. Integration dans l'app iOS (ParticipantsView, ConversationInfoSheet)

### Phase 2 : Conversations + Messages
1. Migrer `LocalStore` conversations/messages vers `AppDatabase`
2. Ajouter TTL 24h via `cache_metadata`
3. `ConversationCacheManager` : meme pattern que participants
4. `MessageCacheManager` : BLOB encoding + pagination cursor
5. Deprecier puis supprimer `LocalStore`

## Regles
- **TDD** : tests RED avant implementation GREEN
- **Protocol-first** : `ParticipantCacheStoring` protocol pour injection de dependances et testabilite
- **Actor isolation** : tous les cache managers restent des actors Swift
- **Pas de migration destructive** : les tables existantes v1 restent intactes
