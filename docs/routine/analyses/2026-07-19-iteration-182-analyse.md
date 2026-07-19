# Iteration 182 — `deviceCountry` middleware : cache de debounce non borné (fuite mémoire par utilisateur distinct — sibling de l'itér. 181 laissé ouvert)

## Protocole (démarrage)
`main` @ `70001b99` (derniers merges : #2068/#2065/#2063/#2061 android/status,
#2057 gateway device-locale debounce borné — **itération 181**). Branche
`claude/brave-archimedes-w3d3mr` réinitialisée sur `origin/main`. Ce cycle prend
**182**.

Environnement : Linux, toolchains Node 22 / bun / Python présentes ;
aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(gateway/shared/web). Les PR/merges récents les plus nombreux sont Android/iOS/SDK
(hors périmètre testable). Point de départ : **revue Priorité 1** (fonctionnalités
récentes) sur la surface gateway TS, en prolongement direct de l'itération 181.

## Current state
`services/gateway/src/middleware/deviceLocale.ts` (itér. 181, #2057) a corrigé une
fuite mémoire : sa `Map` de debounce `userId → last write ts` est désormais bornée
par `MAX_TRACKED_USERS = 10_000` + `pruneStaleDebounceEntries()` + un sweep gardé
avant insertion, plus une seam de test `_deviceLocaleCacheSize()`.

Son **jumeau** `services/gateway/src/middleware/deviceCountry.ts` (compliance
Guideline 5 / MIIT, header `X-Meeshy-Country` envoyé par iOS sur **chaque
requête**) est un copier-coller structurel de `deviceLocale.ts`. Son en-tête
affirme explicitement :

```ts
 * Mirrors `deviceLocale.ts` exactly (debounce, no-op contract, test seams).
```

Or il ne mirrore **pas** l'éviction. Il conserve exactement la `Map` non bornée
d'avant l'itération 181 :

```ts
/** Per-process map: userId → last successful write timestamp (ms). */
const lastUpdateByUserId = new Map<string, number>();   // ← jamais évincée
// ...
lastUpdateByUserId.set(userId, now);   // ← une entrée par utilisateur, aucune borne
```

`createDeviceCountryMiddleware` est enregistré comme `preHandler` **global**
(`server.ts`), donc exécuté sur **chaque requête authentifiée** de **chaque
route**. La `Map` reçoit une entrée pour tout utilisateur enregistré ayant émis au
moins une requête portant `X-Meeshy-Country`.

## Problems identified
1. **Fuite mémoire non bornée (scalabilité) — identique à l'itér. 181 mais dans le
   sibling laissé ouvert.** `lastUpdateByUserId` n'est **jamais purgée**. Elle
   accumule une entrée par utilisateur distinct pour toute la durée de vie du
   process gateway. Sur une plateforme visée à 100k+ utilisateurs (iOS envoie le
   header sur *chaque* requête → couverture quasi totale de la base active), la
   `Map` croît linéairement — ~100k entrées ≈ ~10 Mo, 1M ≈ ~100 Mo — sans plafond.
2. **Invariant documenté violé.** L'en-tête promet « Mirrors `deviceLocale.ts`
   exactly » : c'est faux depuis l'itér. 181. La dérive silencieuse entre deux
   fichiers censés être jumeaux est une dette qui masque le défaut (un lecteur fait
   confiance au commentaire).
3. **Entrées mortes conservées.** Une entrée dont l'horodatage dépasse
   `DEBOUNCE_MS` (5 min) ne peut **plus jamais** supprimer une écriture (la garde
   `now - last < DEBOUNCE_MS` échoue toujours pour elle) — poids mort pur.

## Root cause
L'itération 181 a corrigé `deviceLocale.ts` sans propager l'éviction à son jumeau
`deviceCountry.ts`, alors que l'en-tête de ce dernier revendique un mirroring
exact. Le cycle de vie d'une entrée (utile seulement pendant `DEBOUNCE_MS` après sa
dernière écriture) n'est pas exploité pour la libérer.

## Business / Technical impact
- **Mémoire / scalabilité (serveur)** : empreinte process croissant de façon
  monotone avec la base d'utilisateurs cumulée — pression GC, risque OOM sur
  uptime long, coût RAM en production. Impact **amplifié** vs deviceLocale : le
  header pays est envoyé par iOS sur *chaque* requête (couverture plus large que
  `X-Device-Locale`).
- **Cohérence / maintenabilité** : rétablit le mirroring exact revendiqué, une
  seule stratégie d'éviction pour les deux middlewares jumeaux.
- **Correctness** : inchangée — le debounce reste strictement identique tant que la
  `Map` est sous le plafond ; en cas de sweep, la seule conséquence est au pire une
  écriture `User.update` idempotente supplémentaire pour un utilisateur évincé.

## Risk assessment
Très faible. Port mécanique de code déjà revu et mergé (#2057). L'éviction est
strictement behaviour-preserving sous le plafond (seuil 10 000 très au-dessus du
régime nominal par process). Aucune modification de signature publique ; ajout de
seams de test (`_deviceCountryCacheSize`, `_DEVICE_COUNTRY_MAX_TRACKED_USERS`)
export-only.

## Proposed improvements
1. Ajouter `MAX_TRACKED_USERS = 10_000` + `pruneStaleDebounceEntries(now)` (éviction
   des entrées expirées, puis hard-cap oldest-inserted) à `deviceCountry.ts`.
2. Insérer le sweep gardé avant `lastUpdateByUserId.set(userId, now)` :
   `if (!has(userId) && size >= MAX) prune(now)`.
3. Exporter les seams `_deviceCountryCacheSize()` et
   `_DEVICE_COUNTRY_MAX_TRACKED_USERS`.
4. Restaurer la fidélité de l'en-tête (mirroring éviction incluse).

## Expected benefits
- Empreinte mémoire du process bornée par construction, quel que soit le nombre
  cumulé d'utilisateurs.
- Mirroring exact rétabli entre les deux middlewares jumeaux — une seule règle
  d'éviction à maintenir.

## Implementation complexity
Faible. ~35 lignes de production (port depuis le jumeau), 3 tests miroir.

## Validation criteria
- RED d'abord : 3 tests d'éviction ajoutés échouent contre l'implémentation non
  bornée actuelle (le `Map.size` dépasse le cap).
- GREEN : suite `deviceCountry.test.ts` complète verte (14 existants + 3 nouveaux).
- Non-régression : `deviceLocale.test.ts` et le reste de la suite gateway restent
  verts.
- `tsc` gateway sans nouvelle erreur.
