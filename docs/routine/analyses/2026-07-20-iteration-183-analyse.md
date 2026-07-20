# Iteration 183 — `deviceCountry.ts` : fuite mémoire non bornée (le fix iter-181 de `deviceLocale.ts` jamais propagé à son miroir auto-déclaré) + `validatePagination` : `limit=0` coercé en défaut au lieu du plancher

## Protocole (démarrage)
`main` @ `217cba9` (derniers merges : #1974 ios/a11y MessageViewsDetailView,
#2136 android/calls video-filter, #2093 deps firebase-admin, #2128 android/calls
captions…). Branche `claude/brave-archimedes-srfqcb` réinitialisée sur
`origin/main`. Ce cycle prend **183**. Les itérations 181 (deviceLocale
debounce-cache borné, PR #2057) et 182 (identifier SSOT, mergée `0187adf`) sont
consignées et en production.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Sélection : revue **Priorité 1** (fonctionnalités
récentes) — un balayage large du répertoire `utils/` partagé (déjà durci par de
nombreuses itérations) + les middlewares gateway récents. Le middleware
`deviceCountry` (Guideline 5 / MIIT CallKit-China, ajout serveur récent) porte
mot-pour-mot le même bug que l'itération 181 a corrigé sur son miroir.

## Current state

### Finding #1 (PRIMAIRE) — `deviceCountry.ts` : fuite mémoire du cache de debounce
`services/gateway/src/middleware/deviceCountry.ts` persiste opportunément le pays
appareil (`X-Meeshy-Country`) dans `User.deviceCountry`, avec un **debounce par
utilisateur de 5 min** implémenté par une `Map` de processus. Son docstring
(ligne 14) affirme explicitement :

> Mirrors `deviceLocale.ts` exactly (debounce, no-op contract, test seams).

Or l'itération 181 a durci `deviceLocale.ts` en ajoutant `MAX_TRACKED_USERS =
10_000` + `pruneStaleDebounceEntries()` (éviction des entrées périmées + plafond
dur avant insertion). **Ce fix n'a jamais été propagé à `deviceCountry.ts`** :

```ts
// deviceCountry.ts:25 (avant)
const lastUpdateByUserId = new Map<string, number>();   // jamais borné
// deviceCountry.ts:122 (avant)
await prisma.user.update({ where: { id: userId }, data: { deviceCountry: normalized } });
lastUpdateByUserId.set(userId, now);   // +1 entrée par utilisateur distinct, à vie
```

Le hook est un `preHandler` **global** (`server.ts`) : il s'exécute sur **chaque
requête authentifiée**. La `Map` accumule donc une entrée par utilisateur
enregistré ayant émis au moins une requête portant `X-Meeshy-Country` — pour
toute la durée de vie du process gateway.

### Finding #2 (SECONDAIRE) — `validatePagination` : `limit=0` → défaut au lieu du plancher
`services/gateway/src/utils/pagination.ts:26` (SSOT pagination, 46 call sites) :

```ts
const limitNum = Math.min(Math.max(1, parseInt(limit ?? '', 10) || defaultLimit), maxLimit);
```

Le `|| defaultLimit` se déclenche pour **tout** résultat falsy de `parseInt` :
`NaN` (absent/illisible) **ET** `0`. Une valeur `limit=0` **explicite** (parsable)
est donc coercée vers `defaultLimit` (20) au lieu d'être ramenée au plancher (1),
alors qu'une valeur `limit=-5` (également sous le minimum) est bien ramenée à 1.
Le test existant `pagination.test.ts:27-29`, intitulé « enforces a minimum limit
of 1 », **assertait pourtant `'0' → 20`** — contredisant son propre titre : preuve
que le comportement est accidentel (coercition falsy), non intentionnel.

## Problems identified
1. **Fuite mémoire non bornée (`deviceCountry`, scalabilité).** `lastUpdateByUserId`
   n'est jamais purgée : croissance linéaire avec la base cumulée d'utilisateurs
   actifs (~100k entrées ≈ ~10 Mo, 1M ≈ ~100 Mo), sans plafond, sur un uptime long.
   Fuite lente mais réelle, sur un produit visé à 100k+ utilisateurs.
2. **Dérive de miroir / SSOT (`deviceCountry`).** Le fichier se déclare « mirrors
   `deviceLocale.ts` exactly » mais a divergé silencieusement : le durcissement
   critique de l'un n'a pas suivi sur l'autre. C'est exactement le patron que les
   itérations précédentes corrigent (une décision d'ingénierie réécrite/copiée qui
   dérive).
3. **Incohérence de plancher (`validatePagination`).** `limit=0` et `limit=-5` sont
   deux entrées « sous le minimum » traitées différemment (20 vs 1). Un client
   émettant `?limit=0` sur n'importe lequel des 46 endpoints paginés reçoit une
   page pleine (20) au lieu du plancher — comportement API surprenant et
   auto-contradictoire avec le test qui le documente.

## Root cause
- **#1** : le durcissement iter-181 a été appliqué au seul `deviceLocale.ts` ; le
  middleware jumeau `deviceCountry.ts` (créé sur le même moule, même contrat) n'a
  pas reçu le patch. La promesse « mirrors exactly » n'était pas garantie par
  construction (pas de helper partagé), donc la divergence est passée inaperçue.
- **#2** : `parseInt(...) || defaultLimit` conflate « absent/illisible » (`NaN`)
  et « zéro explicite » via la falsy-coercion de `0`. Le fallback `defaultLimit`
  doit ne s'appliquer qu'au premier cas.

## Business / Technical impact
- **Mémoire / scalabilité (serveur)** : empreinte du process gateway qui croît de
  façon monotone avec la base d'utilisateurs — pression GC, risque OOM sur uptime
  long, coût RAM en production. Borné par construction supprime une classe entière
  de faux positifs d'investigation mémoire.
- **API / cohérence (client)** : `?limit=0` renvoie désormais 1 élément (plancher)
  au lieu de 20 — comportement prévisible et aligné sur `limit=-5`.
- **Correctness** : inchangée pour tous les chemins nominaux (debounce identique
  sous le plafond ; `limit` valide inchangé ; défaut pour absent/illisible inchangé).

## Risk assessment
Très faible.
- **#1** : copie verbatim d'un helper déjà en production (iter-181), déjà testé
  sur le miroir. Le comportement de debounce sous le plafond est strictement
  identique ; seule différence observable = borne mémoire + au pire une écriture
  idempotente supplémentaire pour un utilisateur évincé.
- **#2** : seul comportement observable modifié = `limit=0` (20 → 1). Aucun call
  site interne n'émet `limit=0` (grep confirmé). Les entrées `NaN`/négatives/valeurs
  valides sont inchangées.

## Proposed improvements
1. **`deviceCountry.ts`** : ajouter `MAX_TRACKED_USERS`, `pruneStaleDebounceEntries`,
   la balayage pré-insertion, et les seams de test (`_deviceCountryCacheSize`,
   `_DEVICE_COUNTRY_MAX_TRACKED_USERS`) — copie mot-pour-mot de `deviceLocale.ts`.
2. **`pagination.ts`** : distinguer `NaN` (→ `defaultLimit`) d'une valeur parsée
   (→ plancher via `Math.max(1, …)`).

## Expected benefits
- Empreinte mémoire du process gateway bornée quel que soit le volume
  d'utilisateurs, sur les DEUX middlewares « device signal ».
- Parité de miroir restaurée entre `deviceLocale` et `deviceCountry`.
- Sémantique de pagination cohérente et prévisible sur les 46 endpoints.

## Implementation complexity
Faible — 1 middleware (copie d'un patron testé) + 1 utilitaire (3 lignes) + 2
fichiers de test (bloc « bounded debounce cache » mirroir + 1 assertion corrigée).

## Validation criteria
- `deviceCountry.test.ts` : **17 tests verts** (3 nouveaux — bloc bounded-cache).
- `deviceLocale.test.ts` + `pagination.test.ts` : **43 tests verts** ensemble
  (9 pagination, dont 1 corrigé `'0' → 1` + 1 nouveau cas `''`).
- Régression routes paginées (`communities-core`, `admin-reports`, `affiliate`,
  `users-devices`) : **121 tests verts**.
- `tsc --noEmit` gateway : **0 erreur**.

## Backlog (candidats consignés pour une itération future)
- **`AuthSchemas.verifyPhone.code`** (`packages/shared/utils/validation.ts:379`) :
  `z.string().length(6)` **sans** `/^[0-9]{6}$/`, alors que `verifyEmail.code`
  (ligne 360) l'impose. Un code SMS `'abcdef'` passe la validation de schéma
  (rejeté au check d'égalité aval → defense-in-depth, impact faible). Fix : +1 regex.
- **`ConversationSchemas.participantsFilters.limit`** (`validation.ts:654`) :
  `transform((val) => parseInt(val || '50', 10))` **sans** clamp NaN/négatif,
  contrairement aux autres transforms de pagination du fichier (lignes 71-78).
  `{ limit: 'abc' } → NaN`, `{ limit: '-5' } → -5`. **Actuellement non câblé** à
  une route (grep) → impact latent, à câbler/clamper avant fix.
