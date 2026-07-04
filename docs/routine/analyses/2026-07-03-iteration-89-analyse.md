# Iteration 89 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `72cde65` (« docs android/calls #1418 »). Branche de travail `claude/brave-archimedes-1vl4me`
recréée à neuf depuis `origin/main` (working tree propre, aucun commit non-mergé à préserver).

PR ouvertes au démarrage : #1419 (iOS typing roster), #1416 (gateway realtime `MessageHandler`),
#1414 (calls — `CallEventsHandler` + iOS), #1413/#1412/#1410 (iOS bubble/calls/a11y). Cible retenue
**hors de tous ces fichiers** : `PostService.ts` (feature STORIES, Priorité 1, en développement
actif — cf. commits récents G2/G3/W1 sur la traduction des stories). Aucun conflit de merge attendu.

Méthode : fan-out de 3 agents d'exploration en parallèle (stories gateway, social feed gateway,
shared utils). Retenu le défaut le plus fort et le plus impactant : dérive de champ renommé sur le
texte des overlays de story.

## Cible : la gateway lit le texte des overlays de story via le champ legacy `content` au lieu de `text`

### Current state
Le composer iOS encode le texte d'un overlay de story sous la clé **`text`** ; `content` est
l'alias **legacy** pré-renommage. Cette réalité est actée partout dans la stack :
- Zod `StoryTextObjectSchema` (`routes/posts/types.ts:104-105`) : `text` canonique, `content`
  marqué `// legacy field`.
- iOS SDK `StoryModels.swift:247` : `public var text: String  // was: content (RENAMED)` ; l'encodeur
  écrit sous `text`.
- Web `apps/web/lib/story-transforms.ts:56-61` : **déjà corrigé** — « The iOS composer encodes the
  overlay text under `text`; `content` is a legacy one — without this the web dropped every text
  overlay iOS sent. »

Seule la **gateway** (`PostService.ts`) lisait encore `.content` uniquement, à **3 endroits** :
1. `createPost` l.206 — index de recherche (`searchContent = textObjects.map(t => t.content)`).
2. `createPost` l.232 — contenu de tracking des liens bruts.
3. `triggerStoryTextObjectTranslation` l.392 — `const text = obj.content?.trim()` → le texte envoyé
   au pipeline de traduction NLLB (ZMQ `translateTextObject`).

L'interface `StoryTextObjectRaw` (l.19-25) déclarait même `content: string` (requis) — dérive de type
figée sur l'ancien nom.

