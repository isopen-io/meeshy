# Iteration 238 — `MyMentionsQuerySchema.limit` sans garde numérique ni clamp : un `take` Prisma négatif inverse le contrat « mentions récentes »

## Protocole (démarrage)
`main` @ `c138ffe4` (dernier commit : `feat(android/chat): composer draft persists the
manual language pick (parity iOS) (#3254)`). Branche `claude/brave-archimedes-uq96rw`
réalignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3863 paquets), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Baseline
`packages/shared` verte (18 fichiers, 255 tests) ; `services/gateway`
`src/__tests__/unit/validation/` verte au départ (10 suites).

**Audit anti-doublon** (8 PRs ouvertes au départ) : #3253 (shared `chunk()`), #3251/#3250
(iOS), #3249 (shared role primitives), #3247 (web Focal), #3245 (gateway v1→v3 timing),
#3243/#3242 (invariant `endMs>=startMs`). **Aucune PR ouverte ne touche
`services/gateway/src/validation/mentions-schemas.ts`, `routes/mentions.ts` ni
`MentionService.ts`** — zéro chevauchement de fichier. Cible trouvée par un audit sous-agent
ciblé des schémas de query paginés du gateway.

## Sélection : **Priorité 1 — feature récente dont un gate de validation dévie de la norme partagée**

Le chantier « mentions » (`GET /mentions/me`, `MentionService.getRecentMentionsForUser`) est
actif. Son schéma de query `MyMentionsQuerySchema` est le SEUL, parmi les schémas de query
paginés du gateway, à omettre la garde numérique et le clamp `1..100` que portent ses quatre
jumeaux (`GetNotificationsQuerySchema`, `MessageStatusDetailsQuerySchema`,
`AttachmentStatusDetailsQuerySchema`, `GetStatsQuerySchema`). Divergence de contrat + bug de
justesse prouvable.

## Current state (avant correctif)

```ts
export const MyMentionsQuerySchema = z.object({
  limit: z
    .string()
    .transform(Number)     // 'abc' → NaN, '-5' → -5, '100000' → 100000
    .prefault('20')
}).strict();
```

La valeur validée traverse `routes/mentions.ts:184-196` :

```ts
const { limit } = request.query;
...
const mentions = await mentionService.getRecentMentionsForUser(userId, limit || 50);
```

puis atteint `MentionService.getRecentMentionsForUser` (`MentionService.ts:932-983`) :

```ts
this.prisma.mention.findMany({ ..., orderBy: { mentionedAt: 'desc' }, take: limit });
```

## Problems identified

1. **`take` Prisma négatif → inversion sémantique.** `?limit=-5` passe le `.transform(Number)`
   verbatim (`-5`), survit au `limit || 50` (un nombre négatif est *truthy*), et atteint
   `findMany` en `take: -5`. Sous `orderBy: { mentionedAt: 'desc' }`, un `take` négatif renvoie
   les N dernières lignes de l'ordre — donc les mentions les plus **ANCIENNES**, à l'envers.
   L'endpoint nommé « mentions récentes » sert alors le contraire de son contrat, silencieusement.
2. **`NaN` sur entrée non numérique.** `?limit=abc` → `NaN`. `NaN` étant *falsy*, le
   `limit || 50` le masque en 50 aujourd'hui — mais c'est un masquage fortuit du site d'appel,
   pas une garantie du gate ; tout autre lecteur du champ hériterait du `NaN`.
3. **Plafond partagé contourné.** `?limit=100000` passe : un `take` non borné là où les quatre
   schémas jumeaux plafonnent à 100. Charge mémoire/DB non bornée sur un endpoint authentifié.
4. **Divergence de contrat entre schémas jumeaux.** Le lecteur qui consulte
   `notification-schemas.ts` voit `regex(/^\d+$/) + refine(1..100)` ; celui qui consulte
   `mentions-schemas.ts` voit son absence — même classe de champ (`limit` de query paginée),
   contrats différents.

## Root causes
- Le schéma a été écrit isolément, sans réemployer la brique `limit` déjà standardisée dans
  les quatre autres schémas de query paginés. L'invariant `1..100` est une propriété du champ
  `limit` de pagination, pas d'un endpoint particulier ; il aurait dû être hérité dès l'origine.
  Le `limit || 50` du site d'appel a de plus masqué le symptôme le plus visible (`NaN`),
  laissant croire le gate suffisant.

## Business impact
- **Justesse fonctionnelle.** `?limit=-5` (ou tout négatif) retourne les mentions les plus
  anciennes à l'envers — un client qui construirait cette query verrait un fil de mentions
  faux, sans erreur ni trace. Aucun rapport utilisateur ne l'atteste à ce jour (les clients
  connus n'envoient pas de négatif), mais le gate est l'unique responsable de l'invariant.
