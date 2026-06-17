# Comptage des vues anonymes (`postOpenCount`) — Design

**Date** : 2026-06-17
**Statut** : Approuvé (brainstorming)
**Origine** : Backlog engagement reels — décision D1 (« compter aussi les vues anonymes »), `tasks/reels-engagement-followups.md`.

## Contexte

Le nombre affiché « Vues totales du réel » dans l'UI est **`postOpenCount`** (`apps/ios/.../ReelsPlayerView.swift:599`, `PostDetailView.swift:1181`), **pas** `viewCount` ni `qualifiedViewCount`. Pour les utilisateurs inscrits, `postOpenCount` est dérivé des sessions d'engagement (surface `reels` OU `detail`) ingérées par `POST /posts/engagement/batch` → `PostService.recordEngagementBatch`, qui fait `Post.postOpenCount { increment: 1 }` (additif, INSERT-only par session).

Aujourd'hui ce parcours est **inscrit-seulement** :
- `POST /posts/engagement/batch` rejette les anonymes (`if (!authContext?.registeredUser) return 401`).
- `PostService.recordView` (qui alimente `viewCount`, distinct) exige un `userId` inscrit et déduplique par `PostView(postId, userId)`.
- L'`EngagementOutbox` / `EngagementTracker` iOS ne tourne **pas** pour un viewer web anonyme.

Conséquence : un visiteur non-inscrit qui ouvre un reel via un lien partagé `/l/token` (redirigé vers la page web) ou directement `/reel/[id]` **n'est jamais compté**. Cela sous-estime le « Vues totales » que le produit veut afficher.

## Objectif

Un viewer **non authentifié** qui ouvre un reel/post (via `/l/token` ou URL directe `/reel|post|story|mood/[postId]`) incrémente `postOpenCount`, **dédupliqué par viewer** (un refresh ne regonfle pas), de façon **découplée** de la capture engagement iOS.

Critère de succès : ouvrir un reel public dans un navigateur sans compte incrémente `postOpenCount` une fois ; recharger la page ne l'incrémente pas ; ouvrir avec un compte connecté ne passe pas par ce chemin (pas de double-comptage).

## Architecture

```
Visiteur anonyme (web)
  └─ monte /reel|post|story|mood/[postId]  (pas de JWT)
       └─ POST /api/v1/posts/:id/anonymous-view   { viewerKey }
            gateway (optionalAuth, rate-limit IP)
              ├─ JWT présent ?            → no-op (parcours inscrit gère postOpenCount)
              ├─ post public + non supprimé ? sinon → no-op
              └─ INSERT AnonymousPostOpen(postId, viewerKey)  [unique]
                   └─ si 1ᵉʳ insert → Post.postOpenCount { increment: 1 }
```

### Composant 1 — Web : déclencheur + `viewerKey`

- **Où** : au montage des pages réelles v1 `/post|reel|story|mood/[postId]` (ré-exportées depuis `/feeds/post/[postId]`). Un seul point de déclenchement couvre les deux entrées (lien `/l/token` ET URL directe), puisque la page `/l/token` redirige vers cette page.
- **Condition** : tirer le ping **uniquement si le visiteur n'a pas de JWT** (anonyme). Si JWT présent, ne rien faire (le parcours inscrit s'en charge).
- **`viewerKey`** : `localStorage.session_token` s'il existe (anonyme ayant déjà rejoint une conversation) **sinon** `meeshy_viewer_id` — un UUID v4 généré et persisté en `localStorage` au premier besoin. Helper unique côté web (ex : `lib/anonymous-viewer.ts` → `getOrCreateViewerKey()`).
- **Fire-and-forget** : le ping ne bloque jamais le rendu ; échec réseau silencieux.
- **Idempotence client** : tirer au plus une fois par montage de page (pas à chaque re-render).

### Composant 2 — Gateway : endpoint public