### Problems identified
Pour toute story créée par iOS (le producteur réel de ces overlays), `obj.content` vaut `undefined` :
- **Traduction** : `if (!text) return;` → **aucun job ZMQ n'est jamais émis** → `translations` reste
  vide → les viewers non-francophones voient le texte de l'overlay **non traduit**. Violation directe
  du **Prisme Linguistique** (le contenu doit s'afficher dans la langue préférée du viewer).
- **Index de recherche** : `searchContent` vide → la story n'est pas indexée sur le texte de ses
  overlays (invisible en recherche).
- **Tracking de liens** : une URL brute posée dans un overlay iOS n'est pas trackée.

### Root cause
Motif récurrent « champ renommé propagé partout SAUF un consommateur » (leçons #40/#42/#45/#55 :
règle non homogène entre siblings). Le renommage `content → text` a été appliqué au schéma Zod, au
modèle iOS et au transform web, mais la couche service gateway a été oubliée — alors même que le web
avait déjà rencontré et documenté exactement ce bug.

### Business impact
Feature STORIES en développement actif (Priorité 1). Les overlays de texte sont un usage central des
stories ; leur texte n'était ni traduit, ni recherchable, ni tracké dès lors que la story venait
d'iOS. Impact perçu directement par tout viewer d'une langue différente de l'auteur.

### Technical impact
1 helper statique pur (`PostService.storyTextObjectText`, SSOT de la résolution `text ?? content`),
3 sites de lecture reroutés dessus, interface élargie (`text?`/`content?` optionnels). Zéro nouvelle
dépendance, zéro changement de signature publique, zéro requête supplémentaire. Rétro-compatible : les
stories legacy (champ `content`) continuent de fonctionner.

### Risk assessment
TRÈS FAIBLE. Le helper ne fait qu'ajouter une source (`text`) prioritaire sur la source existante
(`content`), en miroir exact du décodeur iOS et du transform web. Aucun comportement changé pour une
story qui ne portait que `content`. Aucun tradeoff (contrairement au fix `getReels` — écarté car il
réduirait la largeur du pool de découverte).

### Proposed improvements
1. `static storyTextObjectText(obj): string | undefined` = `text` (canonique) sinon `content`
   (legacy) sinon `undefined`.
2. Rerouter les 3 sites (`searchContent`, `trackingContent`, `triggerStoryTextObjectTranslation`).
3. Interface `StoryTextObjectRaw` : `text?` + `content?` optionnels.

### Expected benefits
- Les overlays iOS sont traduits (Prisme), indexés en recherche et trackés — parité avec le web.
- SSOT de la résolution du champ overlay-text côté gateway (un seul point à faire évoluer).

### Implementation complexity
TRÈS FAIBLE — 1 helper + 3 one-liners + interface. 8 tests neufs (helper pur ×4, index de recherche
via `createPost` ×1, trigger de traduction ×3).

### Validation criteria
- [x] `PostService.storyTextObjectField.test.ts` : 8/8 verts.
- [x] RED prouvé : sans le fix (3 sites revenus à `.content`), les 2 tests `text`-only échouent
  (index de recherche vide + ZMQ non appelé) ; les tests legacy `content` + helper pur restent verts.
- [x] Suites `story|Post|post` : 54 suites / 1218 tests verts, 0 régression.
- [x] `tsc --noEmit` gateway : 0 nouvelle erreur (baseline pré-existant `@meeshy/shared/prisma/client`
  inchangé, 310 après build de shared, aucune ne référence les symboles neufs).

## Améliorations futures (report)
- **F52** (MEDIUM) : `triggerStoryTextTranslation` (caption) ne retire pas la langue source du set
  cible avant l'envoi ZMQ — asymétrie avec son sibling `triggerStoryTextObjectTranslation` (l.402 qui
  filtre). Une caption `fr` pour une audience `fr` déclenche un job `fr→fr` et réécrit `translations.fr`
  (self-translation). Chantier propre pour une itération dédiée (même fichier).
- **F53** (HIGH) : `getReels` (`PostFeedService.ts:479-485`) pagine par score puis prend le curseur sur
  l'item score-ordonné, alors que la requête avance chronologiquement → réels skippés/dupliqués en
  infinite scroll. Le sibling `getFeed` documente et évite exactement ce bug (fenêtre chronologique).
  Fix = miroir de `getFeed`, mais réduit le pool de scoring (décision produit) → itération dédiée.
- **F54** (HIGH) : `languageCodeSchema` (`packages/shared/utils/attachment-validators.ts:57-62`) rejette
  les codes ISO 639-3 supportés (`bas`/`ksf`/`nnh`/`dua`/`ewo`) — même classe que le fix `CommonSchemas
  .language` de l'itération 86-B. Widen le regex `{2}` → `{2,3}`.
- **F51** : supprimer/fusionner `FirebaseNotificationService` (dead code FCM parallèle) — report iter 87/88.

---

# Iteration 89 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `018750c` (« story view receipts durable via the outbox — R6 », HEAD au démarrage).
Branche de travail `claude/brave-archimedes-eihm6t` recréée à neuf depuis `origin/main` (working
tree propre, aucun commit non-mergé à préserver).

