# Iteration 205 — Décodage JWT côté client : 3 implémentations divergentes dont 2 buggées (base64url) → convergence sur un SSOT `utils/jwt`

## Protocole (démarrage)
`main` @ `45569262` (dernier commit : fix ios/story audio interlude). Branche
`claude/brave-archimedes-s27p5k` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` (le postinstall prisma/turbo est
bloqué par le proxy — sans impact : correctif **web-only**, aucun type Prisma).
`packages/shared/dist` construit via `tsc` (le jest web mappe `@meeshy/shared/(.*)`
→ `packages/shared/dist/$1`, requis par la suite `connection.service`).

PRs ouvertes au démarrage — **audit anti-doublon** :
- **#2301** (iteration 204) : SSOT `formatShortDate` (dates groups/voice/contacts).
  Surface `date-format.ts` + composants dates. **Aucun chevauchement.**
- **#2302** : Android conversation-settings-form. Hors surface TypeScript.
- **#2275** : iOS a11y VoiceOver. Hors surface TypeScript.

Aucune PR ouverte ne touche l'authentification ou le décodage JWT côté web →
zéro risque de conflit. Cette itération **pivote hors du swarm i18n/dates** vers
un défaut de **correctness + duplication** dans la couche auth.

## Sélection : **Priorité — correctness + Single Source of Truth (couche auth web)**

Trois implémentations distinctes de « décoder le payload d'un JWT côté client »
coexistaient, dont **deux subtilement fausses** sur les tokens base64url.

## Current state (avant correctif)

### 1. `apps/web/utils/auth.ts` — la seule version correcte
`isJWTExpired` / `isValidJWTFormat` normalisent bien le base64url avant `atob` :
```ts
atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
```
Consommée en production par `services/api.service.ts:160` (refresh sur 401) et
`services/socketio/connection.service.ts:97` (reconnexion socket).

### 2. `apps/web/utils/websocket-diagnostics.ts:39` — **buggée**
```ts
function isJWTExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])); // ← pas de normalisation base64url
    return payload.exp ? Date.now() >= payload.exp * 1000 : false;
  } catch {
    return true;
  }
}
```

### 3. `apps/web/services/auth-manager.service.ts:143` — **buggée**
```ts
decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload)); // ← pas de normalisation base64url
  } catch { return null; }
}
```

## Problems identified

1. **Bug de correctness réel — base64url.** Les segments d'un JWT sont encodés en
   **base64url** (RFC 7515) : ils peuvent contenir `-` et `_`, absents de
   l'alphabet base64 standard. `atob('...-..._...')` lève `InvalidCharacterError`.
   Pour tout token dont le payload contient l'un de ces caractères (fréquent —
   dépend du contenu binaire du JSON encodé) :
   - `websocket-diagnostics.isJWTExpired` retourne `true` → un token **valide et
     non expiré** est affiché comme expiré (`authTokenValid=false`,
     recommandation « Token JWT expiré — reconnexion requise » trompeuse).
   - `authManager.decodeJWT` retourne `null` → toute lecture de claim échoue
     silencieusement.
   Preuve reproductible : payload `{"sub":">?>?","role":"member","exp":9999999999}`
   → segment `eyJzdWIiOiI-Pz4_Iiwicm9sZSI6Im1lbWJlciIsImV4cCI6OTk5OTk5OTk5OX0`
   (contient `-` **et** `_`) → `atob(segment)` lève `InvalidCharacterError`.
2. **Marge de grâce incohérente.** La version production (`auth.ts`) applique une
   marge de 30s (`exp*1000 < Date.now() - 30_000`) ; la copie diagnostics compare
   à l'instant exact (`Date.now() >= exp*1000`) → deux verdicts « expiré ? »
   possibles pour le même token à ±30s de l'expiration.
3. **Duplication — 3 copies d'une même intention.** « décoder le 2ᵉ segment d'un
   JWT » réimplémenté 3 fois, 2 sur 3 sans la normalisation critique. Piège de
   maintenance : un correctif sur une copie ne se propage pas.

## Root causes

Helpers écrits localement (diagnostics dev-tool ; méthode utilitaire du manager)
avant/à côté de la version correcte de `auth.ts`, en oubliant la normalisation
base64url — une subtilité facile à manquer car `atob` fonctionne sur ~75 % des
payloads (ceux sans `-`/`_`), masquant le défaut en développement.

## Business impact

- **Diagnostics WebSocket** (`getWebSocketDiagnostics`) : outil de support/debug.
  Un faux « token expiré » envoie le support sur une fausse piste lors du
  diagnostic d'un problème de connexion réel.
- **`decodeJWT`** : méthode publique du manager d'auth, aujourd'hui consommée
  uniquement en test, mais **latente pour tout futur appelant** (lecture de
  claims `exp`/`sub`/`role`) qui hériterait du bug silencieux.

## Technical impact

- Nouveau module SSOT `apps/web/utils/jwt.ts` : `decodeJwtPayload`,
  `isValidJWTFormat`, `isJWTExpired`, tous base64url-safe, sans vérification de
  signature (inspection client uniquement).
- −26 lignes de logique dupliquée : `auth.ts` ré-exporte le SSOT ;
  `websocket-diagnostics` supprime sa copie et importe ; `auth-manager.decodeJWT`
  délègue en une ligne.
- Les deux consommateurs production (`api.service`, `connection.service`)
  restent inchangés — ils importent toujours `isJWTExpired` depuis `utils/auth`
  (ré-export transparent).

## Risk assessment

**Faible.** Web-only ; aucun schéma/API/migration/clé i18n. La version conservée
est la version **production correcte** (`auth.ts`), promue en SSOT à l'identique :
`decodeJwtPayload` requiert 3 segments (comme `isValidJWTFormat`) et rejette les
payloads non-objet ; `isJWTExpired` préserve la marge 30s et les sémantiques
« pas d'exp → non expiré », « illisible → expiré ». Le seul changement de
comportement est **intentionnel** : les 2 copies buggées cessent de mal classer
les tokens base64url (c'est précisément le correctif).

## Proposed improvements (implémenté)

1. `utils/jwt.ts` : SSOT documenté (pourquoi base64url), `decodeJwtPayload` +
   `isValidJWTFormat` + `isJWTExpired`.
2. `utils/auth.ts` : `export { isValidJWTFormat, isJWTExpired } from './jwt'`.
3. `utils/websocket-diagnostics.ts` : suppression de la copie locale, import SSOT.
4. `services/auth-manager.service.ts` : `decodeJWT` → `decodeJwtPayload(token)`.

## Expected benefits

- Fin du faux « token expiré » sur les diagnostics et de l'échec silencieux de
  `decodeJWT` pour ~1 token base64url sur 4.
- Verdict d'expiration **cohérent** (une seule marge de grâce app-wide).
- −1 classe de duplication ; une source unique base64url-safe pour tout futur
  besoin de lecture de claim côté client.

## Implementation complexity

**Triviale** — 1 module SSOT + tests, 3 sites recâblés (2 délégations, 1 import).

## Validation criteria

- 19 nouveaux tests `jwt.test.ts` verts, dont **3 régressions base64url** (le
  token `-`/`_` décode ; `isJWTExpired` ne classe pas un token futur base64url
  comme expiré ; `isValidJWTFormat` accepte l'url-safe).
- Suites consommatrices vertes sans modification : `auth.test.ts`,
  `auth-manager.service.test.ts` (`decodeJWT` 4/4), `api.service.test.ts`,
  `socketio/connection.service.test.ts` (71/71). Total 198/198 sur le périmètre.
- Aucune nouvelle erreur `tsc` sur les 4 fichiers modifiés.

## Future improvements (backlog restant)

- **`apps/web/utils/auth.ts:isUserAnonymous`** (`user.id.length > 20`) : heuristique
  cassée — un ObjectId Mongo (24 hex) ou un UUID (36) déclenche toujours le
  « anonyme ». Le test `auth.test.ts` fige le bug (id de **20** chars, la seule
  longueur qui passe). Correctif : retirer la clause de longueur + amender le test.
  Impact : classification auth (masqué en partie par des re-checks `hasAuthToken`
  en aval). **Candidat prioritaire prochaine itération.**
- **`getUserDisplayName` / `getUserDisplayNameOrNull`** (`utils/user-display-name.ts`)
  — corps copiés-collés (seule la queue diffère) ; `getUserDisplayName` peut
  déléguer `?? fallback`.
- **Formatage d'octets inline** (`components/attachments/carousel/AudioFilePreview`,
  `app/admin/messages`, `components/audio/AudioRecorderCard`) contournant le SSOT
  `formatFileSize` de `packages/shared/types/attachment.ts` — ne roule jamais en
  MB/GB, précisions divergentes.
- Backlog i18n dates/langues : couvert par les swarms (#2301, #2291/#2293/#2295).
