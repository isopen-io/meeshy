# Iteration 238 — `resolveRiverLaneAt` nommait une colonne au rang d'un avis système (jumeau oublié de `7dcea069`)

## Protocole (démarrage)
`main` @ `24895ac7` (dernier commit : `feat(android/feed): on-demand post-detail
translation via the flag strip's request-missing-language arm (#3269)`). Branche
`claude/brave-archimedes-3g4ujt` réalignée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3861 paquets), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suite vitest
partagée verte au départ (97 fichiers, 2351 tests).

**Audit anti-doublon** (14 PRs ouvertes au départ) : #3266 (SignalSchemas iv), #3263
(web/calls createPeerConnection), #3262 (removingHandle), #3259 (formatTimeRemaining NaN, iter 237),
#3257/#3250 (iOS), #3255 (MyMentionsQuerySchema limit), #3253 (chunk size<1), #3249 (rôle casse),
#3247 (Focal), #3245 (convertisseur v1→v3 timing), #3243 (`timeRangeMsSchema` mutualisé — la
candidature « endMs≥startMs 3e site » du plan 236 est DONC déjà prise), #3242 (écoute continue
endMs≤startMs). **Aucune PR ouverte ne touche `packages/shared/utils/river-lanes.ts`** — zéro
chevauchement de fichier. La famille « endMs≥startMs » (candidat retenu du plan 236) étant
entièrement couverte par #3242/#3243/#3245, la sélection s'est portée ailleurs, sur un audit
systématique des utils partagés sous-testés.

## Sélection : **Priorité 1 — feature récemment modernisée dont un jumeau de loi porte encore le défaut corrigé partout ailleurs**