PR ouvertes au démarrage : #1413 (iOS bubble — debounce sending clock), #1412 (iOS calls — TURN
refresh retry + busy feedback), #1410 (iOS a11y — Dynamic Type). **Les trois sont iOS/SwiftUI** ;
cet environnement Linux n'a ni toolchain Swift ni MongoDB live. Cible retenue **backend gateway
purement vérifiable en jest** (assertion de la FORME de la clause `where`), **hors de tous ces
fichiers** — aucun conflit de merge attendu.

Méthode : fan-out de 2 agents d'exploration parallèles sur des clusters disjoints (social/posts vs
messaging/conversations), chacun chargé de trouver le motif récurrent « garde/règle appliquée à UNE
méthode mais pas à ses siblings structurellement identiques ». Cible retenue = la plus haute
sévérité **et** confiance parmi les candidats, confirmée par lecture directe du code.

## Cible iter 89 — Fuite de contenu supprimé dans les previews « dernier message »

### Current state
La liste de conversations canonique (`GET /conversations`, `routes/conversations/core.ts:364-367`)
filtre les messages soft-deleted hors de la preview « dernier message » :
```ts
messages: {
  where: { deletedAt: null },            // ← garde soft-delete présente (SSOT)
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: { … },
}
```
C'est la source de vérité : quand le dernier message d'une conversation est supprimé, la preview
recule correctement sur le message précédent non-supprimé.

**Deux siblings servent la MÊME preview `messages[0]` sans cette garde :**

1. **`GET /conversations/search`** (`routes/conversations/search.ts:120-144`) — la recherche de
   conversations. Le bloc `messages` faisait `orderBy: { createdAt: 'desc' }, take: 1` **sans**
   `where: { deletedAt: null }`. Le commentaire du code (l.181-186) dit pourtant explicitement
   « Mirror exactly what `core.ts` does » — mais la garde soft-delete n'a jamais été mirrorée.
   `messages[0]` est émis tel quel comme `lastMessage` (content + attachments).

2. **`GET /users/me/dashboard-stats`** (`routes/users/preferences.ts:155-170`) — les conversations
   récentes du dashboard. Le bloc `messages` avait le même trou. Ironie : le `participant.count`
   **une ligne au-dessus** (l.128-135, comptage des conversations « actives sur 24h ») applique
   déjà `deletedAt: null` dans son `messages.some` — la garde était donc présente et disponible dans
   le MÊME handler, juste pas répliquée sur la preview.

### Problems identified
1. **FUITE DE CONTENU SUPPRIMÉ (correction + confidentialité)** : quand le dernier message d'une
   conversation est soft-deleted, il continue d'apparaître comme preview « dernier message » dans
   deux surfaces — la recherche de conversations et le dashboard — alors qu'il a disparu de la liste
   principale. Le contenu (et pour la recherche, les pièces jointes) d'un message que
   l'utilisateur/modérateur a explicitement supprimé reste exposé.
2. **INCOHÉRENCE INTER-SURFACES** : la même conversation affiche deux « derniers messages »
   différents selon qu'on la voie dans la liste (correct) ou via la recherche/dashboard (message
   fantôme). Régression fonctionnelle directe.

### Root cause
Motif récurrent « fix/règle appliqué à un sous-ensemble de siblings, pas audité sur tous »
(leçons #40/#42/#45/#50/#55/#56/#57). La garde `deletedAt: null` vit dans `core.ts` (la liste
principale, écrite/optimisée en premier et la plus testée). `search.ts` et `dashboard-stats` ont
copié la **structure** du bloc `messages` (`orderBy`/`take`/`select`) sans copier le **filtre** —
exactement comme la leçon #56 (`getFeed` avait divergé de `buildVisibilityFilter`) et la leçon #57
(`routes/messages.ts` DELETE était le sibling REST oublié du curseur `lastMessageAt`).

### Business impact
- Un message supprimé (par pudeur, erreur, ou modération) qui reste visible en preview = brèche de
  confiance produit réelle. Sur la recherche, les pièces jointes du message supprimé fuitent aussi.
