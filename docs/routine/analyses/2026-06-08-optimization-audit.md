# Audit d'optimisation — 2026-06-08

## Contexte

Analyse complète du codebase Meeshy (branche `main`, commit `b4bee8af`) orientée :
bande passante, workflow, UX, architecture, simplicité, couverture fonctionnelle vs concurrence,
pureté du code, exploitation des ressources système.

---

## 1. État actuel des optimisations (phases livrées)

| Phase | Livré | Impact |
|-------|-------|--------|
| A1 — HTTP Brotli q5 / gzip 6, seuil 1 KB | ✅ | −70-85 % JSON |
| A2 — WebSocket `perMessageDeflate` seuil 256 | ✅ | réactions/read compressées |
| A3 — REST `?languages=fr,en` filter | ✅ | payload mono-langue opt-in |
| A4 — Conversation list participants trimmed | ✅ | −30 % listing payload |
| D4 — Thumbnails WebP (−25-35 % vs JPEG) | ✅ | images allégées |
| B1 — Filtre socket par langue | ⚠️ Code présent, flag `SOCKET_LANG_FILTER` **OFF** | 0 % en prod |

---

## 2. Problèmes critiques identifiés

### 2.1 Gateway — Broadcast non filtré (CRITIQUE — bande passante)

`MeeshySocketIOManager._broadcastNewMessage` émet le payload complet (N traductions)
à **tous** les clients d'une conversation, indépendamment de leur langue.

- **Impact** : pour une conversation FR/EN/ES avec 3 traductions, chaque client reçoit 3× la donnée utile.
- **Fix** : activer `SOCKET_LANG_FILTER` en production (B1 déjà implémenté, manque activation + adoption iOS).

### 2.2 Gateway — Privacy lookup par broadcast (HAUTE)

`_broadcastUserStatus` appelle `privacyPreferencesService.getPreferences(userId)` à chaque appel.
`PrivacyPreferencesService` possède déjà un cache mémoire 5 min — **mais** il est instancié comme
singleton en dehors du contexte socket, donc les préférences sont bien cachées.

→ **Aucune action requise**, le cache fonctionne correctement.

### 2.3 Gateway — Payload attachments : métadonnées techniques inutiles (HAUTE)

Le payload `message:new` embarque `codec`, `bitrate`, `fps`, `sampleRate`, `segments`
pour chaque pièce jointe, **même dans le listing de conversations**.
Ces champs ne sont affichés nulle part dans les listes.

- **Fix** : trim des champs techniques dans `_broadcastNewMessage` (conserver id, url, type, size, thumbnail, duration, mimeType).

### 2.4 Gateway — connectedUsers Maps sans borne (HAUTE)

`connectedUsers`, `socketToUser`, `userSockets` : Maps JS sans taille maximale.
Un socket déconnecté brutalement (partition réseau) reste en mémoire jusqu'au prochain cleanup de `MaintenanceService`.
Le cleanup est basé sur `lastActiveAt` Prisma, pas sur la Map elle-même.

- **Fix** : ajouter TTL glissant dans la Map + nettoyage périodique depuis `MaintenanceService`.

### 2.5 Gateway — Debug logs en production (HAUTE)

`_broadcastNewMessage` contient des `logger.info` avec dump complet des métadonnées d'attachments
(clé `🔍 [WEBSOCKET] Broadcasting message avec attachments`).
Ces logs sont émis **sur chaque message avec pièce jointe** — pression inutile sur stdout et I/O disque.

- **Fix** : réduire au niveau `logger.debug` ou supprimer.

### 2.6 Translator — Codec WAV interne (HAUTE — bande passante ZMQ)

Le pipeline audio interne transite en WAV (PCM non compressé).
Un fichier 30 s = ~2.9 MB WAV vs ~240 KB Opus 24 kbps.

- **Fix** : encoder en Opus (libopus) avant envoi ZMQ → passage en frames binaires.

### 2.7 Web — Absence de persistence React Query (MOYENNE)

`staleTime: Infinity` est bien configuré (Socket.IO = source de vérité),
mais il n'y a **pas de persistence IndexedDB** du cache React Query.
Rechargement de page = cache vide = waterfall de requêtes HTTP.

- **Fix** : `@tanstack/react-query-persist-client` + `createSyncStoragePersister` (localStorage) ou `IDBPersister`.

### 2.8 Web — LRU translation service non borné correctement (MOYENNE)

`advanced-translation.service.ts` utilise `LRUCache` (lib custom `@/lib/lru-cache`),
mais la taille du cache n'est pas visible dans l'initialisation.
Si l'entrée par défaut est 0 ou Infinity, la mémoire croît sans limite sur des conversations longues.

### 2.9 Prisma Schema — Index composites manquants (MOYENNE)