Le commit `7dcea069` (« un avis système n'est la voix de personne ») a rendu la Loi de la Rivière
aveugle aux avis système partout où un `laneId`/`laneIndex` de bulle est lu comme une prise de
parole : `spokenOnly`, `collectEngagements`, `connectors`, et surtout `serializedOccupancies`
(`river-lanes.ts:865` — `if (bubble.isSystem) return groups;`). Il a **manqué un seul site jumeau** :
`resolveRiverLaneAt`, la requête sœur qui répond « QUI occupe cette colonne à cette hauteur ».

## Current state (avant correctif)

`RiverBubble.laneId` porte une invariant documentée (`river-lanes.ts:147-151`) :

> Le couloir qui porte la bulle — et il n'a de sens que pour une PRISE DE PAROLE. Un avis système
> (`isSystem`) n'occupe la colonne de personne : il se rend pleine largeur, et ces deux champs ne se
> lisent pas pour lui.

La branche sérialisée de `resolveRiverLaneAt` lisait pourtant `bubble.laneId` **sans condition** :

```ts
if (geometry.layout === 'serialized') {
  const bubble = geometry.bubbles.find((candidate) => candidate.rank === rank);
  const lane =
    laneIndex === 0 && bubble !== undefined
      ? geometry.lanes.find((candidate) => candidate.laneId === bubble.laneId)
      : undefined;
  return lane ?? null;
}
```

Un avis système porte l'ARRIVANT pour auteur (`join-notice.ts`). Si cet arrivant prend ensuite la
parole, il POSSÈDE une colonne — et `resolveRiverLaneAt(geometry, 0, <rang de l'annonce>)` retournait
alors SA colonne, affirmant qu'il « occupe » la colonne au rang de sa propre annonce d'arrivée.

## Problems identified

1. **Incohérence de loi entre requêtes sœurs.** `serializedOccupancies` (qui alimente
   `resolveRiverLaneHeaders`) exclut les avis système ; `resolveRiverLaneAt` ne le faisait pas. Deux
   réponses contradictoires à « qui occupe la colonne au rang d'une annonce » selon la porte d'entrée.
2. **Mensonge de présence à l'écran.** La doc de `resolveRiverLaneAt` dit que c'est la requête qui
   « fait défiler le nom en tête du fil » en mode sérialisé. Une peau pilotant l'en-tête défilant par
   cette fonction rendrait *« Lena »* au-dessus de la ligne *« Lena a rejoint la conversation »* —
   exactement le « quelqu'un qui vient seulement d'entrer » que `7dcea069` visait à éliminer.

## Root causes
- `7dcea069` a durci chaque site qui LIT un `laneId` de bulle comme une prise de parole, mais le
  balayage a manqué `resolveRiverLaneAt` : son test-suite couvrait colonnes partagées et sérialisées
  mais **jamais avec un avis système**, donc rien n'a signalé le trou.

## Business impact
- **Faible aujourd'hui** : aucune peau (web/iOS/Android) ne consomme encore `resolveRiverLaneAt`
  (`grep` : zéro appelant hors tests, aucun miroir SDK). C'est un building-block de la Lentille pas
  encore câblé. Le gain est **préventif** : fermer l'incohérence AVANT qu'une peau ne pilote son
  en-tête défilant par cette requête et n'affiche le mensonge de présence.

## Technical impact
- Une ligne de condition (`&& !bubble.isSystem`) réaligne la requête sur `serializedOccupancies`.
  Aucun changement de signature, aucun consommateur à migrer.

## Risk assessment
- **Minime.** Fonction pure, un seul chemin modifié (branche sérialisée, `laneIndex === 0`, rang
  d'un avis). Les 114 tests river-lanes existants restent verts ; l'ajout couvre le rang système.

## Proposed improvements
1. `laneIndex === 0 && bubble !== undefined && !bubble.isSystem` dans la branche sérialisée.
2. Doc de `resolveRiverLaneAt` : consigner l'exception « rang d'un avis ⇒ `null` », renvoi à
   `serializedOccupancies`.
3. Test RED→GREEN : `[notice('j','lena',0), message('a','lena',1), message('b','mia',2)]` sérialisé ;
   `resolveRiverLaneAt(geometry, 0, 0)` doit être `null` (annonce), rang 1 → `lena`, rang 2 → `mia`.

## Expected benefits
- Cohérence totale de la Loi de la Rivière face aux avis système : toutes les requêtes de colonne
  répondent désormais identiquement.
- Chemin sérialisé × avis système enfin couvert par un test.

## Implementation complexity
- **Triviale** : 1 ligne de code + doc + 1 test. Aucune dépendance, aucun build cross-service.

## Validation criteria
- `bun run build` (tsc) vert dans `packages/shared`.
- `bunx vitest run river-lanes` : 115/115 (114 + 1 nouveau).
- Suite partagée complète : 2352/2352 (2351 + 1).
- `grep resolveRiverLaneAt apps services packages/MeeshySDK apps/android` : aucun consommateur/miroir
  impacté.

## Améliorations futures
- **Monotonie/couverture des autres requêtes de la Rivière** : audit croisé de `resolveRiverStep`
  et `resolveRiverLivingLanes` face aux avis système (a priori déjà corrects — ils ne lisent pas de
  `laneId` de bulle — mais non prouvé par test dédié système).
- **Runners-up de l'audit utils** (candidats non retenus, plus faibles) :
  - `relative-time.ts` `classifyRelativeTime` : pas de garde NaN sur `targetMs`/`nowMs` (retombe en
    `beyond`) — faible, appelants passent des ms valides.
  - `focus-curve.ts` `focusCurve` : `clampUnit(NaN)` propage `NaN` dans `alpha`/`scale` malgré la
    revendication « loi pure et totale ».
  - `conversation-sections.ts` `classify` : `categoryId != null` sans `!== ''`, incohérent avec
    `hasCategory` — inoffensif tant qu'un id de catégorie vide reste impossible.
- **Câblage skin de `resolveRiverLaneAt`** : quand une peau pilotera l'en-tête défilant sérialisé
  par cette requête, ajouter le test d'intégration bout-en-bout.
