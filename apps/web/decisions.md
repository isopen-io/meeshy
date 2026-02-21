# Decisions - apps/web (Next.js Frontend)

## 2025-01: State Management - Zustand 5
**Statut**: Accept
**Contexte**: Besoin d'un state manager performant pour une app de messagerie temps r
**Decision**: Zustand 5 avec `devtools` + `persist` middleware, stores par domaine (auth, conversation, language, app)
**Alternatives rejet**: Redux Toolkit (boilerplate excessif), Context API (re-renders globaux), Jotai/Recoil (persistence moins mature)
**Cons**: `useShallow` obligatoire pour selectors multi-champs, pas de time-travel debugging natif

## 2025-01: Data Fetching - React Query 5 + Socket.IO
**Statut**: Accept
**Contexte**: Source de vrit temps r via WebSocket, cache HTTP comme filet de secuirte
**Decision**: React Query (`staleTime: Infinity`, `gcTime: 30min`) + Socket.IO qui met jour le cache directement
**Alternatives rejet**: SWR (manipulation cache moins puissante), Apollo/GraphQL (overkill pour REST+WS), polling (inefficace pour chat)
**Cons**: Logique de synchronisation cache complexe, risque de race conditions WS vs HTTP

## 2025-01: Routing - Next.js 15 App Router avec Route Groups
**Statut**: Accept
**Contexte**: Besoin de layouts partags et de boundaries d'authentification propres
**Decision**: App Router avec route groups `(protected)/` pour auth, Server Components par dfaut
**Alternatives rejet**: Pages Router (dprc, pas de RSC), Parallel Routes (trop complexe pour le chat)
**Cons**: `'use client'` ncessaire partout pour l'interactivit, erreurs build implicites

## 2025-01: Auth - JWT + Session Tokens en localStorage
**Statut**: Accept
**Contexte**: API cross-domain (`gate.meeshy.me` vs `meeshy.me`), support anonymous
**Decision**: JWT en localStorage (Zustand persist), refresh token non-bloquant 5min avant expiry, retry automatique sur 401
**Alternatives rejet**: httpOnly cookies (pas cross-domain), NextAuth.js (complexit serveur), OAuth seul (besoin user/pass MVP)
**Cons**: Vulnrabilit XSS (localStorage accessible), pas de protection CSRF native

## 2025-01: WebSocket - Socket.IO avec Orchestrator Pattern
**Statut**: Accept
**Contexte**: Messagerie temps rel avec reconnexion automatique et multi-device
**Decision**: Socket.IO Client 4.8 avec services spcialiss (MessagingService, TypingService, PresenceService, TranslationService)
**Alternatives rejet**: WebSocket natif (pas de reconnexion/fallback), Firebase Realtime Database (vendor lock-in)
**Cons**: Bundle plus lourd que WS natif, fallback polling augmente la charge serveur

## 2025-01: Styling - Tailwind CSS 3.4 + Radix UI + CSS Variables HSL
**Statut**: Accept
**Contexte**: Design system personnalis avec thming dynamique (dark/light)
**Decision**: Tailwind utilitaire + Radix primitives (accessible) + CSS variables HSL + pattern shadcn/ui (copier, pas installer)
**Alternatives rejet**: Material UI (trop opinionn), Chakra UI (runtime CSS-in-JS), Styled Components (incompatible RSC)
**Cons**: Classes HTML longues, drift des composants shadcn/ui (merge manuel)

## 2025-01: i18n - Client-Side JSON (pas next-intl)
**Statut**: Accept
**Contexte**: next-intl redirige `/` vers `/en` ce qui casse l'UX du chat anonyme
**Decision**: Imports JSON dynamiques (`@/locales/{lang}/{ns}.json`), cache mmoire, Zustand language store
**Alternatives rejet**: next-intl (redirections URL forces), i18next (bundle lourd), SSR i18n (reload page au changement)
**Cons**: Pas de dtection locale par URL, pas de SEO pour le contenu traduit

## 2025-01: Build - Standalone Output + Runtime Env Injection
**Statut**: Accept
**Contexte**: Une seule image Docker pour dev/staging/prod
**Decision**: `output: 'standalone'`, placeholders `__RUNTIME_*__` remplacs par `sed` au dmarrage du container
**Alternatives rejet**: Build-time env vars (rebuild par env), SSR env vars (pas de standalone)
**Cons**: `sed` fragile sur code minifi, collision de placeholders possible
**Attention**: NE JAMAIS quoter les valeurs YAML dans docker-compose (`VAR=value` pas `VAR="value"`)

## 2025-01: Encryption - Signal Protocol + Web Crypto + IndexedDB
**Statut**: Accept
**Contexte**: E2EE pour messages privs, chiffrement serveur pour messages traduits
**Decision**: SharedEncryptionService (DI), Web Crypto API, IndexedDB pour cls (pas localStorage)
**Alternatives rejet**: localStorage (quota 5-10MB, pas async), custom crypto (ne jamais rouler le sien)
**Cons**: Pas de backup des cls, pas de sync multi-device, +300KB bundle

## 2025-01: Audio/Media - FFmpeg.wasm + Tone.js
**Statut**: Accept
**Contexte**: Compression audio ct client pour privacy et conomie bande passante
**Decision**: FFmpeg.wasm (compression), Tone.js (effets temps rel), Browser Image Compression
**Alternatives rejet**: Compression serveur (privacy), Web Audio API direct (trop bas niveau)
**Cons**: FFmpeg.wasm 30MB+, plus lent que FFmpeg natif, bugs Safari

## 2025-02: URL Config - Drivation dynamique depuis window.location
**Statut**: Accept
**Contexte**: L'app doit fonctionner sur localhost, IP LAN, meeshy.local, meeshy.me sans config
**Decision**: `lib/config.ts` drive les URLs depuis `window.location.hostname` (gate.{domain}, ml.{domain})
**Alternatives rejet**: URLs hardcodes (.env), variables d'environnement (ncessitent config par dev)
**Cons**: Ne fonctionne pas en SSR (besoin `INTERNAL_*_URL`), pattern sous-domaine hardcod
