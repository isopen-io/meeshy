# Iteration 206 — Convergence pagination : le clamp `limit=0 → 1` manquant dans le SSOT partagé + 3 routes gateway sans borne haute

## Protocole (démarrage)
`main` @ `e0a62247` (dernier merge : #2327 android conversation tag-autocomplete).
Branche `claude/brave-archimedes-5dh8qx` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (shared/gateway). `bun install` OK ; `packages/shared` construit via
`bun run build` (le jest gateway mappe `@meeshy/shared/(.*)` → `dist`) ; prisma
`generate --generator client` exécuté (proxy laisse passer le générateur).

PRs ouvertes au démarrage — **audit anti-doublon** (14 PRs). Le swarm i18n/SSOT
couvre déjà : JWT (#2305 aussi isUserAnonymous), getUserDisplayName
(#2311/#2313/#2317/#2320), formatFileSize (#2309), language flags/names (#2315),
read-tracking/mergeViewed (#2307), auto-translate filter (#2323), plus des PRs
iOS/Android hors surface. **Aucune** ne touche `packages/shared/utils/validation.ts`
ni les routes `posts/interactions.ts` / `admin/reports.ts` → zéro conflit.

Sélection : **pivot hors du swarm display-name/dates** vers un défaut de
**correctness + Single Source of Truth** dans la couche pagination — un bug déjà
corrigé côté gateway (`validatePagination`, iter. antérieure) mais **jamais
propagé** au miroir partagé ni aux copies inline de routes.

## Current state (avant correctif)

### 1. `packages/shared/utils/validation.ts` — miroir partagé buggé
`CommonSchemas.pagination` et `CommonSchemas.messagePagination` :
```ts
limit: z.string().optional().transform((val) => Math.min(Math.max(1, parseInt(val ?? '', 10) || 20), 100)),
```
Le `parseInt(...) || 20` traite `0` (falsy) comme « absent » → `limit=0` renvoie
**une page pleine de 20** au lieu de plancher à 1. `limit=-5` (truthy) plancher
correctement à 1 → **deux entrées sous-minimum se comportent différemment**. Le
commentaire du fichier prétend « Mirrors the gateway's validatePagination » — mais
il reflète la version **pré-correctif**. `services/gateway/src/utils/pagination.ts:26-33`
a déjà corrigé exactement ce cas avec le pattern `Number.isNaN(parsed) ? default : parsed`.

Le test `validation.test.ts:53` figeait le bug : `.limit).toBeGreaterThanOrEqual(1)`
passe avec la valeur buggée `20` (20 ≥ 1). Assertion trop faible pour attraper la
régression.

### 2. Routes gateway hand-roll la pagination **sans borne haute**
Certaines routes réimplémentent la pagination inline, laissant un `limit` client
filer directement dans Prisma `take` :

| Fichier | Lignes | Avant | Zod ? |
|---|---|---|---|
| `routes/posts/interactions.ts` | 624-625, 656-657 | `parseInt(query.limit) \|\| 50` (aucun clamp) | **Non** |
| `routes/admin/reports.ts` | 153 | `parseInt(query.limit) \|\| 10` (aucun clamp) | **Non** |

(Pour contraste, `admin/languages.ts` et `admin/analytics.ts` portent la même
copie inline mais sont **déjà bornés** par un `validateQuery(...QuerySchema)` Zod
en amont — hors périmètre ; voir backlog.)

## Problems identified
1. **Correctness (Prisme des bornes)** : `limit=0` renvoie 20 au lieu de 1 dans
   le SSOT partagé — incohérent avec `limit=-5` et avec le gateway.
2. **Duplication divergente** : le miroir partagé prétend copier le gateway mais
   diverge ; 3 sites de route réimplémentent la pagination au lieu de consommer
   `validatePagination`.
3. **Risque DoS-ish** : `posts/interactions.ts` (×2) et `admin/reports.ts`
   n'ont **aucune borne haute** → un `limit=1000000` client atteint la DB.
4. **Test qui fige le bug** : `toBeGreaterThanOrEqual(1)` masque la valeur
   incorrecte 20.

## Root causes
- Le correctif `limit=0` a été appliqué au gateway `validatePagination` mais
  jamais rétro-propagé au miroir `CommonSchemas` (copié-collé figé).
- Les routes ont grandi avec un `parseInt || N` local avant que le SSOT
  `validatePagination` (avec clamp `maxLimit`) n'existe — jamais migrées.

## Business impact
- Un appel API `?limit=0` sur les endpoints consommant `CommonSchemas` renvoie
  20 résultats au lieu du minimum attendu — comportement surprenant côté client.
- Endpoints `posts/interactions.ts` (viewers de story, réservés à l'auteur) et
  `admin/reports.ts` : requête DB non bornée exploitable pour saturer la mémoire.

## Technical impact
- −1 classe de duplication ; le miroir partagé redevient un vrai miroir.
- 3 routes convergent sur le SSOT clampé → borne haute (100) + plancher (1) +
  `limit=0 → 1` gratuits.

## Risk assessment
**Faible.** `CommonSchemas.pagination`/`messagePagination` n'ont **aucun
consommateur de production** aujourd'hui (uniquement les tests) → le correctif du
miroir ne change aucun comportement live, il aligne l'API et le test. Les routes
gateway : `getPostViews`/`getPostInteractions` ont pour défaut `limit=50` (inchangé),
`getRecentReports` défaut `10` (inchangé) — seule la borne haute et le plancher
changent, aucune régression sur les chemins nominaux (tests verts).

## Proposed improvements (implémentées)
1. `validation.ts` : extraire `clampLimit`/`clampOffset` (SSOT local du module)
   utilisant `Number.isNaN(parsed) ? default : parsed`, consommés par les deux
   schémas. Commentaire réécrit (« Truly mirrors the gateway »).
2. `validation.test.ts` : durcir → `limit=0` **`.toBe(1)`**, `limit=-5`
   `.toEqual({ limit: 1, offset: 0 })`, `messagePagination` `limit=0` `.toBe(1)`.
3. `posts/interactions.ts` (×2) + `admin/reports.ts` : remplacer le
   `parseInt || N` par `validatePagination(offset, limit, { defaultLimit, maxLimit: 100 })`.
4. `interactions-extended.test.ts` : 2 nouveaux tests prouvant le clamp
   (`limit=9999 → 100`, `limit=0 → 1` transmis au service).

## Expected benefits
- Verdict de pagination **cohérent** app-wide (une seule règle de plancher/borne).
- Fin du risque de requête DB non bornée sur 3 endpoints.
- Miroir partagé fiable pour tout futur consommateur des `CommonSchemas`.

## Implementation complexity
**Triviale** — 1 module SSOT durci + 2 helpers, 3 sites de route recâblés, 5
assertions de test renforcées/ajoutées.

## Validation criteria
- `validation.test.ts` : 39/39 vert (vitest), dont la régression `limit=0 → 1`.
- Gateway : `interactions-extended.test.ts` + `admin-reports.test.ts` 48/48,
  `interactions.test.ts` + `interactions2.test.ts` + `utils/pagination` 150/150.
- `tsc --noEmit` gateway : 0 erreur sur les fichiers modifiés.

## Future improvements (backlog restant)
- **Borne haute manquante dans Zod** : `admin-schemas.ts:94`
  `z.number().max(100)` **sans `.min(1)`** → `limit=0`/négatif passe le max mais
  pas le plancher (limité par le `parseInt || N` inline en aval, mais fragile).
  Ajouter `.min(1)` + retirer le fallback inline redondant dans `languages.ts`
  (2 sites) et `analytics.ts`.
- Convergence `getSenderUserId` : `messages.ts:409,665` et
  `conversations/messages.ts:1098` lisent `message.sender?.userId` inline au lieu
  du SSOT `packages/shared/utils/sender-identity.ts` (non-bug aujourd'hui, mais
  duplication conceptuelle).
- Backlog i18n/SSOT display-name : couvert par le swarm (#2305→#2323).
# Iteration 206 — La validation d'email de la gateway (`SecuritySanitizer.sanitizeEmail`) converge sur le SSOT RFC 5322 partagé

## Protocole (démarrage)
`main` @ `e90afd62` (dernier merge : #2331 android/conversations category-picker).
Branche `claude/brave-archimedes-lw419s` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` OK. `packages/shared/dist` construit
via `bun run build` (nécessaire pour le `tsc` de la gateway qui mappe
`@meeshy/shared/*` → `packages/shared/dist/*`). Le jest gateway mappe lui
`@meeshy/shared/(.*)` → la **source** `packages/shared/$1`, donc les tests tournent
sans dist.

PRs ouvertes au démarrage — **audit anti-doublon** : ~16 PRs, majoritairement le
swarm web « converge sur SSOT » (getUserDisplayName #2311/#2313/#2317/#2320,
formatFileSize #2309, language-utils #2315, isUserAnonymous #2305) + gateway
(read-tracking #2307, receipts #2328, pagination #2329, translation-filter #2323)
+ iOS. **Aucune** ne touche `services/gateway/src/utils/sanitize.ts`. Zéro risque
de conflit.

## Sélection : **correctness + Single Source of Truth (validation d'email, couche gateway)**

Le codebase possède déjà un validateur d'email canonique RFC 5322 dans
`packages/shared/utils/email-validator.ts` (`isValidEmail` /
`validateAndNormalizeEmail`). Le **web** a déjà convergé dessus
(`apps/web/utils/xss-protection.ts:299` — « pas de réimplémentation locale »).
La **gateway** était restée en arrière avec une regex inline plus faible.

## Current state (avant correctif)

### `services/gateway/src/utils/sanitize.ts:204` (avant)
```ts
static sanitizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const sanitized = input.trim().toLowerCase();
  if (!emailRegex.test(sanitized)) return null;
  return sanitized;
}
```

Cette regex accepte des adresses que le validateur canonique **rejette** :

| Entrée | Regex inline (gateway) | `validateAndNormalizeEmail` (SSOT) |
|---|---|---|
| `a..b@example.com` (points consécutifs) | ✅ accepté | ❌ rejeté |
| `.user@example.com` (point en tête) | ✅ accepté | ❌ rejeté |
| `user.@example.com` (point en fin) | ✅ accepté | ❌ rejeté |
| `user@-example.com` (domaine tiret-préfixé) | ✅ accepté | ❌ rejeté |
| `user@example-.com` (domaine tiret-suffixé) | ✅ accepté | ❌ rejeté |
| `user@example..com` (points consécutifs domaine) | ✅ accepté | ❌ rejeté |

Le fichier importait déjà `@meeshy/shared` (`NotificationTypeEnum`) →
`validateAndNormalizeEmail` est un **drop-in** (même signature de retour :
email normalisé en lowercase/trimmed, ou `null`).

## Problems identified
1. **Correctness — validation trop permissive à une frontière de confiance.**
   `sanitizeEmail` est le point de normalisation des emails côté gateway. Accepter
   des valeurs malformées (points consécutifs/en tête/en fin, domaines
   tiret-bordés) que le reste de la stack traite comme invalides est une
   incohérence entre chemins similaires (register/reset utilisent le validateur
   strict).
2. **Duplication / 4ᵉ regex d'email divergente.** Après le SSOT partagé et la
   convergence web, cette copie gateway était la 4ᵉ règle de validation d'email
   du repo — exactement la classe que les itérations précédentes réduisaient.
3. **Format 12h/AM-PM sans objet ici** — pas concerné (email), mais même racine :
   logique réimplémentée localement au lieu de consommer le SSOT.

## Root causes
`sanitize.ts` a été écrit avant la centralisation du validateur d'email dans
`@meeshy/shared`. La convergence n'avait été faite que côté web ; la gateway,
bien qu'important déjà `@meeshy/shared`, n'avait pas été recâblée.

## Business impact
Faible surface d'appel directe aujourd'hui (`sanitizeEmail` fait partie de l'API
publique du `SecuritySanitizer` mais n'a pas encore de consommateur route). L'impact
principal est **préventif et de cohérence** : supprimer une règle de validation
d'email plus faible d'une utilité de sécurité empêche un futur bug latent (un
appelant qui ferait confiance à `sanitizeEmail` accepterait des emails que
register/reset rejettent) et unifie le comportement de validation app-wide.

## Technical impact
- Suppression d'une regex divergente ; une seule source de vérité RFC 5322.
- `sanitize.ts` passe de « regex maison » à « délégation SSOT » (−7 lignes de
  logique, +1 import).
- Aucun changement de comportement sur les emails valides (24 cas de test
  existants restent verts) ; seul le rejet des 6 formes malformées change.

## Risk assessment
**Faible.** Changement isolé à une méthode pure sans appelant production actuel.
Les 18 tests `sanitizeEmail` existants passent inchangés ; 6 tests de régression
ajoutés. Import subpath (`@meeshy/shared/utils/email-validator`) identique à celui
déjà utilisé en production par `apps/web/utils/xss-protection.ts` → résolution
build/jest prouvée.

## Proposed improvements (implémentées)
Remplacer la regex inline de `sanitizeEmail` par un appel à
`validateAndNormalizeEmail` du SSOT partagé, après le garde `!input`.

## Expected benefits
- Une seule règle de validation d'email dans tout le repo côté TS.
- Frontière de confiance gateway alignée sur register/reset.
- Maintenance : toute évolution RFC future se fait en un seul endroit.

## Implementation complexity
**Triviale** — 1 import + 7 lignes remplacées par 1 délégation.

## Validation criteria
- `sanitize.test.ts` : 24/24 sur `sanitizeEmail` (18 existants + 6 régressions).
- Suite complète `sanitize.test.ts` : 201/201.
- `tsc --noEmit` gateway : 0 erreur sur `sanitize.ts` / `email-validator`.
- `packages/shared/dist/utils/email-validator.d.ts` présent (build shared OK).

## Future improvements
- **Candidat #2** (non pris ici) : 3 composants web d'auth
  (`ProfileSettings.tsx:102`, `PhoneResetFlow.tsx:235`, `ForgotPasswordForm.tsx:63`)
  utilisent la regex faible `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` → à converger sur
  `isValidEmail` (`@meeshy/shared` ou `xss-protection`). Chemins user-facing réels
  (email-change + reset) ; nécessite tests RTL → itération dédiée.
- **Candidat #3** : `escapeHtml` dupliqué 3-4× (markdown-parser-v2.2 / markdown
  sanitizer / gateway sanitize / xss-protection escapeAttribute divergent).
- **Candidat #4** : logique d'initiales avatar réimplémentée ~10× (`slice(0,2)`
  → « JE » au lieu de « JD »), diverge de `getInitials`/`getUserInitials` ;
  `AdminLayout.tsx:239` crashe si displayName+username null.
- **Candidat #5** : `sanitizeFileName` (`xss-protection.ts:381`) — troncature peut
  dépasser le cap + casse les paires de substitution (à aligner sur
  `truncate.ts`/`truncateFilename`).