- Incohérence visible : la liste dit « dernier message = X », la recherche dit « = Y (supprimé) ».

### Technical impact
Ajout de `where: { deletedAt: null }` au bloc `messages` dans les deux siblings, mirror exact de
`core.ts`. Zéro changement de signature, zéro nouvelle requête, zéro impact perf (le filtre est
appliqué par le query engine sur un `take: 1` déjà indexé sur `createdAt`).

### Risk assessment
Très faible. Le changement RESTREINT le jeu de messages considéré pour la preview (exclut les
supprimés) — comportement déjà en production sur la liste principale depuis toujours. Aucun chemin
ne dépend de voir un message supprimé en preview. Les tests existants qui passent une preview de
message **non-supprimé** (fixtures sans `deletedAt`) restent verts (le filtre ne les exclut pas).

## Audit d'exhaustivité (toutes les previews « dernier message » énumérées)
`grep` sur `messages: { … take: 1 … orderBy: createdAt desc }` dans `routes/`, `services/`,
`socketio/` : **exactement 3 sites** servent une preview « dernier message d'une conversation » :
- `core.ts:364` — **HAS** la garde (SSOT) ✓
- `search.ts:120` — **MISSING** → corrigé
- `preferences.ts:155` — **MISSING** → corrigé

Aucun autre sibling (les autres `take: 1` sont des previews d'attachments/média, hors périmètre ;
tous les comptages `unread`/`stats`/`recompute` appliquent déjà `deletedAt: null` — confirmé par
l'agent d'exploration messaging). Le sweep est **complet**.

## Candidats écartés ce cycle (documentés, pas silencieusement abandonnés)
- **`PostFeedService.getReels` curseur non-monotone vs `getFeed`** (agent social, candidat 1) : bug
  réel de pagination (reels dupliqués/sautés en scroll infini) mais **plus risqué à corriger** (la
  dérivation du curseur touche la sémantique de pagination) et **sévérité moindre** que la fuite de
  contenu supprimé. Reporté à une itération dédiée.
- **`PostService.buildVisibilityFilter` n'inclut pas les contacts DM** vs les feed methods (agent
  social, candidat 2) : sur-restrictif (une story visible dans le tray renvoie 404 à l'ouverture
  pour un contact DM non-ami) — direction SAFE (pas une fuite), reporté.
- **`recordEngagementBatch` double-incrément sous course** (agent social, candidat 3) : dérive
  d'agrégats dénormalisés uniquement (la row `PostEngagement` reste idempotente) — famille
  compteurs déjà largement traitée (iter 79→87), rendement décroissant, reporté.

## Validation criteria
1. `where: { deletedAt: null }` présent dans le bloc `messages` de `search.ts` ET `preferences.ts`,
   forme identique à `core.ts`.
2. Test RED→GREEN dans `search.test.ts` : assert `findMany.mock.calls[0][0].include.messages.where`
   === `{ deletedAt: null }`.
3. Test RED→GREEN dans `preferences-dashboard.test.ts` : assert
   `findMany.mock.calls[0][0].select.messages.where` === `{ deletedAt: null }`.
4. Suites existantes `search.test.ts` + `preferences-dashboard.test.ts` vertes (aucune régression).

---

# Iteration 89 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `cfd152ab` (« android/calls auto-dismiss call-waiting banner » — HEAD au démarrage).
Branche de travail `claude/brave-archimedes-yc8t7h` alignée sur `origin/main` (working tree
propre, aucun commit non-mergé à préserver).

PR ouverte au démarrage : #1410 (iOS Dynamic Type `MoodReplyConfirmationOverlay`, fichier
`StatusBubbleController.swift`). Cible retenue **hors de ce fichier** (aucun conflit de merge
attendu) et **côté gateway TypeScript** — validable en local (RED→GREEN), contrairement aux
changements iOS qui nécessitent un toolchain macOS absent de cet environnement.

## Cible : propager `deviceLocale` (Prisme 4e priorité) aux 2 derniers points de résolution de langue côté gateway

