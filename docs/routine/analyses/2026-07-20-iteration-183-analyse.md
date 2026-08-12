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
# Iteration 183 — `attachmentTranslationsMapSchema` : docstring auto-contradictoire affirmant une validation cross-field jamais implémentée (contrat de trust-boundary mensonger)

## Protocole (démarrage)
`main` @ `b3ffa80` (derniers merges : #2060 gateway/identifiers SSOT (itér. 182),
ios/stories tappable menu, vague #2101→#2130 ios/a11y pilotée par d'autres
sessions). Branche `claude/brave-archimedes-xx8xvp` réinitialisée sur
`origin/main`. Ce cycle prend **183**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript. `bun install` (jest gateway) tué à répétition (exit 143) ; en
revanche le harnais **vitest de `packages/shared`** est opérationnel
(`node_modules/.bin/vitest`, 36 tests `attachment-validators` verts). La sélection
se concentre donc sur `packages/shared` où la validation est reproductible.

Point de départ : revue Priorité 1 (features récentes) + sweep dédié d'un
sous-agent Explore sur les 12 utilitaires purs de `packages/shared/utils/`. Le
sweep n'a trouvé **aucun** bug arithmétique/timezone/regex/surrogate à haute
confiance (utils exceptionnellement matures, tous couverts par des suites
edge-focused). Le **seul défaut net** est une contradiction interne de
documentation dans un validateur de trust-boundary — c'est la cible de cette
itération.

## Current state
`packages/shared/utils/attachment-validators.ts` valide, aux frontières de
confiance (Socket.IO, REST, ZMQ), les payloads JSON `transcription` / `translations`
stockés sur `MessageAttachment` / `PostMedia`. La map de traductions est modélisée
par `attachmentTranslationsMapSchema = z.record(languageCodeSchema, attachmentTranslationSchema)`.

**Deux docstrings du même fichier se contredisent frontalement sur le contrat de
cette map :**

- `:187-196` (au-dessus du schéma) affirme :
  > « Cross-field validation of `outerKey === inner.<lang>` **is enforced** by
  > `parseAttachmentTranslationsMap` below — a mismatch breaks the Prisme
  > Linguistique resolver… »
- `:253-258` (au-dessus du helper) affirme l'exact inverse, correctement :
  > « The map's outer key is informational and is **NOT cross-checked** against
  > any inner field — `AttachmentTranslation` does not carry a `targetLanguage`
  > property in the canonical shape; the language is implicit in the map key. »

La réalité du code (`:259-270`) : `parseAttachmentTranslationsMap` appelle
uniquement `attachmentTranslationsMapSchema.safeParse(input)`, qui ne fait
**aucune** vérification croisée clé↔contenu. C'est le docstring `:253-258` qui dit
vrai ; celui de `:187-196` est mensonger.

## Problems identified
1. **Contrat de trust-boundary mensonger (correctness-of-contract).** Un
   mainteneur lisant `:187-196` croit qu'un payload `{ "fr": <traduction
   espagnole> }` est rejeté à la frontière. Il ne l'est pas — `safeParse` le
   laisse passer (`ok:true`). Toute logique en aval qui « fait confiance » à cette
   garantie inexistante hérite d'un faux sentiment de sécurité sur une propriété
   du Prisme Linguistique (le client résout `translations[preferredLanguage]`).
2. **Auto-contradiction non détectable par les tests.** Les deux docstrings ne
   peuvent pas être vrais simultanément ; aucune assertion ne verrouille le
   comportement réel (aucun test sur la relation clé↔contenu). Le contrat réel
   n'est donc ni documenté fidèlement, ni testé.

## Root causes
Structurellement, `AttachmentTranslation` (forme canonique, `attachment-audio.ts`)
**ne porte aucun champ langue** de premier niveau : la langue cible est
*implicite dans la clé de map*. Une validation croisée `outerKey === inner.<lang>`
est donc **impossible à ce niveau** — il n'existe rien à comparer. Le docstring
`:187-196` décrit une garantie qui n'a jamais pu exister ; il n'a jamais été mis
en cohérence avec l'implémentation ni avec l'autre docstring.

## Business impact
Faible en runtime (aucun changement de comportement), réel en maintenabilité et
en sûreté : un contrat de sécurité faux sur le pipeline de traduction audio est
précisément le genre de piège qui conduit un futur contributeur à retirer une
validation « redondante » en aval, ouvrant une régression du Prisme.

## Technical impact
- Contrat de `parseAttachmentTranslationsMap` désormais **fidèle** et **verrouillé
  par un test**.
- Zéro changement de comportement d'exécution (fix documentaire + test de
  caractérisation).

## Risk assessment
Très faible. Le seul code modifié est un bloc de commentaire ; le test ajouté
caractérise le comportement **actuel** (il passe sur le code inchangé). Aucun
appelant, aucune signature, aucune forme persistée touchée.

## Proposed improvements (TDD)
- **RED/Characterization** : +1 test dans `__tests__/attachment-validators.test.ts`
  affirmant l'invariant réel — une map dont la **clé** ne correspond pas à la
  langue réelle du contenu est **acceptée** (`ok:true`), car il n'existe aucun
  marqueur de langue interne à recouper. Le test documente que la correction de la
  clé est la responsabilité de l'appelant, pas du validateur. (Passe sur le code
  actuel → verrou de non-régression du contrat honnête.)
- **GREEN** : réécrire le docstring `:187-196` pour dire la vérité et l'aligner
  sur `:253-258` : la clé de map fait autorité et n'est **pas** recoupée avec le
  contenu (impossible — pas de champ langue interne) ; l'appelant doit garantir
  qu'il indexe sous la bonne clé.

## Expected benefits
- Un seul contrat cohérent, honnête et testé pour la map de traductions.
- Suppression d'un faux positif de sécurité sur un chemin Prisme sensible.

## Implementation complexity
Triviale — 1 bloc de commentaire réécrit + 1 test de caractérisation.

## Validation criteria
- `packages/shared` : `vitest run __tests__/attachment-validators.test.ts` =
  **37 tests verts** (36 + 1 nouveau).
- `tsc --noEmit` (shared) inchangé (aucune signature modifiée).

## Backlog (candidats consignés — non actionnés ici)
- **`normalizeLanguageCode` (`language-normalize.ts:66-69`)** : réduction 3→2
  lettres aveugle → collision ISO 639-3 (`'arg'` Aragonais → `'ar'` Arabe,
  `'english'` → `'en'`). Fix « propre » nécessite une table ISO 639-3→639-1 (≈50
  langues) : changement de la SSOT du Prisme, risque de régression, à traiter par
  analyse dédiée (le docstring documente le tradeoff actuel comme délibéré).
- **`validatePagination` (`pagination.ts:26`) / `CommonSchemas.pagination`** :
  `limit=0` explicite coercé en `20`. Comportements alignés gateway↔shared
  (intentionnel « 0 = unset »). Toucher la sémantique = décision produit — reste
  en backlog.
- **`CommonSchemas.language` (`validation.ts:91`)** : regex case-sensitive
  (`/^[a-z]{2,3}(-[A-Z]{2})?$/`) sur `sendMessage`/`editMessage.originalLanguage`,
  vs `supportedLanguageCode` case-insensitive + lowercase ailleurs. Divergence de
  robustesse ; impact réel dépend de si un client émet un primary majuscule —
  à vérifier avant de loosen.
- `email-validator.ts:48` : borne 255 vs RFC 254 (nit, invariant SSOT préservé).
