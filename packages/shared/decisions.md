# Decisions - packages/shared (Types & Schema partags)

## 2025-01: TypeScript Strict + Immutabilit
**Statut**: Accept
**Contexte**: Package partag entre tous les services, doit tre la rfrence de type safety
**Decision**: TypeScript strict avec tous les flags avancs (`noUnusedLocals`, `noUncheckedIndexedAccess`, etc.), zro `any`, `readonly` partout (2849+ occurrences)
**Alternatives rejet**: Mode loose (bugs runtime), proprits mutables (effets de bord), `any` pour flexibilit (perte de scurit)
**Cons**: Code plus verbeux, courbe d'apprentissage

## 2025-01: Branded Types pour IDs sensibles
**Statut**: Accept
**Contexte**: Prvenir la confusion compile-time entre types d'identifiants
**Decision**: Types brands via intersection: `type AnonymousParticipantId = string & { readonly __brand: 'AnonymousParticipantId' }`
**Alternatives rejet**: Strings simples (pas de protection compile-time), classes (overhead runtime), opaque types (pas support nativement par TS)
**Cons**: Zro overhead runtime, meilleure documentation d'intention

## 2025-01: `type` prfr  `interface`
**Statut**: Accept
**Contexte**: Cohrence des structures de donnes dans le package
**Decision**: `type` pour les structures de donnes, `interface` rserv aux contrats de comportement (Socket.IO event maps, encryption adapters)
**Alternatives rejet**: Interface-first (moins flexible pour unions/intersections), classes (trop lourd pour data-only)
**Cons**: Sparation claire donnes vs comportement

## 2025-01: Socket.IO Events - `entity:action-word` avec hyphens
**Statut**: Accept
**Contexte**: Convention de nommage unique pour tous les vnements temps rel
**Decision**: Format `entity:action-word` (colons + hyphens, JAMAIS underscores). Constants spars `SERVER_EVENTS` et `CLIENT_EVENTS` avec `as const`
**Alternatives rejet**: Underscores (`message_send`) (moins lisible), camelCase (`messageSend`) (pas convention WS), namespace plat (collisions)
**Cons**: Convention doit tre enforce manuellement

## 2025-01: Messages - GatewayMessage vs UIMessage
**Statut**: Accept
**Contexte**: Backend et frontend ont des besoins diffrents pour les messages
**Decision**: `GatewayMessage` (align Prisma, backend), `UIMessage` (tats visuels, frontend). Conversion via `gatewayToUIMessage()`, affichage via `getDisplayContent(msg, lang)`
**Alternatives rejet**: Type unique (mlange concerns API et UI), types multiples par contexte (maintenance impossible)
**Cons**: Logique de conversion  maintenir, deux types  comprendre

## 2025-01: Validation - Zod avec CommonSchemas
**Statut**: Accept
**Contexte**: Validation runtime aux frontires de confiance (API, WebSocket)
**Decision**: Zod pour validation + infrence de types. `CommonSchemas` centralis (mongoId, conversationType, messageContent, email, etc.)
**Alternatives rejet**: Joi (moins TypeScript-friendly), Yup (moins d'infrence), class-validator (ncessite classes), validation manuelle (error-prone)
**Cons**: Source unique de vrit pour les rgles de validation

## 2025-01: Encryption - SharedEncryptionService avec DI
**Statut**: Accept
**Contexte**: Mme code de chiffrement sur frontend (Web Crypto) et backend (Node crypto)
**Decision**: SharedEncryptionService avec injection de dpendances (CryptoAdapter, KeyStorageAdapter), Signal Protocol optionnel
**Alternatives rejet**: Impls spares par plateforme (duplication), Web Crypto only (pas Node.js), Node crypto only (pas browser)
**Cons**: Setup DI plus complexe, mais testable avec mocks

## 2025-01: Build - ESM + Subpath Exports
**Statut**: Accept
**Contexte**: Module moderne avec tree-shaking pour tous les consommateurs
**Decision**: `"type": "module"`, target ES2020, moduleResolution `bundler`, subpath exports (`@meeshy/shared/types/*`, `@meeshy/shared/encryption/*`)
**Alternatives rejet**: CommonJS (legacy, pas de tree-shaking), dual CJS+ESM (maintenance complexe)
**Cons**: Extensions `.js` obligatoires dans les imports (convention ESM), incompatible outils CJS-only

## 2025-01: Langues - 60+ langues avec capability flags
**Statut**: Accept
**Contexte**: Frontend et backend doivent connatre les capacits de chaque langue
**Decision**: `SupportedLanguageInfo` avec flags (supportsTTS, supportsSTT, supportsVoiceCloning), engine specs, codes MMS, rgions
**Alternatives rejet**: Listes de langues hardcodes (pas flexible), config backend-only (duplication frontend), fichiers spars par langue (maintenance)
**Cons**: Synchronisation manuelle avec le service translator Python

## 2025-01: Rles - Hirarchie numrique
**Statut**: Accept
**Contexte**: Vrification de permissions efficace et extensible
**Decision**: Rles globaux numriques (BIGBOSS 100 > ADMIN 80 > MODERATOR 60 > AUDIT 40 > ANALYST 30 > USER 10), rles membres spars (CREATOR 40 > ADMIN 30 > MODERATOR 20 > MEMBER 10)
**Alternatives rejet**: Comparaison string (error-prone), bitwise flags (moins lisible), hirarchie DB-only (query ncessaire)
**Cons**: Numros arbitraires, distinction globaux vs contextuels  comprendre

## 2025-01: Database - MongoDB 8 + Prisma (PAS PostgreSQL)
**Statut**: Accept
**Contexte**: Schma flexible pour messaging, documents imbriqus, scalabilit horizontale
**Decision**: MongoDB 8 avec replica set (transactions), Prisma ORM, dnormalisation pour performance (memberCount, reactionSummary), soft deletes
**Alternatives rejet**: PostgreSQL (mentionn dans anciens docs mais OBSOLTE), MySQL (pas adapt), raw driver (perte type safety)
**Cons**: Replica set obligatoire, pas de full-text search natif (besoin Atlas Search)

## 2025-01: API Response - Format unifi ApiResponse<T>
**Statut**: Accept
**Contexte**: Cohrence des rponses REST et WebSocket
**Decision**: `{ success: boolean, data?: T, error?: string, code?: ErrorCode, pagination?: PaginationMeta }`
**Alternatives rejet**: Formats diffrents par endpoint (incohrent), erreurs lances (pas de type safety)
**Cons**: Lgrement plus verbeux (toujours unwrapper `.data`)