### Current state
L'extension du Prisme Linguistique du **2026-05-26** (`docs/superpowers/plans/2026-05-26-device-locale-fourth-priority-plan.md`)
a ajouté la **locale appareil en 4e priorité** de la résolution de langue :
`systemLanguage → regionalLanguage → customDestinationLanguage → deviceLocale → 'fr'`.
La source de vérité `resolveUserLanguage()` (`packages/shared/utils/conversation-helpers.ts`)
accepte désormais `{ deviceLocale }` en 2e argument, et la locale est persistée
opportunément dans `User.deviceLocale` (header `X-Device-Locale`).

Le plan a câblé `deviceLocale` sur plusieurs chemins :
- `NotificationService.resolveRecipientLang` / `resolveRecipientLangs` → `resolveUserLanguage(user, { deviceLocale })` ✓
- chemin socket (connexion) → `resolveUserLanguagesOrdered(prefs, { deviceLocale })` (AuthHandler, `resolved-languages-refresh`) ✓
- destinations translator → `getRequiredLanguages` / `resolveUserLanguagesOrdered` ✓

### Problems identified
**Deux points de résolution `resolveUserLanguage` côté gateway n'ont jamais reçu le `deviceLocale`** —
ils sont restés sur la signature legacy à un seul argument :

1. **`routes/conversations/messages.ts:900`** (hot-path `GET /conversations/:id/messages`) :
   `resolveUserLanguage(userPrefs)`. Pire, le `select` de `userPrefs` (l.828-832) **ne charge même
   pas** `deviceLocale`. Cette route renvoie `meta.userLanguage` **au client** (iOS SDK + web le
   parsent au niveau racine, cf. commentaire l.1282). La valeur renvoyée ignore donc la 4e priorité.
2. **`middleware/auth.ts:305`** : `resolveUserLanguage(user)`, alors que `user.deviceLocale` est
   **déjà chargé** (select l.249, mis en cache l.274). Le `UnifiedAuthContext.userLanguage` ignore
   la 4e priorité.

### Root cause
La 4e priorité a été câblée là où le plan 2026-05-26 la nommait explicitement (notifications, socket,
destinations translator), mais ces **deux call sites de lecture** — antérieurs au plan — n'y
figuraient pas et n'ont jamais été rétro-portés. Résultat : incohérence du Prisme entre chemins
(`meta.userLanguage` de la REST diverge de la langue résolue à la connexion socket et par
NotificationService, pour un même utilisateur).

### Business impact
Pour un utilisateur **sans préférence in-app** (`systemLanguage`/`regionalLanguage`/
`customDestinationLanguage` tous vides — profils legacy, comptes incomplets) mais dont l'appareil a
envoyé une locale, la REST `GET messages` renvoyait `meta.userLanguage: 'fr'` (fallback) au lieu de
la locale appareil réelle. Divergence directe avec la connexion socket, qui elle applique la locale.
C'est exactement le cas que l'extension 2026-05-26 visait à couvrir. Impact réel borné à cet edge
case (utilisateur enregistré sans prefs in-app), mais c'est une **violation du Prisme** et une dette
de cohérence : le Prisme doit s'appliquer **identiquement partout** (règle « Coherence » du Prisme).

### Technical impact
- `messages.ts` : +1 champ au `select` (`deviceLocale: true`) + passage de l'opt — zéro requête
  supplémentaire (`deviceLocale` embarqué dans la requête `user.findFirst` déjà émise).
- `auth.ts` : passage de l'opt uniquement — `user.deviceLocale` déjà chargé, **zéro coût**.
Aucune nouvelle dépendance, aucun changement de signature publique, aucun changement pour les
utilisateurs ayant une préférence in-app (la 4e priorité ne se déclenche que si les 3 premières sont
vides).