- **Route** : `POST /posts/:postId/anonymous-view`, `preValidation: [optionalAuth]`, `config: { rateLimit: createPostRouteRateLimitConfig('anonymous-view') }`.
- **Corps** : `{ viewerKey: string }` (Zod : non vide, longueur bornée ex. ≤ 128, sanitize).
- **Logique** (`PostService.recordAnonymousOpen(postId, viewerKey)`) :
  1. Si `authContext?.registeredUser` présent → retour `{ counted: false }` (no-op, évite le double-comptage).
  2. Charger le post via le filtre de visibilité **anonyme existant** — `buildVisibilityFilter(undefined)` qui retourne `{ visibility: PostVisibility.PUBLIC }` (source de vérité unique, déjà utilisée par `getPostById`/`recordView`). Combine avec `deletedAt: NOT_DELETED`. Post introuvable (non public ou supprimé) → no-op. Ne PAS utiliser le booléen legacy `isPublic`.
  3. **Dédup INSERT-only** : tenter `prisma.anonymousPostOpen.create({ postId, viewerKey })`. Sur conflit d'unicité `(postId, viewerKey)` (P2002) → no-op (`{ counted: false }`).
  4. Sur insert réussi → `prisma.post.update({ where: { id }, data: { postOpenCount: { increment: 1 } } })` → `{ counted: true }`.
  - Toute erreur de course = avalée (retour `{ counted: false }`), comme `recordView`.
- **Réponse** : `sendSuccess(reply, { counted })`.

### Composant 3 — Schéma Prisma (`packages/shared/prisma/schema.prisma`)

Nouveau modèle léger, miroir de `PostView` mais clé anonyme :

```prisma
model AnonymousPostOpen {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  postId    String   @db.ObjectId
  viewerKey String
  createdAt DateTime @default(now())
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([postId, viewerKey])
  @@index([postId])
}
```

- `Post` gagne la relation inverse `anonymousOpens AnonymousPostOpen[]`.
- L'unicité `@@unique([postId, viewerKey])` porte sur deux champs **non-nullables** → pas de piège MongoDB index partiel (contrairement aux nullable). Régénérer le client Prisma.

### Données / Cohérence

- `postOpenCount` reste **additif** (`{ increment: 1 }`) des deux sources (engagement inscrit + anonyme direct). Aucune ne fait `set`. Total = ouvertures inscrites + ouvertures anonymes dédupliquées.
- `viewCount`, `qualifiedViewCount`, `PostView` ne sont **pas** touchés.

### Anti-abus

- **Dédup par `(postId, viewerKey)`** : un même navigateur compte une fois par post.
- **Rate-limit par IP** sur l'endpoint (réutilise le pattern `createPostRouteRateLimitConfig`) : limite la fabrication massive de `viewerKey` jetables depuis une même IP.
- `viewerKey` borné + sanitizé (pas d'injection, taille maîtrisée).

## Cas limites

- **Post privé / FRIENDS** ouvert par anonyme : la page/lien ne devrait pas l'exposer ; l'endpoint refuse quand même (no-op) si non public.
- **Post supprimé entre l'ouverture et le ping** : `deletedAt` filtré → no-op.
- **Auteur** : un auteur anonyme n'existe pas (les auteurs sont inscrits) ; si JWT auteur → branche no-op (1).
- **`viewerKey` absent/vide** : Zod rejette (400) ; le web garantit toujours une clé.
- **Course (double ping simultané)** : l'unicité DB garantit un seul incrément (le 2ᵉ create lève P2002 → no-op).

## Tests

**Gateway (jest)** :
- 1ᵉʳ ping anonyme sur post public → `postOpenCount` +1, `counted: true`.
- 2ᵉ ping même `(postId, viewerKey)` → no-op, `counted: false`, compteur inchangé.
- Ping avec JWT inscrit → no-op (pas de double-comptage).
- Post non public → no-op.
- Post supprimé → no-op.
- `viewerKey` vide → 400.

**Web** :
- `getOrCreateViewerKey()` : réutilise `session_token` si présent, sinon génère+persiste `meeshy_viewer_id` stable entre appels.
- Le ping est tiré une fois au montage en anonyme, jamais en présence d'un JWT.

## Hors scope (gaps préexistants, non traités ici)

- Les **inscrits sur le web** ne déclenchent pas de capture engagement (iOS-only) → `postOpenCount` web-inscrit non compté. Problème distinct, à traiter séparément si besoin.
- Pas de distinction « vue qualifiée » pour l'anonyme (pas de watch-time/position côté web ici) : on compte **l'ouverture**, cohérent avec la sémantique de `postOpenCount`.
- Pas de listing « seen-by » des anonymes (pas d'identité affichable).
