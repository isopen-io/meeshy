# Itération 245 — `resolveRiverLivingLanes` rendait les couloirs vivants en ordre de NAISSANCE, pas par colonne — la navigation latérale de la Rivière enjambait des couloirs vivants

## Protocole (démarrage)

`main` @ `c8726b19` (`feat(android): share-link entry-fact resolver (app-side) (#3335)`).
Branche `claude/brave-archimedes-z6y8jb` réalignée sur `origin/main` au départ
(0 avance / 0 retard). Aucune PR ouverte au démarrage.

Environnement : Linux, **aucune toolchain Swift/Xcode/Android** → surface
exécutable = TypeScript. Parité : `bun install --ignore-scripts` (3861 paquets).
La suite vitest de `packages/shared` tourne directement sur les sources TS
(esbuild), sans `prisma generate` ni build préalable — vérifié : 2434 tests
verts au départ.

**Audit anti-doublon** : les itérations 234-244 ont traité les schémas de
réponse, la normalisation de langue du Prisme (web + preview), les gates de
présence, les plafonds de réaction, les invariants `end ≥ start` et le cap de
`sanitizeFileName`. `docs/routine/analyses/` couvre `resolveRiverLaneAt`
(nommage de colonne d'avis système, itér. 238) et le groupement Focal — **jamais
l'ORDRE des couloirs vivants ni l'enjambement de la navigation latérale**.
Cible fraîche. Numéro 245 (> 244, le plus haut existant).

## Sélection : **Priorité 1 — feature récente (Rivière, amendement R/R2 des
reading-modes, cycles 2026-08-15/17) dont une frontière d'ordre trahit son
contrat affiché et casse une affordance de navigation**

## Current state (avant correctif)

`resolveRiverLivingLanes(geometry, rank)`
(`packages/shared/utils/river-lanes.ts`) rend les couloirs (colonnes) VIVANTS à
un rang donné. C'est **la largeur réelle de l'axe horizontal** à cette hauteur :
ce que la peau dessine, et ce que la navigation latérale (`resolveRiverStep`,
directions `left`/`right`) traverse. Son docstring l'énonce noir sur blanc :

```ts
/**
 * Les branches VIVANTES à ce rang, par colonne croissante. C'est la largeur
 * réelle de l'axe horizontal à cette hauteur : ce que la peau dessine, et ce
 * que la navigation latérale traverse.
 */
export function resolveRiverLivingLanes(geometry, rank) {
  if (geometry.layout === 'serialized') { … }
  return geometry.lanes
    .filter((lane) => spanCovering(lane, rank) !== undefined)
    .map((lane) => lane.laneIndex);          // ← AUCUN tri : ordre de geometry.lanes
}
```

`geometry.lanes` est construit dans l'ordre des `seeds`, lui-même l'ordre de
**NAISSANCE** (`orderLaneIds` : lecteur d'abord, puis par `birthRank`, id
départage). Or `laneIndex` (la COLONNE) est attribuée par le packer glouton
`packColumns` quand il y a plus de voix que de couloirs. Les deux ordres ne
coïncident que **tant qu'aucune colonne n'est partagée**.

## Problems identified

Dès que la conversation compte **plus de `RIVER_MAX_LANES` (7) voix distinctes**
mais **jamais plus de 7 vivantes simultanément** (donc `layout: 'lanes'`, pas
`serialized`), `packColumns` RÉUTILISE une colonne libérée par une voix morte.
Une voix née plus tard hérite alors d'une colonne PLUS BASSE qu'une voix née
plus tôt et encore vivante. `resolveRiverLivingLanes` ne triant pas, il émet ces
colonnes **dans l'ordre de naissance**, pas par colonne croissante.

Cas minimal reproductible (vérifié en exécutant la loi) : lecteur `V` + 8 voix,
vague 1 `A,B,C` tôt, `D` longue durée (garde la colonne 4), vague 2 `E,F,G,H`
après la fenêtre de silence de 30 min (donc `A,B,C` mortes, colonnes libérées) :