### Risk assessment
TRÈS FAIBLE. `resolveUserLanguage` retourne la 1re préférence non-vide ; `deviceLocale` n'intervient
qu'en dernier recours avant `'fr'`. Comportement strictement inchangé pour tout utilisateur avec au
moins une préférence in-app. Aligne les 2 call sites sur le pattern déjà éprouvé et testé de
`NotificationService`/socket.

### Proposed improvements
1. `messages.ts` : ajouter `deviceLocale: true` au `select` de `userPrefs` ; appeler
   `resolveUserLanguage(userPrefs, { deviceLocale: userPrefs.deviceLocale ?? undefined })`.
2. `auth.ts` : appeler `resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined })`.

### Expected benefits
- `meta.userLanguage` (REST) cohérent avec la connexion socket et NotificationService pour un même
  utilisateur — le Prisme s'applique uniformément sur **tous** les chemins de résolution gateway.
- Clôt le résidu du plan 2026-05-26 : plus aucun `resolveUserLanguage` sans `deviceLocale` en prod.

### Implementation complexity
TRÈS FAIBLE — 3 lignes prod (1 champ select + 2 passages d'opt) + 6 tests neufs (RED→GREEN + gardes).

### Validation criteria
- `auth.test.ts` : test « deviceLocale utilisé quand prefs in-app vides » RED sans fix (retourne
  'fr'), GREEN après. + gardes (ne supplante pas systemLanguage, fallback 'fr').
- `messages-list-language.test.ts` (neuf) : inject `GET /conversations/:id/messages` →
  `meta.userLanguage` honore `deviceLocale` (RED prouvé), gardes vertes.
- `tsc --noEmit` gateway : 0 erreur.
- Suites `auth|messages|deviceLocale|NotificationService.i18n` : 0 régression.

## Résultat
✅ RED prouvé (2 tests échouent : 'fr' au lieu de 'en'), GREEN après fix. `tsc` propre. 36 suites /
1043 tests verts (auth + messages + deviceLocale + notifications), 0 régression.

## Améliorations futures (report)
- **F51** : `FirebaseNotificationService` = implémentation FCM parallèle inutilisée (badge hardcodé
  `1`, pas de circuit breaker/retry) vs `PushNotificationService.sendViaFCM` (live). Seul export
  `index.ts` + son propre test — jamais instancié en prod. Candidat suppression/consolidation.
- **F49/F50** : résidus lost-update in-process sur caches stats (auto-guéris par TTL / `recompute()`).

---

# Iteration 89 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `5624aa26` (working tree propre, branche `claude/brave-archimedes-f0k0p1` réalignée sur
`origin/main`, 0 commit non-mergé). PR ouvertes au démarrage : #1390 (web/realtime — resync feed room +
typing keepalive), #1389 (iOS composer photothèque), #1388 (iOS a11y Dynamic Type composer). Les trois
couvrent des surfaces disjointes (web-realtime, iOS-SwiftUI) de mes cibles — cette itération vise
délibérément des **bugs de correction backend/shared purement vérifiables en jest/vitest**,
indépendants de ces PR (l'env Linux n'a ni toolchain Swift ni MongoDB live).

Méthode : fan-out de 3 agents d'exploration en parallèle sur des clusters disjoints (services
messaging/social, shared utils/validation, routes/handlers gateway). Deux défauts de correction
indépendants, haute confiance, retenus ; les surfaces routes/handlers gateway auditées se sont
révélées propres (codebase déjà durci, commentaires `Audit gateway prod` documentant les fixes
antérieurs).

## Cible 89-A — `getReels` : curseur dérivé de l'ordre de score, pas de l'ordre chronologique

### Current state
`services/gateway/src/services/PostFeedService.ts`. Le sibling `getFeed` (l.79-151) porte un invariant
**documenté** : `candidateLimit = limit + 1` — fenêtre chronologique + 1 ligne sonde, *« We
deliberately do NOT over-fetch then drop: the cursor advances by createdAt, so any candidate we
fetch-but-drop would be silently skipped (or re-served as a duplicate) on the next page. Ranking
reorders within the window only, which keeps infinite scroll lossless »* (l.80-84). Le curseur y est
pris sur le post **chronologiquement le plus ancien** de la fenêtre affichée, **avant** réordonnancement
par score (l.142-151).

