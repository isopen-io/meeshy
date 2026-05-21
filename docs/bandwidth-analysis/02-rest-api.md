# Analyse Bande Passante REST API — Meeshy

**Date** : 2026-05-21  
**Périmètre** : services/gateway/src/routes/, apps/web, apps/ios, packages/MeeshySDK  
**Méthode** : Analyse statique exhaustive du code source

---

## Table des matières

1. [GET /conversations](#1-get-conversations)
2. [GET /conversations/:id](#2-get-conversationsid)
3. [GET /conversations/:id/messages](#3-get-conversationsidmessages)
4. [Notifications — N+1 séquentiel dans GET /conversations/:id](#4-notifications--n1-séquentiel-dans-get-conversationsid)
5. [GET /notifications](#5-get-notifications)
6. [Traductions toujours incluses dans les messages](#6-traductions-toujours-incluses-dans-les-messages)
7. [formatUserResponse — Fuite de champs sensibles/internes](#7-formatuserresponse--fuite-de-champs-sensiblesinternes)
8. [Compression HTTP absente côté Fastify](#8-compression-http-absente-côté-fastify)
9. [Cache HTTP inexistant sur les endpoints JSON](#9-cache-http-inexistant-sur-les-endpoints-json)
10. [iOS Socket.IO forcé en HTTP long-polling](#10-ios-socketio-forcé-en-http-long-polling)
11. [Polling côté web — Friend Requests & Notifications](#11-polling-côté-web--friend-requests--notifications)
12. [refetchOnWindowFocus: 'always' global](#12-refetchonwindowfocus-always-global)
13. [GET /conversations/:id — participants sans limite](#13-get-conversationsid--participants-sans-limite)
14. [Attachments — pas de Range Request sur /attachments/:id](#14-attachments--pas-de-range-request-sur-attachmentsid)
15. [Thumbnails — taille 300×300 non configurable](#15-thumbnails--taille-300300-non-configurable)
16. [Avatars/Banners — pas de resize on-the-fly](#16-avatarsbanners--pas-de-resize-on-the-fly)
17. [Stockage local (no CDN)](#17-stockage-local-no-cdn)
18. [Doublons participants/user dans GET /conversations](#18-doublons-participantsuser-dans-get-conversations)
19. [Performance logging en production (console.log massif)](#19-performance-logging-en-production-consolelog-massif)
20. [Résumé des sévérités](#20-résumé-des-sévérités)

---

## 1. GET /conversations

**Fichier** : `services/gateway/src/routes/conversations/core.ts:99–566`

### Over-fetching identifié

Le payload de chaque conversation dans la liste contient :

| Champ | Commentaire |
|---|---|
| `participants` | Jusqu'à 5 participants avec `user` imbriqué (id, username, displayName, avatar, isOnline, lastActiveAt, firstName, lastName) |
| `messages[0]` | Dernier message avec `sender` (participant + user imbriqué) et `attachments[0]` avec 9 champs média (duration, width, height, bitrate, sampleRate, metadata...) |
| `userPreferences` | 7 champs de prefs utilisateur |
| `banner` | URL de bannière (souvent inutile dans la liste) |

**Payload estimé par conversation** (conversation DM avec dernier message texte) :
- Participant × 5 : 5 × (8 champs participant + 6 champs user) ≈ 70 strings → ~600 bytes
- Dernier message + sender + attachment metadata → ~400 bytes
- Métadonnées conversation (14 champs de base) → ~250 bytes
- **Total brut par item : ~1 250 bytes**
- Avec limit par défaut 30 items : **~37 KB avant gzip**

**Problèmes spécifiques** :

1. `attachments` du dernier message inclut `bitrate`, `sampleRate`, `metadata` (JSON brut) même pour un message texte sans pièce jointe → `_count: { attachments: true }` est sélectionné mais l'objet `attachments[0]` complet suit quand même. Champs inutiles sur ~80 % des messages : ~100 bytes/item × 30 = ~3 KB gaspillés.

2. `banner` de la conversation dans la liste. Pour des DMs (majorité des conversations), la bannière est toujours `null` mais le champ transite. Environ 30 bytes par item × 30 items = 900 bytes gaspillés.

3. `isAnnouncementChannel`, `slowModeSeconds`, `defaultWriteRole` : champs d'administration inclus dans la liste générale. Inutiles pour 95 % des clients.

**Sévérité** : HAUTE  
**Correction** : Définir un `select` de liste minimal sans `banner`, `isAnnouncementChannel`, `slowModeSeconds`. Exclure `attachments` du dernier message sauf `mimeType` et `thumbnailUrl`. Économie estimée : ~300 bytes/item × 30 = **9 KB par appel de liste**.

---

## 2. GET /conversations/:id

**Fichier** : `services/gateway/src/routes/conversations/core.ts:569–738`

### include: { participants: { include: { user... } } } sans limite

L'endpoint `GET /conversations/:id` utilise `include:` (pas `select:`) sur `participants`, ce qui charge **TOUS** les participants actifs sans limite de `take`. Pour une conversation publique ou communautaire avec 500+ membres, cela génère :

- 500 participants × (champs participant ~300 bytes + user imbriqué ~200 bytes) = **250 KB pour un seul appel**

Contrairement au `GET /conversations` (liste) qui applique `take: 5` sur les participants, l'endpoint de détail n'a aucun plafond.

**Payload estimé** :
- Conversation communautaire 200 membres : 200 × 500 bytes = **100 KB** (avant gzip)
- Conversation groupe 50 membres : 50 × 500 bytes = **25 KB**
- Conversation DM (2 membres) : minimal ~1 KB

**Sévérité** : CRITIQUE  
**Correction** : Ajouter `take: 50` sur `participants` dans l'include. Pour les grandes conversations, exposer un endpoint paginé dédié `GET /conversations/:id/participants`. Économie : jusqu'à **~225 KB** pour les grandes communautés.

### N+1 notification : findMany + update en boucle

`services/gateway/src/routes/conversations/core.ts:696–715`

Lors de chaque `GET /conversations/:id`, le gateway :
1. Exécute `prisma.notification.findMany({ where: { userId, isRead: false } })` — charge TOUTES les notifications non lues, sans limite, filtrage côté application sur `n.context?.conversationId`.
2. Exécute `prisma.notification.update({ where: { id: notif.id }, ... })` en **boucle séquentielle** (`for (const notif of relevantNotifications) { await prisma.notification.update(...) }`).

Si l'utilisateur a 50 notifications non lues, ce code effectue 1 findMany + 50 updates séquentiels à chaque ouverture de conversation.

**Coût** : 51 aller-retours MongoDB pour une opération qui devrait en coûter 1 (`updateMany` avec filtre sur `context.conversationId`).

**Sévérité** : CRITIQUE  
**Correction** :
```typescript
// Remplacer le findMany + boucle par :
await prisma.notification.updateMany({
  where: {
    userId,
    isRead: false,
    // MongoDB JSON field filter via Prisma raw or path filter
  },
  data: { isRead: true, readAt: new Date() }
});
```
Avec un index sur `(userId, isRead, context.conversationId)`. Économie : **N-1 aller-retours** à chaque ouverture de conversation.

---

## 3. GET /conversations/:id/messages

**Fichier** : `services/gateway/src/routes/conversations/messages.ts:255–1163`

### Traductions toujours incluses (champ Json potentiellement énorme)

`translations: true` est dans le `select` de base, indépendamment du paramètre `include_translations` (ligne 539). Le paramètre `include_translations` contrôle seulement la transformation (ligne 907), pas la récupération DB. Le champ JSON `translations` peut contenir des traductions pour 10+ langues, chacune avec un objet complet (id, messageId, sourceLanguage, targetLanguage, translatedContent, model, confidenceScore).

**Payload estimé** :
- Message avec 5 traductions : ~5 × 150 bytes = 750 bytes de traductions
- Page de 20 messages : 20 × 750 bytes = **15 KB** uniquement pour les traductions
- Conversation multilingue active (10 traductions/msg) : 20 × 1 500 bytes = **30 KB**

Quand `include_translations=false`, les données sont toujours fetchées depuis MongoDB mais filtrées en mémoire. Zero économie DB.

**Sévérité** : HAUTE  
**Correction** : Conditionner `translations: true` dans le `messageSelect` selon `includeTranslations`. Économie : jusqu'à **30 KB par page de messages** pour les conversations multilingues.

### replyTo avec attachmentFullSelect et take: 4

L'enrichissement `replyTo` inclut `attachments: { select: attachmentFullSelect, take: 4 }`. `attachmentFullSelect` charge tous les champs médias (transcription, translations audio, métadonnées). Pour 20 messages avec reply contenant des pièces jointes : ~4 × 2KB × 20 = **160 KB** supplémentaires.

**Sévérité** : MOYENNE  
**Correction** : Pour les replies affichées dans des bulles de citation, utiliser `attachmentForwardPreviewSelect` (version réduite) au lieu de `attachmentFullSelect`.

### Statuts de lecture calculés dynamiquement à chaque GET

Chaque appel à `GET /conversations/:id/messages` exécute :
1. `prisma.participant.findMany({ where: { conversationId, isActive: true } })` → charge tous les participants actifs
2. `prisma.conversationReadCursor.findMany({ where: { conversationId } })` → charge tous les curseurs

Pour 20 messages dans une conversation de 50 participants, cela génère ~50 × 20 comparaisons en mémoire. Ces données sont déjà disponibles dans les champs dénormalisés `deliveredCount`, `readCount` sur le message. Le calcul dynamique les écrase — cohérence maintenue mais double lecture inutile.

**Sévérité** : MOYENNE  
**Correction** : Supprimer le calcul dynamique et utiliser directement les champs dénormalisés `deliveredCount`/`readCount`. Ou s'assurer qu'un job de dénormalisation les maintient à jour.

---

## 4. Notifications — N+1 séquentiel dans GET /conversations/:id

Déjà décrit en section 2. Récapitulatif :

- **Fichier** : `services/gateway/src/routes/conversations/core.ts:696–715`
- **Pattern** : `findMany(toutes notifications)` + `update` en boucle séquentielle
- **Sévérité** : CRITIQUE
- **Overhead** : 1 + N aller-retours MongoDB où N = nombre de notifications non lues (peut atteindre 100+ sur un compte actif)

---

## 5. GET /notifications

**Fichier** : `services/gateway/src/routes/notifications-secured.ts:207–224`

### include profond sur message + attachments

```typescript
include: {
  message: {
    include: {
      attachments: {
        select: attachmentMediaSelect
      }
    }
  }
}
```

Chaque notification contient le message associé **avec tous ses attachments**. Pour une liste de 50 notifications (default + max), cela peut charger 50 × N_attachments objets de métadonnées.

**Payload estimé** (limite par défaut 20 items) :
- Notification "message" avec 3 pièces jointes : ~3 × 400 bytes = 1 200 bytes d'attachments
- 20 notifications × 1 200 bytes = **24 KB** en attachments seuls
- Ce payload n'est utilisé que pour afficher une preview — thumbnailUrl seul suffirait

**Sévérité** : HAUTE  
**Correction** : Remplacer l'include `attachments` complet par un `select` minimal (`id`, `thumbnailUrl`, `mimeType`).

### Limite par défaut élevée (50 items)

`useNotificationsQuery` en web utilise `limit: 50` par défaut (ligne 11 de `use-notifications-query.ts`). Combiné à l'include profond, 50 notifications × message + attachments = charge inutilement lourde.

**Sévérité** : BASSE  
**Correction** : Réduire le default à 20, paginer côté client.

---

## 6. Traductions toujours incluses dans les messages

Voir section 3. Récapitulatif global :

Le champ `translations` est un JSON stocké dans le document MongoDB Message. Il contient les traductions pour toutes les langues configurées. Il est sélectionné **inconditionnellement** dans `messageSelect` (ligne 539), même quand `include_translations=false`.

**Impact** :
- Conversations actives 6+ langues : ~900 bytes/message × 20 messages = **18 KB** de données inutiles par requête
- Impact cumulé sur mobile (connexion lente) : significatif

**Sévérité** : HAUTE

---

## 7. formatUserResponse — Fuite de champs sensibles/internes

**Fichier** : `services/gateway/src/routes/auth/types.ts:95–130`

`formatUserResponse` (utilisé dans `PATCH /users/me`) retourne :

- `lastLoginIp` — adresse IP de la dernière connexion
- `lastLoginDevice` — device fingerprint
- `lastLoginLocation` — localisation géographique
- `lastPasswordChange` — timestamp du dernier changement de mot de passe
- `profileCompletionRate` — métrique interne

Ces champs n'ont aucune utilité pour les actions client normales (update avatar, update langue). Ils représentent ~200 bytes par réponse de mutation de profil, mais surtout un vecteur de fuite d'information (IP, device, géolocalisation).

**Note** : `formatUserResponse` n'est utilisé que dans `PATCH /users/me` et les routes auth (login/register). L'utilisateur voit ses propres données, donc ce n'est pas un vecteur d'exposition inter-utilisateurs. Mais c'est du sur-transport inutile.

**Sévérité** : MOYENNE (sécurité + bande passante)  
**Correction** : Séparer `formatUserResponse` en `formatPublicUserResponse` (sans IP/device/location) et `formatPrivateUserResponse` (pour les routes auth seulement).

---

## 8. Compression HTTP absente côté Fastify

**Fichier** : `services/gateway/package.json`, `services/gateway/src/server.ts`

`@fastify/compress` n'est **pas installé** et n'est **pas enregistré** dans le serveur Fastify. Les réponses JSON du gateway ne sont pas compressées à la source.

La compression existe **en amont** via les configs nginx (`infrastructure/docker/nginx/`) et Caddy (`infrastructure/docker/caddy/dynamic.yaml`) pour les environnements Docker locaux/prod. Mais dans un déploiement direct (dev tmux sans Docker), ou si le reverse proxy est contourné, **toutes les réponses transitent sans compression**.

**Gain attendu avec gzip niveau 6 sur JSON** :
- Conversation list 37 KB → ~8 KB (ratio ~4.5×)
- Messages page 20 messages → ~6 KB → ~2 KB
- Notifications 50 items → ~40 KB → ~9 KB

**Sévérité** : HAUTE (critique pour les clients mobiles, les connexions lentes)  
**Correction** :
```bash
pnpm add @fastify/compress
```
```typescript
// server.ts
await fastify.register(import('@fastify/compress'), {
  global: true,
  encodings: ['br', 'gzip'],
  threshold: 1024
});
```
Économie : **3–5× sur tous les payloads JSON**.

---

## 9. Cache HTTP inexistant sur les endpoints JSON

**Fichier** : `services/gateway/src/routes/conversations/core.ts:545`, `messages.ts:1155`

Les deux endpoints principaux retournent :
```
Cache-Control: private, no-cache
```

C'est correct pour les données dynamiques (conversations, messages). Cependant, aucun `ETag` ni `If-None-Match` n'est implémenté sur ces routes, contrairement à `/attachments/file/*` qui l'implémente correctement (ligne 319–327 de `download.ts`).

**Endpoints qui bénéficieraient d'ETags** :
- `GET /conversations` avec `updatedSince` : permettrait une réponse 304 si aucune conversation n'a changé
- `GET /users/:id` : profil public statique — pas de Cache-Control du tout, ni ETag
- `GET /conversations/:id` : réponse 304 si conversation non modifiée depuis lastReadAt

**Sévérité** : MOYENNE  
**Correction** : Ajouter ETag basé sur `updatedAt` de la conversation/collection. Pour `GET /users/:id`, ajouter `Cache-Control: private, max-age=300` + `ETag: W/"${user.updatedAt.getTime()}"`. Les clients qui refetch sur windowFocus économiseraient des aller-retours complets.

---

## 10. iOS Socket.IO forcé en HTTP long-polling

**Fichiers** :
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift:1062–1068`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift:368–369`

Les deux managers Socket.IO iOS forcent `.forcePolling(true)`. Le commentaire explique que le transport WebSocket (Starscream) ne s'établissait pas de façon fiable.

**Impact bande passante** :
- HTTP long-polling = 1 requête HTTP par "tick" Engine.IO (polling interval par défaut : 1 seconde)
- Chaque requête HTTP ajoute ~800 bytes de headers HTTP (Cookie, Authorization, User-Agent, Accept, etc.)
- WebSocket overhead en continu : ~2–14 bytes par frame
- **Surcoût estimé** : 800 bytes × ~60 req/min × 60 min = **~2.8 MB/heure** d'overhead de headers seuls

Le long-polling implique aussi 2 connexions TCP (une pour le GET de polling, une pour le POST d'envoi) vs 1 connexion WebSocket.

**Sévérité** : CRITIQUE (iOS uniquement)  
**Correction** : Diagnostiquer et résoudre le problème de transport WebSocket avec Starscream. Alternativement, mettre à jour Socket.IO Client Swift (la lib a évolué). Le passage à WebSocket réduirait la bande passante de ~70–80 % sur les connexions idle.

---

## 11. Polling côté web — Friend Requests & Notifications

### Friend Requests

**Fichier** : `apps/web/hooks/v2/use-friend-requests-v2.ts:70,88`

```typescript
refetchInterval: 30000, // 2 requêtes toutes les 30s
```

Deux queries avec `refetchInterval: 30000` : `/friend-requests/received` et `/friend-requests/sent`. Chaque requête charge jusqu'à **100 items** (`limit: '100'`).

**Coût** : 2 requêtes × toutes les 30 secondes × durée de session. Pour un utilisateur actif 1h : **240 requêtes HTTP** inutiles. Ces données sont parfaitement gérables via Socket.IO events (`friend:request-received`, `friend:request-accepted`).

**Payload** : 100 friend requests × ~250 bytes ≈ 25 KB × 240 requêtes/heure = **~6 MB/heure** de bande passante pour les amis.

**Sévérité** : HAUTE  
**Correction** : Remplacer `refetchInterval` par une invalidation du cache React Query sur l'event Socket.IO correspondant. Supprimer `refetchInterval`.

### Notifications — unread count

**Fichier** : `apps/web/hooks/queries/use-notifications-query.ts:48`

```typescript
refetchInterval: 60 * 1000, // toutes les 60s
```

`useUnreadNotificationCountQuery` interroge le backend toutes les 60 secondes pour obtenir le count des non-lues. Cette information est émise via Socket.IO à chaque nouvelle notification.

**Sévérité** : MOYENNE  
**Correction** : Utiliser l'event Socket.IO `notification:new` pour invalider/incrémenter le cache local.

---

## 12. refetchOnWindowFocus: 'always' global

**Fichier** : `apps/web/lib/react-query/query-client.ts:25`

```typescript
refetchOnWindowFocus: 'always',
```

Configuré **globalement**, chaque fois que l'utilisateur revient sur l'onglet, **toutes** les queries actives sont refetchées. Avec `staleTime: Infinity`, les données en cache ne sont jamais considérées comme stale — ce qui est contradictoire avec le `refetchOnWindowFocus: 'always'` qui force un refetch même sur données fraîches.

**Impact** : Retour sur onglet après 1 minute = requêtes simultanées pour conversations, messages, notifications, users, preferences... Peut atteindre **10–15 requêtes simultanées** en burst.

**Sévérité** : MOYENNE  
**Correction** : Remplacer par `refetchOnWindowFocus: true` (respecte le staleTime) ou `false` (uniquement Socket.IO). Avec `staleTime: Infinity`, `refetchOnWindowFocus: 'always'` est redondant et coûteux.

---

## 13. GET /conversations/:id — participants sans limite

Détaillé en section 2. Récapitulatif :

- **Fichier** : `services/gateway/src/routes/conversations/core.ts:617–648`
- `include: { participants: { include: { user... } } }` sans `take:`
- Conversations communautaires 500+ membres : **250 KB par appel**
- **Sévérité** : CRITIQUE

---

## 14. Attachments — pas de Range Request sur /attachments/:id

**Fichier** : `services/gateway/src/routes/attachments/download.ts:27–125`

L'endpoint `GET /attachments/:attachmentId` sert le fichier original via `createReadStream(filePath)` sans support des Range Requests. Pour les fichiers audio/vidéo :

- Pas de header `Accept-Ranges: bytes`
- Pas de parsing du header `Range`
- Pas de réponse 206 Partial Content

En revanche, `GET /attachments/file/*` (ligne 207–397) supporte correctement les Range Requests avec 206.

**Impact** : Les clients iOS/web qui utilisent l'endpoint `/:attachmentId` pour streamer un audio de 5 MB doivent **télécharger l'intégralité du fichier** avant de pouvoir commencer la lecture. Seek dans un fichier audio = nouveau téléchargement complet.

**Sévérité** : HAUTE  
**Correction** : Ajouter le support Range Requests dans `GET /attachments/:attachmentId`, en réutilisant la logique déjà présente dans `GET /attachments/file/*`.

---

## 15. Thumbnails — taille 300×300 non configurable

**Fichier** : `services/gateway/src/services/attachments/MetadataManager.ts:57`

```typescript
private thumbnailSize: number = 300;
```

Toutes les thumbnails sont générées en 300×300 pixels JPEG. Pour l'affichage dans la liste des conversations (40×40 px sur mobile), c'est **~56× trop grand** en pixels. La différence de taille de fichier :

- Thumbnail 300×300 JPEG qualité 80 : ~15–25 KB
- Thumbnail 40×40 JPEG qualité 80 : ~2–3 KB
- **Surcoût** : ~20 KB par thumbnail

Sur une liste de 30 conversations avec images : 30 × 20 KB = **600 KB** de thumbnails surdimensionnées.

**Sévérité** : HAUTE  
**Correction** : Générer plusieurs tailles au moment de l'upload (40, 120, 300) ou utiliser un paramètre `w=` dans l'URL de thumbnail pour le resize à la demande avec Sharp. Les thumbnails 300px sont utiles pour l'affichage full-size dans la vue détail, mais 40px suffisent pour les listes.

---

## 16. Avatars/Banners — pas de resize on-the-fly

**Fichier** : `services/gateway/src/routes/users/profile.ts:271–391`

L'avatar est stocké comme une URL opaque. Le backend accepte n'importe quelle URL sans validation de taille ni resize. Les avatars peuvent être des images full-resolution (plusieurs MB) pointant vers le stockage local.

- `GET /users/:id` retourne `avatar: "https://gate.meeshy.me/api/v1/attachments/file/..."` — URL vers le fichier original
- Aucun paramètre `?w=` ou `?size=` n'est supporté

**Impact** : Affichage d'une liste de 30 utilisateurs → 30 requêtes d'avatars → potentiellement 30 × 2 MB = 60 MB si les avatars sont non-redimensionnés.

**Sévérité** : HAUTE  
**Correction** : Générer des variantes d'avatar (48px, 96px, 192px) à l'upload. Stocker les URLs des variantes en DB. À défaut, utiliser Sharp en middleware pour le resize à la demande (avec cache agressif `max-age=31536000`).

---

## 17. Stockage local (no CDN)

**Fichier** : `services/gateway/src/services/storage/MediaStorage.ts:1–18`

Les fichiers médias sont servis directement par le gateway Fastify (`createReadStream`) depuis un volume Docker local. Aucun CDN n'est en place (Cloudflare R2 mentionné comme roadmap future).

**Conséquences** :
- Chaque download passe par le gateway applicatif, consommant CPU et bande passante du serveur
- Pas de edge caching, latence élevée pour les utilisateurs géographiquement éloignés
- `Cache-Control: public, max-age=31536000, immutable` correctement positionné sur les attachments — mais sans CDN, les clients re-téléchargent depuis l'origine à chaque nouvelle session

**Sévérité** : HAUTE (infrastructure, pas correctif code seul)  
**Correction** : Migrer vers `S3CompatibleMediaStorage` avec Cloudflare R2. L'interface `MediaStorage` est déjà préparée pour cette migration (commentaire en ligne dans `MediaStorage.ts`).

---

## 18. Doublons participants/user dans GET /conversations

**Fichier** : `services/gateway/src/routes/conversations/core.ts:396–441`

Pour chaque appel `GET /conversations`, le code effectue :

1. Prisma `findMany` conversations avec `participants.user` (select de base ~6 champs)
2. Extrait tous les `userId` uniques des participants
3. Effectue un **second** `prisma.user.findMany` pour enrichir avec `firstName`, `lastName` (absents du select initial)
4. Merge les deux sources avec `userMap`

**Pourquoi** : Le `select` initial du participant inclut `user: { select: { id, username, displayName, avatar, isOnline, lastActiveAt } }` mais pas `firstName`/`lastName`. Le second `findMany` ajoute ces deux champs.

**Coût** : 1 requête MongoDB supplémentaire par appel `GET /conversations` chargeant les mêmes utilisateurs deux fois.

**Sévérité** : BASSE (1 requête en plus, mais en parallèle avec `userParticipants` et `totalCount`)  
**Correction** : Ajouter `firstName: true, lastName: true` dans le `user.select` du `participants` initial, éliminer le second `findMany` sur users.

---

## 19. Performance logging en production (console.log massif)

**Fichier** : `services/gateway/src/routes/conversations/core.ts:527–533`

```typescript
console.log('===============================================');
console.log('[CONVERSATIONS_PERF] Query performance breakdown (OPTIMIZED v2)');
console.log(`  - conversationsQuery: ${perfTimings.conversationsQuery?.toFixed(2)}ms`);
console.log(`  - parallelQueries (users+unread+count): ${perfTimings.parallelQueries?.toFixed(2)}ms`);
console.log(`  TOTAL: ${totalTime.toFixed(2)}ms`);
console.log('===============================================');
```

Ces `console.log` s'exécutent **à chaque appel** `GET /conversations` en production. Avec 100k messages/s, même les requêtes de liste peuvent être fréquentes. L'I/O synchrone de `console.log` peut bloquer l'event loop.

**Sévérité** : BASSE (performance gateway, pas bande passante client)  
**Correction** : Remplacer par `fastify.log.debug(...)` ou utiliser le logger Pino existant (`enhancedLogger`) au niveau `info` conditionnel.

---

## 20. Résumé des sévérités

| # | Problème | Fichier(s) | Sévérité | Économie estimée |
|---|---|---|---|---|
| 10 | iOS Socket.IO en long-polling | `MessageSocketManager.swift`, `SocialSocketManager.swift` | **CRITIQUE** | ~2.8 MB/heure d'headers |
| 2 | GET /conversations/:id — participants sans limite | `conversations/core.ts:617` | **CRITIQUE** | Jusqu'à 225 KB/appel |
| 4 | N+1 notification update en boucle séquentielle | `conversations/core.ts:696–715` | **CRITIQUE** | 1→N aller-retours MongoDB |
| 8 | Compression HTTP absente (Fastify) | `server.ts`, `package.json` | **HAUTE** | 3–5× sur tous les payloads |
| 14 | Pas de Range Request sur /attachments/:id | `attachments/download.ts` | **HAUTE** | Re-téléchargement complet audio/vidéo |
| 16 | Pas de resize avatars/banners | `users/profile.ts` | **HAUTE** | Potentiellement MBs par liste d'utilisateurs |
| 15 | Thumbnails 300×300 (56× trop grand) | `MetadataManager.ts:57` | **HAUTE** | ~20 KB/thumbnail × N items |
| 17 | Stockage local sans CDN | `MediaStorage.ts` | **HAUTE** | Latence + charge serveur origine |
| 11 | Polling friend requests (2 × 30s, limit 100) | `use-friend-requests-v2.ts` | **HAUTE** | ~6 MB/heure par utilisateur actif |
| 6 | Traductions toujours fetchées (inconditionnel) | `conversations/messages.ts:539` | **HAUTE** | Jusqu'à 30 KB/page messages |
| 5 | GET /notifications — include message+attachments profond | `notifications-secured.ts:212` | **HAUTE** | ~24 KB/liste notifications |
| 1 | GET /conversations over-fetching | `conversations/core.ts:229–346` | **HAUTE** | ~9 KB par appel liste |
| 3 | replyTo avec attachmentFullSelect | `conversations/messages.ts:644` | **MOYENNE** | ~160 KB/page avec replies |
| 12 | refetchOnWindowFocus: 'always' global | `query-client.ts:25` | **MOYENNE** | 10–15 requêtes burst sur focus |
| 9 | Pas d'ETags sur endpoints JSON | `core.ts:545`, `messages.ts:1155` | **MOYENNE** | Requêtes complètes au lieu de 304 |
| 7 | Fuite champs sensibles (lastLoginIp, device, location) | `auth/types.ts:95–130` | **MOYENNE** | ~200 bytes + sécurité |
| 13 | Statuts lecture recalculés dynamiquement | `conversations/messages.ts:790–818` | **MOYENNE** | 2 requêtes supplémentaires/page |
| 18 | Double fetch users (participants + userMap) | `conversations/core.ts:396–441` | **BASSE** | 1 requête MongoDB en moins |
| 11b | Polling notification unread count (60s) | `use-notifications-query.ts:48` | **BASSE** | ~60 req/heure |
| 19 | console.log perf en production | `conversations/core.ts:527–533` | **BASSE** | Event loop I/O |

---

## Priorités d'action recommandées

### Immédiat (< 1 jour)

1. **Ajouter `@fastify/compress`** dans le gateway — une ligne d'installation, 3 lignes de config. Gain immédiat 3–5× sur tous les payloads JSON.

2. **Corriger le N+1 notification** dans `GET /conversations/:id` — remplacer la boucle `for (notif) { await update }` par `updateMany` avec filtre sur `context.conversationId`.

3. **Ajouter `take: 50`** sur `participants` dans `GET /conversations/:id`.

### Court terme (< 1 semaine)

4. **Conditionner `translations: true`** dans `messageSelect` selon la valeur de `includeTranslations`.

5. **Supprimer `refetchInterval`** sur `use-friend-requests-v2.ts` — abonner à l'event Socket.IO à la place.

6. **Ajouter Range Request** dans `GET /attachments/:attachmentId`.

### Moyen terme (1–4 semaines)

7. **Résoudre le transport WebSocket iOS** — passage de `.forcePolling(true)` à WebSocket natif.

8. **Thumbnails multi-tailles** — générer 40px, 120px, 300px à l'upload.

9. **Migrer vers R2/S3** pour les médias (l'interface `MediaStorage` est prête).

10. **ETags sur conversations et messages** — réduire les réponses 200 en 304 sur les clients avec cache.
