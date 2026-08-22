# Iteration 239 — les `limit` des query-schemas admin non bornés (jumeaux du gate #3255)

## Protocole (démarrage)
`main` @ `60196fb4` (`feat(android/chat): AI conversation-analysis summary card (parity iOS) #3287`).
Branche `claude/brave-archimedes-e3a8fd` réalignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3861 paquets), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`.
Suite `services/gateway/src/__tests__/unit/validation/admin-schemas.test.ts` verte au départ (57 tests).

**Audit anti-doublon** (19 PRs ouvertes au départ, toutes de type « born-defect surgical fix »).
PR la plus proche : **#3255** `fix(gateway): MyMentionsQuerySchema.limit gagne la garde numérique +
clamp 1..100 (take Prisma négatif interdit)` — MÊME classe de défaut, fichier DIFFÉRENT
(`validation/*` mentions vs `validation/admin-schemas.ts`). **Aucune PR ouverte ne touche
`services/gateway/src/validation/admin-schemas.ts`** ni les routes `admin/languages.ts` /
`admin/invitations.ts` — zéro chevauchement de fichier.

## Sélection : **Priorité 1 — feature récente (query-schemas admin) portant le même défaut de
naissance qu'un gate déjà corrigé ailleurs (#3255)**

## Current state (avant correctif)

`services/gateway/src/validation/admin-schemas.ts` déclare 8 query-schemas portant un champ `limit`.
Trois familles coexistent :

| schéma | forme `limit` | borne |
|---|---|---|
| `BroadcastsListQuerySchema` (l.52) | `.pipe(z.number().min(1).max(100))` | **1..100** ✅ |
| `RankingsQuerySchema` (l.162) | `.pipe(z.number().min(1).max(100))` | **1..100** ✅ |
| `InvitationsListQuerySchema` (l.94) | `.pipe(z.number().max(100))` | **≤100, pas de plancher** ⚠️ |
| `AnalyticsLanguageDistQuerySchema` (l.16) | `.transform(Number)` seul | **aucune** ❌ |
| `LanguageStatsQuerySchema` (l.120) | `.transform(Number)` seul | **aucune** ❌ |
| `TranslationAccuracyQuerySchema` (l.133) | `.transform(Number)` seul | **aucune** ❌ |
| `AnonymousUsersQuerySchema` (l.33) | `.transform(Number)` seul | **aucune** (voir Risk) |
| `AnalyticsKpis` / `MessagesStats`… | pas de `limit` | — |

Deux schémas montrent l'intention canonique (`z.number().int().min(1).max(100)`) que les autres
ont perdue. `InvitationsListQuerySchema` a écrit la borne HAUTE mais oublié la BASSE — asymétrie qui
se lit comme une faute de frappe, le sibling `BroadcastsListQuerySchema` juste au-dessus prouve
l'intention.

## Problèmes identifiés + Root cause

Chaque schéma `limit` non borné alimente une lecture paginée. Selon la destination du nombre, un
`limit` négatif/zéro/non-entier/gigantesque produit un défaut DIFFÉRENT :

1. **`TranslationAccuracyQuerySchema` → 500 crash reachable.**
   `routes/admin/languages.ts:353` : `parseInt(query.limit) || 10` → `translationPairsPipeline({limit})`
   → étape MongoDB `{ $limit: options.limit }` (l.48). **MongoDB `$limit` rejette toute valeur ≤ 0**
   (« the limit must be positive ») : `GET …/translation-accuracy?limit=-5` fait remonter une
   erreur d'agrégation, attrapée en `catch` → **HTTP 500**. Défaut avec des DENTS.

2. **`LanguageStatsQuerySchema` / `AnalyticsLanguageDistQuerySchema` → résultats FAUX.**
   `languages.ts:157` et `analytics.ts:251` : `take: limit` sur un `prisma.*.groupBy`. Un
   `take` négatif prend les N DERNIERS au lieu des N premiers — le « top langues » rend le bas du
   classement, silencieusement. Aucune borne haute non plus : `?limit=999999999` passe.

3. **`InvitationsListQuerySchema` → incohérence de contrat.**
   Protégé en profondeur en aval (`validatePagination` clampe `[1,100]`), donc pas de bug atteignable
   AUJOURD'HUI ; mais le contrat Zod DÉCLARÉ est faux et asymétrique. Un futur retrait du
   `validatePagination` redondant (« Zod valide déjà ») réintroduirait le `take` négatif en silence.

Root cause commune : trois copies indépendantes du même contrat de pagination, dont seules deux
portent l'invariant complet. Le `parseInt(query.limit) || N` des handlers ne rattrape que le cas
`NaN`/`0`-falsy, jamais le négatif ni le hors-plafond.

## Business / Technical impact
- Endpoints admin (`requireAdmin`) — surface restreinte, mais un ADMIN peut aujourd'hui faire tomber
  `/translation-accuracy` en 500 avec un simple `?limit=-1`, et lire un « top langues » inversé.
- `take`/`$limit` non plafonnés = requête d'agrégation non bornée déclenchable par query string.

## Risk assessment
- **`AnonymousUsersQuerySchema` volontairement LAISSÉ tel quel** : son `limit` transite par
  `validatePagination` (qui CLAMPE `200 → 100`), pas par un rejet Zod. Y ajouter `.max(100)`
  changerait la sémantique `200 → clamp 100` en `200 → HTTP 400` — décision de POLITIQUE, hors
  périmètre d'un correctif de justesse. Documenté en « améliorations futures ».
- Changement de comportement assumé pour les 4 schémas corrigés : une entrée jusqu'ici tolérée
  (négatif/hors-plafond/non-entier) devient un `400` de validation — c'est le comportement CORRECT
  et déjà celui des siblings `Broadcasts`/`Rankings`. Les valeurs par défaut et toutes les valeurs
  valides restent inchangées (prouvé runtime).

## Proposed improvement (retenu)
Aligner les 4 schémas déviants sur l'invariant canonique `z.number().int().min(1).max(100)` déjà
porté par `BroadcastsListQuerySchema` et `RankingsQuerySchema` :
- 3 schémas non bornés → ajout `.pipe(z.number().int().min(1).max(100))` après `.transform(Number)`.
- `InvitationsListQuerySchema` → `.max(100)` complété en `.int().min(1).max(100)`.

## Expected benefits
- Le 500 de `/translation-accuracy` devient un 400 de validation propre.
- Le « top langues » ne peut plus être inversé ni non plafonné.
- Un seul contrat de pagination admin, 5 schémas identiques — convergence demandée par la mission.

## Implementation complexity
Triviale, locale, pure. 4 lignes de schéma. Aucun changement d'API publique (`z.infer` reste
`{ limit: number }`), aucun wire format, aucune migration.

## Validation criteria
- [x] RED : 11 nouveaux tests prouvant l'acceptation actuelle de `<1` / `>100` / non-entier.
- [x] GREEN : 68/68 `admin-schemas.test.ts`.
- [x] Défauts + valeurs valides inchangés (vérif runtime tsx : `{}` → 5/10/20 ; `50` accepté).
- [x] Non-régression : 333/333 sur `unit/validation` + `routes/admin`.
- [x] `tsc --noEmit` propre sur `services/gateway`.
- [ ] CI verte sur la PR.