`getReels` (l.389-483) faisait l'**inverse** : `candidatePoolSize = Math.min(limit * 4, 120)` — un pool
4× sur-dimensionné — scoré **en entier** par `reelAffinityScore`, puis `top = scored.slice(0, limit+1)`
et `nextCursor = encodeCursor(lastItem.post.createdAt, ...)` où `lastItem` est le **dernier item
trié par score** (l.470-476).

### Problems identified
La page suivante filtre `createdAt < cursor.createdAt` (l.417). Le curseur pris sur un item à une
position **arbitraire dans le pool** (déterminée par le score, pas la date) casse le parcours :

Scénario concret : `limit=20` ⇒ pool de 80 réels T80 (récent)…T1 (ancien). Le scoring d'affinité
sélectionne le top 20. Si le plus mal classé des 20 affichés a été créé à **T60** (un réel récent bien
noté), `nextCursor=(T60)`. Page 2 filtre `createdAt < T60` ⇒ **les réels T61–T80 non affichés
(scorés plus bas) sont définitivement sautés** — l'utilisateur ne les voit jamais. À l'inverse si le
plus mal classé affiché est ancien (T5), page 2 démarre à `< T5` et abandonne ~55 réels T6–T80. Le
thread de scroll infini est lossy dans les deux sens.

### Root cause
Sibling-drift (leçons #40/#42/#45/#50/#55) : `getFeed` a été corrigé pour capturer le curseur sur la
borne chronologique **avant** le tri par score, mais `getReels` — écrit avec le même moteur de scoring
— a gardé le pattern « over-fetch → score tout → curseur sur l'item score-trié ». L'invariant lossless
documenté sur `getFeed` n'avait jamais été propagé à son sibling.

### Business impact
Le thread de découverte Reels (« Pour toi ») est **incomplet** : des réels présents dans le pool de
retrieval sont invisibles pour le viewer, d'autres re-servis. Régression fonctionnelle directe d'une
feature sociale à fort engagement.

### Technical impact
`getReels` aligné sur `getFeed` : `candidatePoolSize = limit + 1` (fenêtre chronologique + sonde) ;
`hasMore = candidates.length > limit` ; `page = slice(0, limit)` ; `nextCursor` sur le
**chronologiquement plus ancien** de la page affichée, capturé **avant** le tri ; le scoring
d'affinité ne réordonne QUE l'affichage (`scored.map(s => s.post)`). Aucune signature modifiée. Le
scoring d'affinité reste actif (réordonne la page) — la valeur de découverte est préservée, la perte
de données éliminée. `getFeed` inchangé.

### Risk assessment
FAIBLE. Le changement adopte l'invariant déjà validé en production sur le sibling `getFeed`. Perte
de comportement : le « meilleur 20 sur 80 par affinité » disparaît au profit des « 20 plus récents
réordonnés par affinité » — mais ce « meilleur 20 sur 80 » n'était jamais livré losslessly (il
produisait de la perte de données). Le commentaire d'origine (l.386-387) reconnaissait déjà le
retrieval chronologique comme fondation. Couverture : 3 régressions neuves + 1 test préexistant
(qui encodait le pool `limit×4` bogué) recadré sur l'invariant corrigé.

## Cible 89-B — `languageCodeSchema` rejette les codes ISO 639-3 supportés

### Current state
`packages/shared/utils/attachment-validators.ts:58-62`. `languageCodeSchema = z.string().min(2).max(16)
.regex(/^[a-zA-Z]{2}(-[a-zA-Z0-9]+)*$/)`. Consommé par `attachmentTranscriptionSchema.language`
(l.111), `transcriptionSegmentSchema.language`/`translatedLanguage` (l.96/99), et les **clés** de
`attachmentTranslationsMapSchema` (l.189-192).

