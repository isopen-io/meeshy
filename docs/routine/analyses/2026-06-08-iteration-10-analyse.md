# Analyse — Itération 10 (2026-06-08)

**Branche :** `claude/brave-archimedes-m9Zv3`
**Base :** itération 9 mergée (1bed41d7)

---

## Contexte

Itérations précédentes (1-9) ont couvert : ZMQ timeouts, circuit-breaker, LRU cache, rate limiter,
invalidation presence cache, AuthHandler/ReactionHandler/ConversationHandler/MessageHandler logger
migration, message dedup TTL, typing throttle cleanup, VoiceCharacteristics type strict, fuites
mémoire ConversationStatsService/MessageReadStatusService/MessageTranslationService,
markReceivedTimers size cap.

Cette itération 10 cible les derniers `console.*` non migrés (StatusHandler, SocialEventsHandler,
PushNotificationService, TranslationCache, TrackingLinkService), une fuite mémoire dans
`identityCache` de StatusHandler, et l'optimisation du broadcast social (N appels `.emit()` → 1).

---

## Problème 1 — StatusHandler : 8 console.* + identityCache sans éviction périodique

**Fichier :** `services/gateway/src/socketio/handlers/StatusHandler.ts`
**Lignes :** 69, 81, 124, 138, 150, 177, 213, 234 (console.*) + 37, 196-219 (cache)

Le `StatusHandler` utilise encore 8 `console.warn/error` directs, contournant PII redaction.

De plus, `identityCache` (Map<string, CachedIdentity>) stocke des identités avec TTL 60s mais
**aucune éviction périodique**. Les entrées expirées s'accumulent indéfiniment. Sur un serveur
production recevant 10K utilisateurs uniques, le cache grandit sans borne.

`typingThrottleMap` a une éviction conditionnelle (taille > 10K) mais O(n) scan. Aucun cleanup
planifié non plus.

**Impact :** Bypass PII redaction sur le hot path typing (haute fréquence) + croissance mémoire
linéaire avec le nombre d'utilisateurs uniques actifs.

---

## Problème 2 — SocialEventsHandler : console.error dans getFriendIds + emitToFriends O(n)

**Fichier :** `services/gateway/src/socketio/handlers/SocialEventsHandler.ts`
**Lignes :** 81 (console.error), 89-95 (emitToFriends)

`getFriendIds()` contient un `console.error` non structuré (ligne 81).

`emitToFriends()` boucle sur N amis et appelle `io.to(room).emit()` N fois. En Socket.IO v4,
on peut chaîner `.to()` et appeler `.emit()` une seule fois, réduisant le overhead d'un
facteur N (une seule itération de l'arbre de rooms interne vs N itérations).

`friendsCache` est un Map sans limite de taille — avec 100K utilisateurs actifs, il peut
accummuler 100K entrées de 30s TTL sans éviction proactive.

**Impact :** Performance dégradée sur les events sociaux à fort volume (stories, posts) +
fuite mémoire friendsCache.

---

## Problème 3 — PushNotificationService : console.* dans le chemin d'initialisation

**Fichier :** `services/gateway/src/services/PushNotificationService.ts`
**Lignes :** 120, 144, 147, 150, 177, 179, 182, 242, 274, 655, 687

11 `console.log/warn/error` contournant le logger structuré (Winston + Pino). Bien que
ce service soit moins fréquemment appelé en production, les logs d'initialisation sont
critiques pour le diagnostic des bugs de configuration push.

**Impact :** Logs push non indexables ELK, pas de PII redaction sur les userId/tokenId loggés.

---

## Problème 4 — TranslationCache : console.* dans les chemins d'erreur

**Fichier :** `services/gateway/src/services/TranslationCache.ts`
**Lignes :** 20, 93, 117, 159, 199, 231

6 `console.log/error` dans le service de cache de traduction. Ce service est appelé à très
haute fréquence (chaque message entrant). Les erreurs Redis passent sans PII redaction.

**Impact :** Logs de cache non structurés sur le hot path traduction.

---

## Problème 5 — TrackingLinkService : console.* dans le traitement des liens

**Fichier :** `services/gateway/src/services/TrackingLinkService.ts`
**Lignes :** 623, 645, 665, 687, 760

5 `console.log/error` dans le service de tracking des liens. Moins critique mais incohérent
avec le reste de la migration.

**Impact :** Logs de tracking non structurés.

---

## Résumé des impacts

| # | Fichier | Type | Sévérité |
|---|---------|------|----------|
| 1 | StatusHandler.ts | PII + Fuite mémoire | HAUTE |
| 2 | SocialEventsHandler.ts | PII + Performance | MOYENNE |
| 3 | PushNotificationService.ts | PII / Observabilité | MOYENNE |
| 4 | TranslationCache.ts | PII / Observabilité | MOYENNE |
| 5 | TrackingLinkService.ts | Observabilité | FAIBLE |