- **Robustesse/ressources.** Un `limit` démesuré contourne le plafond que tout le reste du
  gateway respecte — DoS léger possible sur un endpoint authentifié.

## Technical impact
- **Contrat de wire :** `?limit` non numérique / `< 1` / `> 100` devient un `400` du
  `validateQuery` preHandler (comportement identique aux quatre schémas jumeaux), au lieu de
  traverser. Émetteurs légitimes connus (web) : n'envoient jamais ces valeurs → **zéro
  régression fonctionnelle attendue**. Le `limit || 50` du site d'appel devient inatteignable
  pour la branche `NaN`/`0` (le gate rejette avant) mais reste inchangé — hors périmètre.
- **Coverage :** nouvelle suite `src/__tests__/unit/validation/mentions-schemas.test.ts`
  (15 tests) couvrant `MyMentionsQuerySchema` (bornes 1/100, rejets `abc`/`-5`/`0`/`101`/
  `100000`, défaut 20, strict) + gardes de régression sur les deux autres schémas exportés du
  fichier (`SuggestionsQuerySchema`, `MessageIdParamSchema`), jusque-là sans suite dédiée.
- **`tsc` :** 0 nouvelle erreur. `MyMentionsQuery` (`z.infer`) reste `{ limit: number }`,
  compatible avec `UserMentionsQuery { limit?: number }` du site d'appel.

## Risk assessment
- **Faible.** La refine est colocalisée dans un schéma à un seul point d'appel
  (`routes/mentions.ts:181`, via `validateQuery(MyMentionsQuerySchema)`), lequel répond déjà
  `400` sur `!success`. Le patch RECOPIE la forme exacte, éprouvée, de quatre schémas jumeaux.
- **Rollback :** retirer `.regex(...)` + `.refine(...)` et la suite de tests.

## Proposed improvements
1. **RED** : suite `mentions-schemas.test.ts` — 5 tests tombent rouges sur `main`
   (`abc`, `-5`, `0`, `101`, `100000` traversent).
2. **GREEN** : `.string().regex(/^\d+$/).transform(Number).refine(v => v >= 0 && v <= 100).prefault('20')`.
   C'est le `regex(/^\d+$/)` qui ferme le vrai défaut (un négatif ne matche jamais
   `\d+` → 400, donc jamais de `take: -5`) ; le `refine` ne fait que plafonner.
3. **REFACTOR** : commentaire in-line citant les schémas jumeaux et le chemin
   `take: limit` de `MentionService`, pour que la divergence ne se reforme pas.

## Correctif CI (post-push, catch de `Test gateway`)
Le premier push (`refine(v >= 1)`, aligné strictement sur les jumeaux) a fait tomber
un témoin de route PRÉEXISTANT :
`mentions-routes.test.ts › falls back to limit=50 when limit=0 is provided (falsy guard)`
(attendu 200 + service appelé avec `50`, reçu 400). Ce test gèle un contrat
DÉLIBÉRÉ **propre à ce endpoint** : `routes/mentions.ts` fait `limit || 50`, donc
`limit=0` y signifie « non spécifié → défaut 50 ». Les schémas jumeaux rejettent `0`
car ils n'ont pas ce repli ; `MyMentionsQuerySchema` doit donc admettre `0`
(borne basse `>= 0`, pas `>= 1`). Le vrai bug — `take` NÉGATIF — était fermé par le
`regex` seul ; `0` n'a jamais été le défaut (`take: 0` est inoffensif, et le repli le
transforme de toute façon en 50). Contrat corrigé : `regex(/^\d+$/)` + `refine(0..100)`.
Leçon : lancer AUSSI `mentions-routes.test.ts`, pas seulement `mentions-suggestions`,
avant de pousser un changement de schéma de query de ce endpoint.

## Validation criteria
- `mentions-schemas.test.ts` : 15/15 vert après fix (5 rouges avant).
- `src/__tests__/unit/validation/` + `mentions-suggestions.test.ts` : sans régression
  (346/346 vert).
- `tsc --noEmit -p tsconfig.json` : propre.

## Améliorations futures (candidats non retenus cette itération)
- **Nettoyer le `limit || 50` désormais mort** de `routes/mentions.ts:195` (le gate garantit
  `1..100`, la branche `|| 50` est inatteignable) — cosmétique, hors périmètre du fix de
  justesse, à peser séparément pour ne pas élargir le diff.
- **Brique `limit` partagée** extractible des cinq schémas de query paginés (DRY) — refactor
  transverse à peser à part (touche 3 fichiers de schémas + leurs suites).