### Problems identified
Le corps `[a-zA-Z]{2}` fige le sous-tag primaire à exactement 2 lettres. Les 5 codes ISO 639-3 à
3 lettres **officiellement supportés** — `bas` (Basaa), `ksf`, `nnh`, `dua`, `ewo` (langues
camerounaises, `languages.ts:1035-1118`, `supportsSTT/supportsTranslation: true`, préservés verbatim
par `language-normalize.ts` comme **forme canonique** *« NE doivent JAMAIS être tronqués »*) — sont
**rejetés** au trust boundary.

Incohérence inter-schémas : `isSupportedLanguage('bas') === true` ⇒ `updateUserProfileSchema
.systemLanguage` et `CommonSchemas.language` (regex déjà élargi `/^[a-z]{2,3}(-[A-Z]{2})?$/` en
itération 86-B) **acceptent** `bas`. Un utilisateur peut définir `systemLanguage: 'bas'` et
s'enregistrer, mais toute transcription/traduction étiquetée `bas` est **rejetée** :
`parseAttachmentTranscription({ language: 'bas', ... })` ⇒ `INVALID_TRANSCRIPTION` ;
`parseAttachmentTranslationsMap({ bas: {...} })` ⇒ `INVALID_TRANSLATIONS_MAP`. Contradiction directe
avec le Prisme Linguistique (support multilingue = cœur produit).

### Root cause
Même motif « règle non homogène entre siblings » que l'itération 86-B, sur un **second** schéma de
langue (`languageCodeSchema` dans `attachment-validators.ts`) que le fix 86-B (`CommonSchemas.language`
dans `validation.ts`) n'avait pas couvert. Le regex fige la forme 2-lettres 639-1 et ignore les 639-3
que le reste de la plateforme traite comme canoniques.

### Technical impact
Regex élargi à `/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/` — accepte 2 **ou** 3 lettres pour le sous-tag
primaire + sous-tags BCP-47 optionnels inchangés. `min(2)/max(16)` inchangés (`bas` passe ;
`bas-Latn` reste dans les bornes). Choix du regex (vs bascule sur `.refine(isSupportedLanguage)`)
délibéré et cohérent avec 86-B : ne **widen** que l'acceptation (aucun input valide existant cassé),
conserve `pt-BR`/`zh-Hans`.

### Risk assessment
FAIBLE. N'élargit l'acceptation qu'aux codes 3-lettres (même profil de risque que 86-B). Rejette
toujours `a`, `1`, `!!`, `''`. Couverture : cas neuf `languageCodeSchema — 639-3 ×5` ajouté à la
suite existante (auparavant : 2-lettres + région seulement, jamais les 639-3).

## Validation
- `vitest __tests__/attachment-validators.test.ts` (shared) → 36/36 ✓ (dont `639-3 ×5` neuf)
- `jest PostFeedService.test.ts` → 35/35 ✓ (dont `getReels — chronological cursor` ×3 neufs +
  1 test recadré)
- `jest PostFeedService|posts-engagement-feed|reelAffinity` → 6 suites / 88 tests ✓, 0 régression
- `bun run build` (shared) → 0 erreur (attachment-validators.ts compile)

## Validation criteria (rappel)
- [x] `getReels` prend `nextCursor` sur le réel chronologiquement le plus ancien de la page affichée
  (pas l'item score-trié) ; fenêtre `limit+1` ; le scoring réordonne l'affichage seulement.
- [x] `getFeed` (invariant SSOT) inchangé.
- [x] `languageCodeSchema` accepte `bas`/`ksf`/`nnh`/`dua`/`ewo` et `pt-BR` ; rejette les malformés.
- [x] Homogène avec `CommonSchemas.language` (86-B) — aucun autre sibling `[a-zA-Z]{2}` résiduel.
- [x] Aucune régression sur les suites feed/reel/posts.
