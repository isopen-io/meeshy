# Comptage des vues anonymes (`postOpenCount`) — Design v1 « simple »

**Date** : 2026-06-17
**Statut** : Approuvé (brainstorming)
**Origine** : Backlog engagement reels — décision D1 (« compter aussi les vues anonymes »), `tasks/reels-engagement-followups.md`.
**Parti pris** : v1 volontairement **simple** (« comptage bête » à l'ouverture). La sécurité du compteur repose uniquement sur un **session header**. Les failles connues sont **documentées** (§ Sécurité) et assumées pour cette itération — pas de compte invité global, pas d'identité forte.

## Contexte (vérifié dans le code)

- Le nombre affiché « Vues totales du réel » = **`postOpenCount`** (`apps/ios/.../ReelsPlayerView.swift:599`, `PostDetailView.swift:1181`), pas `viewCount` ni `qualifiedViewCount`.
- Pour les inscrits, `postOpenCount` est dérivé des sessions d'engagement (surface `reels`/`detail`) via `POST /posts/engagement/batch` → `recordEngagementBatch` → `Post.postOpenCount { increment: 1 }` (additif).
- `POST /posts/engagement/batch` **rejette les anonymes** (`if (!authContext?.registeredUser) return 401`). L'`EngagementOutbox`/`EngagementTracker` iOS ne tourne pas pour un viewer web anonyme.
- **Identité anonyme actuelle** = un `Participant` (`type='anonymous'`) **conv-scopé** (`conversationId` non-nullable), créé via `/anonymous/join/:linkId`. Pas de `User` anonyme. Un `Post` **n'appartient pas** à une conversation (`authorId` + `visibility` seulement). → un viewer d'un reel autonome n'a pas forcément d'identité Meeshy.

Conséquence assumée pour v1 : on ne crée **pas** d'identité Meeshy forte pour le viewer anonyme. On se contente d'un **session header** (token de session) comme clé de déduplication faible.

## Objectif

Un viewer **non authentifié** qui ouvre un reel/post (via `/l/token` redirigé vers la page web, ou URL directe `/reel|post|story|mood/[postId]`, ou iOS en compte anonyme) incrémente `postOpenCount` **une fois par session**, sans passer par le parcours engagement inscrit.

Critère de succès : ouvrir un reel public sans compte incrémente `postOpenCount` une fois ; recharger la page dans la même session n'incrémente pas ; un viewer inscrit (JWT) ne passe pas par ce chemin.

## Architecture

```
Viewer anonyme (web sans JWT, ou iOS compte anonyme)
  └─ ouvre /reel|post|story|mood/[postId]
       └─ POST /api/v1/posts/:id/anonymous-view
            header: X-Session-Token: <sessionKey>     (voir § Identité)
            gateway (optionalAuth, rate-limit IP)
              ├─ JWT inscrit présent ?  → no-op (parcours engagement inscrit gère postOpenCount)
              ├─ sessionKey absent ?    → 400
              ├─ post PUBLIC + non supprimé ? sinon → no-op
              └─ INSERT AnonymousPostOpen(postId, sessionKey)  [unique]
                   └─ si 1ᵉʳ insert → Post.postOpenCount { increment: 1 }
```

### Identité = session header (simple, faible, assumé)

La clé de dédup `sessionKey` provient du **header `X-Session-Token`** :
- **iOS en compte anonyme** : le `sessionToken` du `Participant` anonyme existant (déjà envoyé par l'app).
- **Web sans compte** : un token de session **persisté par le navigateur** — réutilise `localStorage.session_token` s'il existe, sinon un token généré (UUID v4) persisté en `localStorage` (`meeshy_session_token`). Helper unique web `lib/anonymous-session.ts → getOrCreateWebSessionKey()`.
- **Inscrit (JWT)** : ne tire pas ce ping (le parcours engagement gère). Si le ping arrive quand même avec un JWT valide → no-op côté serveur.

Aucune création de `Participant`/`User` côté serveur : la `sessionKey` n'est qu'une chaîne opaque de dédup. C'est **délibérément** un identifiant faible (cf. § Sécurité).

> **Piège d'auth à valider en impl** : un token navigateur généré (`meeshy_session_token`) **n'est pas** un session token de `Participant` — `createAnonymousUserContext` lève « Anonymous participant not found » s'il tente de le résoudre. L'endpoint doit (a) ne détecter qu'un **JWT inscrit** pour le no-op, et (b) lire `X-Session-Token` **directement comme chaîne opaque** sans exiger qu'il résolve un Participant. Vérifier que le middleware retenu (`optionalAuth` ou lecture directe du header) **ne 401 pas** sur un session token inconnu pour cette route.

### Gateway — endpoint public

- **Route** : `POST /posts/:postId/anonymous-view`, `preValidation: [optionalAuth]`, `config: { rateLimit: createPostRouteRateLimitConfig('anonymous-view') }`.
- **Entrée** : `sessionKey` lu depuis le header `X-Session-Token` (Zod : non vide, ≤ 128 chars, sanitize). Pas de corps requis.
- **Logique** (`PostService.recordAnonymousOpen(postId, sessionKey)`) :
  1. `authContext?.registeredUser` présent → `{ counted: false }` (no-op anti double-comptage).
  2. Charger le post via `buildVisibilityFilter(undefined)` (= `{ visibility: PostVisibility.PUBLIC }`, source de vérité existante) + `deletedAt: NOT_DELETED`. Introuvable → `{ counted: false }`. **Ne pas** utiliser le booléen legacy `isPublic`.
  3. Dédup INSERT-only : `prisma.anonymousPostOpen.create({ postId, sessionKey })`. Conflit unicité `(postId, sessionKey)` (P2002) → `{ counted: false }`.
  4. Insert réussi → `Post.postOpenCount { increment: 1 }` → `{ counted: true }`.
  - Erreurs de course avalées → `{ counted: false }` (comme `recordView`).
- **Réponse** : `sendSuccess(reply, { counted })`.

### Schéma Prisma (`packages/shared/prisma/schema.prisma`)

```prisma
model AnonymousPostOpen {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  postId     String   @db.ObjectId
  sessionKey String
  createdAt  DateTime @default(now())
  post       Post     @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([postId, sessionKey])
  @@index([postId])
}
```

- `Post` gagne `anonymousOpens AnonymousPostOpen[]`. Unicité sur deux champs **non-nullables** → pas de piège d'index partiel MongoDB. Régénérer le client Prisma.

### Données / cohérence

- `postOpenCount` reste **additif** des deux sources (engagement inscrit + ouverture anonyme). Aucune ne fait `set`.
- `viewCount`, `qualifiedViewCount`, `PostView` ne sont pas touchés.

## Sécurité du compteur — problématiques connues (assumées en v1)

Ce compteur est **délibérément faible**. À documenter et accepter pour cette itération ; durcissement = itération future.

1. **Identité non vérifiée** : la `sessionKey` est fournie par le client (header). Vider le localStorage / navigation privée / nouvel appareil → nouvelle session → **re-comptage**. Le compteur est donc gonflable par un utilisateur déterminé.
2. **Spoofing du header** : un script peut envoyer des `X-Session-Token` arbitraires → fabriquer un nombre illimité de sessions « uniques » → inflation directe. Seul le **rate-limit par IP** borne ce vecteur.
3. **Rate-limit IP grossier** : NAT/IP mobile partagée sous-compte les viewers légitimes ; un attaquant qui tourne ses IP contourne la limite.
4. **Pas d'anti-bot** : aucun CAPTCHA / proof-of-work. Des ouvertures automatisées gonflent le compteur.
5. **Signal mixte** : `postOpenCount` agrège un signal **de confiance** (engagement inscrit authentifié) et un signal **faible** (ouverture anonyme). Le nombre affiché ne vaut que par son maillon le plus faible. Si l'intégrité devient importante, envisager un champ `anonymousOpenCount` séparé (affiché en somme) pour pouvoir auditer/écrêter l'anonyme indépendamment.
6. **Pas d'expiration de dédup** : `AnonymousPostOpen` croît sans TTL ; un même reel viral accumule beaucoup de lignes. Acceptable v1 ; prévoir purge/TTL si volumétrie.

**Tradeoff assumé** : simplicité > intégrité du compteur pour v1. Chemin de durcissement = compte invité réel (`User` `isAnonymous`) ou `sessionKey` signée côté serveur, à reprendre si l'abus se matérialise.

## Cas limites

- Post privé/FRIENDS : filtre de visibilité PUBLIC → no-op.
- Post supprimé entre ouverture et ping : `deletedAt` filtré → no-op.
- `sessionKey` absente/vide : 400.
- JWT inscrit présent : no-op (anti double-comptage).
- Double ping simultané (même clé) : unicité DB → un seul incrément (2ᵉ create = P2002 → no-op).

## Tests

**Gateway (jest)** :
- 1ᵉʳ ping anonyme, post public → `postOpenCount` +1, `counted: true`.
- 2ᵉ ping même `(postId, sessionKey)` → no-op, compteur inchangé.
- Ping avec JWT inscrit → no-op.
- Post non public → no-op. Post supprimé → no-op.
- `X-Session-Token` absent/vide → 400.

**Web** :
- `getOrCreateWebSessionKey()` : réutilise `session_token` si présent, sinon génère + persiste `meeshy_session_token` stable entre appels.
- Ping tiré une fois au montage en anonyme ; jamais en présence d'un JWT.

## Hors scope

- Compte invité global (`User` anonyme) : chemin de durcissement futur, pas v1.
- Capture web pour viewers **inscrits** (engagement iOS-only) : gap préexistant distinct.
- Vue « qualifiée » anonyme (watch-time/position web) : on compte l'**ouverture**, cohérent avec `postOpenCount`.
- Listing « seen-by » des anonymes.