```
colonnes : V→0  A→1  B→2  C→3  D→4  E→1  F→2  G→3  H→5
au rang 9 (D,E,F,G,H vivants) :
  résolveur (naissance) → [4, 1, 2, 3, 5]
  contrat (colonne ↗)   → [1, 2, 3, 4, 5]
```

**Conséquence prouvable en aval — la navigation latérale enjambe des couloirs
vivants.** `resolveRiverStep` prend le voisin le plus proche par `first` sur un
tableau supposé trié :

```ts
direction === 'right'
  ? living.filter((l) => l > cursor.laneIndex)          // [0] = plus proche à droite
  : living.filter((l) => l < cursor.laneIndex).reverse() // [0] = plus proche à gauche
```

- Pas à **droite** depuis la colonne 1 (E) : `living=[4,1,2,3,5]`,
  `filter(l>1)=[4,2,3,5]`, `[0]=4` → saute sur la **colonne 4 (D)**, en
  enjambant les colonnes 2 et 3 pourtant vivantes. Attendu : colonne 2 (F).
- Pas à **gauche** depuis la colonne 5 (H) : `filter(l<5)=[4,1,2,3]`,
  `reverse()=[3,2,1,4]`, `[0]=3` → **colonne 3 (G)** au lieu de la colonne 4
  (D), la plus proche à gauche.

Les colonnes intermédiaires deviennent **inatteignables au pas latéral** alors
qu'elles sont vivantes.

## Root causes

`geometry.lanes` porte deux ordres qui ne coïncident qu'en l'absence de partage
de colonne : l'ordre de tableau est la NAISSANCE (`orderLaneIds`), la valeur
`laneIndex` est la COLONNE (`packColumns`, coloration gloutonne d'intervalles
qui réutilise les colonnes libérées). Le résolveur lisait l'ordre de tableau en
croyant lire l'ordre de colonne. Le contrat affiché (« par colonne croissante »)
décrivait la BONNE loi ; l'implémentation ne l'appliquait pas.

Le miroir iOS (`RiverLaneResolver.resolveRiverLivingLanes`, R-132) portait le
MÊME défaut — et son docstring, lui, DÉCRIVAIT le défaut comme intentionnel
(« l'ordre est celui de `geometry.lanes` (ordre de naissance) »), en
contradiction directe avec la loi TS. Les deux `resolveRiverStep` (TS + Swift)
héritent donc de l'enjambement.

## Business impact

La Rivière est un mode de lecture récent (amendement R, décision produit du
2026-08-15) pensé pour les conversations À PLUSIEURS. Son différenciateur EST la
navigation à deux axes. Le défaut ne se manifeste QUE sur une conversation
active à ≥ 8 interlocuteurs distincts — exactement le public cible du mode. Le
pas latéral y saute des interlocuteurs vivants ; l'utilisateur ne peut pas
atteindre certaines colonnes au geste, sans aucun signal d'erreur.

## Technical impact

Défaut de correction pur, dans une fonction pure partagée par les trois
frontends (iOS en miroir, Android en phase 2). Aucune fuite de données, aucune
régression de sécurité. Silencieux : le rendu n'a jamais paru cassé (les
couloirs sont dessinés, seule leur atteignabilité au pas latéral est fausse).

## Risk assessment

