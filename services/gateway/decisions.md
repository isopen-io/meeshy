# Decisions - services/gateway (Fastify API Gateway)

## 2025-01: Framework - Fastify 5.7
**Statut**: Accept
**Contexte**: Gateway haute performance pour 100k+ messages/seconde
**Decision**: Fastify 5.7 avec validation JSON Schema (Ajv), systme de plugins, async/await natif
**Alternatives rejet**: Express (2-3x plus lent, callbacks, mauvais TS support), Nest.js (trop opinionn, overhead DI style Angular)
**Cons**: cosystme plus petit qu'Express, courbe d'apprentissage

## 2025-01: WebSocket - Socket.IO 4.8 avec multi-device
**Statut**: Accept
**Contexte**: Messagerie temps rel bidirectionnelle avec reconnexion et fallback
**Decision**: Socket.IO 4.8, rooms normalises (`conversation:{id}`), maps multi-device (`userSockets: Map<userId, Set<socketId>>`)
**Alternatives rejet**: WebSocket natif (pas de reconnexion/rooms), Firebase RTDB (vendor lock-in)
**Cons**: Convention `entity:action-word` doit tre enforce (hyphens PAS underscores), `emit()` n'attend pas les Promises

## 2025-01: IPC - ZeroMQ PUSH/SUB
**Statut**: Accept
**Contexte**: Communication ultra-rapide Gateway <-> Translator pour traductions temps rel
**Decision**: ZMQ PUSH (port 5555) vers Translator PULL, Translator PUB (port 5558) vers Gateway SUB. Multipart: Frame 1 = JSON, Frames 2+ = binaire
**Alternatives rejet**: gRPC (latence protobuf, overhead pour binaire), RabbitMQ/Kafka (broker inutile pour point-to-point), REST polling (trop lent)
**Cons**: Pas de persistence messages, gestion manuelle du cycle de vie des sockets
**Attention**: `binaryFrames[0]` = premier binaire (PAS index [1]). Singleton ZMQ obligatoire

## 2025-01: Auth - Unified Auth (JWT + Session Tokens)
**Statut**: Accept
**Contexte**: Support simultan des utilisateurs enregistrs (JWT) et anonymes (session token)
**Decision**: Middleware unifi `UnifiedAuthContext` avec `type: 'jwt' | 'session' | 'anonymous'`, trusted sessions pour "remember me"
**Alternatives rejet**: OAuth2/OIDC (overkill), Passport.js (Express-oriented), session-only (incompatible mobile stateless)
**Cons**: Plus complexe qu'un seul type d'auth, rtro-compatibilit `request.user`/`request.auth`

## 2025-01: Database - Prisma 6.19 + MongoDB 8
**Statut**: Accept
**Contexte**: Schma flexible pour messaging, types auto-gnrs, support transactions
**Decision**: Prisma ORM avec MongoDB (replica set), schma unique dans `packages/shared/prisma/schema.prisma`
**Alternatives rejet**: Mongoose (types manuels, populate() stringly-typed), PostgreSQL (schma rigide pour documents)
**Cons**: Support MongoDB Prisma moins mature que PostgreSQL, pas de full-text search natif

## 2025-01: Cache - Redis avec fallback mmoire
**Statut**: Accept
**Contexte**: Le service ne doit jamais crasher cause de Redis
**Decision**: RedisWrapper singleton, fallback automatique vers `Map<string, CacheEntry>` aprs 3 checs, `permanentlyDisabled` flag
**Alternatives rejet**: Redis seul (crash si Redis down), mmoire seul (perdu au restart), Memcached (client async moins mature)
**Cons**: Mode mmoire non partag entre instances, taux de cache hit rduit si Redis tombe

## 2025-01: Erreurs - Hirarchie custom d'erreurs
**Statut**: Accept
**Contexte**: Rponses d'erreur structures et types pour le frontend
**Decision**: `BaseAppError` avec hirarchie (Auth/Permission/NotFound/Conflict/Validation/RateLimit/Internal), mapping Prisma (P2002/P2025), flag `isOperational`
**Alternatives rejet**: Erreurs gnriques (pas de type safety), codes HTTP bruts (pas d'info actionnable)
**Cons**: Plus de boilerplate, discipline ncessaire pour utiliser les bonnes classes

## 2025-01: Rate Limiting - Multi-niveaux
**Statut**: Accept
**Contexte**: Protection contre spam, scraping, DDoS
**Decision**: Global 300 req/min par IP, messages 20/min par user, mentions max 50/msg et 5/min par destinataire, Signal Protocol limits spcifiques
**Alternatives rejet**: Rate limit unique (pas assez granulaire), externe (Cloudflare only, pas de contrle fin)
**Cons**: Limites mmoire ne fonctionnent pas en multi-instance (besoin Redis pour distribu)

## 2025-01: Encryption - Signal Protocol + AES-256-GCM serveur
**Statut**: Accept
**Contexte**: Trois modes de chiffrement selon le besoin (E2EE, serveur, hybride)
**Decision**: Signal Protocol (`@signalapp/libsignal-client`), ServerKeyVault avec envelope encryption, LRU cache 500 cls/30min TTL
**Alternatives rejet**: Custom crypto (ne jamais rouler le sien), AES seul (pas de forward secrecy)
**Cons**: E2EE dsactive la traduction, Signal Protocol ncessite impl ct client

## 2025-01: Logging - Pino + PII Redaction
**Statut**: Accept
**Contexte**: Logs structures pour aggregation, conformit RGPD
**Decision**: Pino (5x plus rapide que Winston), redaction automatique PII (email, userId, IP hashes), child loggers par module
**Alternatives rejet**: Winston seul (plus lent, legacy), console.log (pas structur)
**Cons**: Double systme logging (Pino + Winston legacy), redaction complique le debugging

## 2025-01: Audio - Pipeline WebSocket-only
**Statut**: Accept
**Contexte**: Rsultats de traduction progressifs en temps rel
**Decision**: Audio uniquement via WS `message:send-with-attachments`, pipeline 3 tapes (Whisper -> NLLB -> Chatterbox), vnements progressifs
**Alternatives rejet**: REST (pas de streaming, ncessite polling), pipeline unique (pas de rsultats intermdiaires)
**Cons**: Traduction audio indisponible pour clients REST-only, connexion WS persistante requise

## 2025-01: Push - Firebase + APNs dual
**Statut**: Accept
**Contexte**: Push cross-platform (iOS/Android/Web) + VoIP iOS
**Decision**: FCM pour cross-platform, APNs pour iOS VoIP (PushKit), filtrage par prfrences utilisateur, DND
**Alternatives rejet**: OneSignal/Pusher (cot par notification, vie prive), FCM seul (pas de VoIP iOS)
**Cons**: Setup complexe (deux providers), maintenance certificats APNs + credentials FCM