Requêtes fréquentes sans index optimal :

| Collection | Pattern | Index manquant |
|-----------|---------|----------------|
| Message | "dernier message non supprimé par conversation" | `(conversationId, createdAt DESC, deletedAt)` |
| MessageStatusEntry | "statuts par conversation" | `(conversationId, messageId)` |
| User | "utilisateurs par langue" | `(systemLanguage, regionalLanguage)` |

### 2.10 iOS — Métadonnées d'attachments non demandées (MOYENNE)

iOS ne passe pas encore `?languages=` sur les appels REST de messages.
Résultat : chaque appel retourne N traductions pour M messages = payload surdimensionné.

### 2.11 Gateway — Logs structurés incomplets (BASSE)

Aucune métrique sur :
- Ratio hit/miss Redis vs memory fallback
- Bytes économisés par compression Brotli/gzip
- Longueur de queue traducteur
- Bytes Socket.IO par type d'événement

---

## 3. Analyse UX vs Concurrence

| Fonctionnalité | Meeshy | Telegram | WhatsApp | Signal |
|---------------|--------|----------|----------|--------|
| Traduction auto | ✅ NLLB | ❌ | ❌ | ❌ |
| Voice cloning | ✅ Chatterbox | ❌ | ❌ | ❌ |
| E2EE | ✅ (hybrid/server/e2ee) | ✅ (opt-in) | ✅ | ✅ |
| Stories | ✅ | ✅ | ✅ | ❌ |
| Calls vidéo | ✅ WebRTC | ✅ | ✅ | ✅ |
| Read receipts granulaires | ✅ | ✅ | ✅ | ✅ |
| Persistence cross-device | ⚠️ MongoDB OK, client cold-start lent | ✅ | ✅ | ✅ |
| Message reactions mood | ✅ | ✅ | ✅ | ❌ |
| Conversation accent color | ✅ (unique) | ❌ | ❌ | ❌ |
| Offline queue write | ⚠️ Spécifié, partiel iOS | ✅ | ✅ | ✅ |

**Gaps identifiés** :
- Persistence client (cold-start lent sans cache React Query persistant)
- iOS `?languages=` filter non adopté
- Offline queue iOS non complètement implémentée

---

## 4. Analyse Architecture

### Forces
- Compression HTTP état de l'art (Brotli q5)
- Dual-layer cache (Redis + memory fallback avec circuit breaker)
- LRU translation cache (1000 entrées, véritablement LRU)
- Prisme Linguistique bien architecturé, source de vérité unique
- ZMQ async non-bloquant pour le pipeline ML
- MessageTranslationService modulaire (TranslationCache, LanguageCache, TranslationStats)

### Faiblesses
- `_broadcastNewMessage` : mutation directe `(message as any).conversationId = normalizedId` — side-effect
- `MeeshySocketIOManager.ts` : 1700+ lignes, responsibility trop large
- Nombreux `(x as any)` dans les payloads → type safety dégradée
- Logs debug en production dans le hot path
- Codec audio WAV en interne (ZMQ frames)

---

## 5. Exploitation ressources système

### Node.js / Gateway
- Worker threads non utilisés pour le hashing/crypto (synchrone sur main thread)
- `sharp` WebP encode sur chaque upload sans dedup content-addressé (SHA256)
- `perMessageDeflate` avec `clientNoContextTakeover: true` — chaque message reconstruit le contexte deflate (décision correcte pour la mémoire, compromis perf)

### Python / Translator
- NLLB chargé en mémoire complète (pas de quantisation 4-bit active en prod d'après les tests présents)
- Whisper : single-threaded inference par défaut
- TTS Chatterbox : génération pour toutes les langues, pas on-demand

---

## 6. Priorisation des actions

| Priorité | Action | Effort | Impact |
|---------|--------|--------|--------|
| P0 | Supprimer logs debug prod (`_broadcastNewMessage`) | 15 min | Perf I/O |
| P0 | Trim métadonnées techniques dans payload `message:new` | 1h | −20-40 % bande passante |
| P1 | Activer `SOCKET_LANG_FILTER=true` (déjà codé) | 30 min config | −60 % WS si N langues |
| P1 | Ajouter index Prisma composites | 30 min | Latence DB |
| P1 | React Query persist client (web) | 2h | Cold-start UX |
| P2 | Compression WebSocket `context takeover` mesurée | 1h | +15-20 % ratio |
| P2 | iOS `?languages=` filter adoption | 2h | −50 % payload REST |
| P2 | Métriques cache/compression | 2h | Observabilité |
| P3 | Codec Opus pour audio interne ZMQ | 1 jour | −90 % ZMQ audio |
| P3 | TTS on-demand (pas toutes langues) | 2 jours | Translator queue |