**Faible.** Le correctif est un tri stable par colonne croissante sur une valeur
numérique, appliqué au seul point de lecture. Prouvé sans effet sur les 24
vecteurs `river-lanes`, les 15 `river-headers` et les 20 `river-step` existants
(aucun n'exerçait de géométrie à colonnes partagées avec ordre naissance ≠
colonne — le défaut n'était couvert par AUCUN vecteur). La géométrie
(`resolveRiverLanes`) n'est pas touchée.

## Proposed improvements (livrés)

1. **TS SSOT** : `.sort((a, b) => a - b)` sur la sortie de
   `resolveRiverLivingLanes`. Le docstring disait déjà vrai ; l'implémentation le
   respecte désormais.
2. **Miroir iOS** : `.sorted()` sur `RiverLaneResolver.resolveRiverLivingLanes`
   + docstring réécrit pour cesser de décrire le défaut comme intentionnel et
   citer la cause (réutilisation de colonne par `packColumns`).
3. **Tests TS (RED→GREEN)** : nouveau `describe('partage de colonnes …')` dans
   `river-lanes.test.ts` — décor (layout `lanes`, colonnes partagées), ordre par
   colonne croissante, pas à droite et pas à gauche atteignant le voisin le plus
   proche. Prouvés ROUGES avant correctif (`[4,1,2,3,5]`, droite→4, gauche→3),
   verts après.
4. **Vecteurs inter-plateformes** : deux cas ajoutés à
   `river-step.vectors.json` (`colonne-partagee-pas-a-droite-…`,
   `…-pas-a-gauche-…`), générés en EXÉCUTANT la loi corrigée. iOS
   (`RiverLaneVectorTests`) les rejoue : ils tomberaient ROUGE sans le correctif
   Swift, verts avec — c'est ce qui tient la parité cross-plateforme du
   correctif.

## Expected benefits

- La navigation latérale de la Rivière atteint le voisin de colonne le plus
  proche, sans jamais enjamber un couloir vivant, y compris en partage de
  colonnes.
- Le contrat affiché (« par colonne croissante ») et l'implémentation
  concordent sur les deux plateformes ; le docstring iOS ne documente plus un
  défaut.
- Un piège de régression cross-plateforme est armé (vecteurs) là où il n'y en
  avait aucun.

## Implementation complexity

Triviale au fond (deux `sort`), non triviale à ÉTABLIR : il fallait prouver que
naissance ≠ colonne se produit sur une géométrie `lanes` (pas `serialized`),
construire le décor à 9 voix / 2 vagues qui le déclenche, et vérifier que le
correctif ne bouge AUCUN vecteur existant avant d'en ajouter.

## Validation criteria

- [x] 3 nouveaux tests TS ROUGES avant, VERTS après.
- [x] Suite `river-lanes.test.ts` : 82 tests verts.
- [x] Vecteurs `river-step` (22), `river-lanes` (24), `river-headers` (15) verts.
- [x] Suite `packages/shared` complète : 2434 tests verts, aucun régressé.
- [x] Diff de production minimal (2 × `sort`/`.sorted()` + docstrings).

## Remaining work / dette identifiée (NON traitée ici — à prioriser)

**Le sous-arbre de tests DMA/Signal est DORMANT.** En cherchant la cible, j'ai
établi que `services/gateway/jest.config.json` porte
`"<rootDir>/src/dma-interoperability/"` dans `testPathIgnorePatterns`, ET que
`tsconfig.json` exclut les fichiers de test (`src/**/__tests__/**`). Le cycle 94
a remis le CODE DE PRODUCTION DMA sous le compilateur (`include`), mais **les
suites `DoubleRatchet.test.ts` / `SignalKeyManager.test.ts` /
`X3DHKeyAgreement.test.ts` ne sont NI compilées NI exécutées** par la CI.

Sous ce silence vit au moins un défaut de correction réel :
`DoubleRatchet.skipMessageKeys` avance la clé de chaîne (`chainKeyReceive`) mais
**ne met jamais à jour `session.messageNumberReceive`**. Après un message
out-of-order (`getMessageKeyReceive` branche « ahead »), le compteur et la
position de la chaîne se DÉSYNCHRONISENT : le compteur reste à l'ancienne valeur
+1 pendant que la chaîne est à `until+1`. Le test dormant
`DoubleRatchet.test.ts:252` (« should handle message received ahead of
expected ») attend d'ailleurs `messageNumber === 3` là où le code rend `0` — il
échouerait s'il tournait. `getMessageKeyReceive` est câblé en production
(`SignalProtocolEngine.ts:432`).

Ce lot **ne le traite pas** : réveiller la suite DMA et corriger la crypto est
un lot à part entière (surface E2EE sensible, suite entière à réactiver, risque
de découvrir d'autres échecs figés), à instruire seul et pas en passager d'un
correctif de navigation. Il est nommé ici pour l'itération suivante — « la bonne
réponse à un défaut hors périmètre n'est pas d'élargir la PR, mais de dire
exactement ce qui reste » (leçon cycle 94).
