# Iteration 240 — Le convertisseur v1→v3 pouvait servir un `timing` d'objet inversé (jumeau du bug `bounds` fermé itération 236)

## Protocole (démarrage)
`main` @ `8d4081f9` (dernier commit : `chore(deps): réaligner bun.lock sur les montées
Dependabot (framer-motion 13.1.1, turbo 2.10.11)`). Branche `claude/brave-archimedes-e53uqg`
redémarrée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3861 paquets), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suite
`canvasV3|storyEffects*` gateway verte au départ (130/130).

**Audit anti-doublon** (4 PRs ouvertes au départ) : #3244 (android row story ring), #3243
(refactor `time-range.ts` — invariant `endMs>=startMs` source unique, touche
`attachment-validators.ts`, `call-schemas.ts`, `messages-schemas.ts` + nouveau
`packages/shared/utils/time-range.ts`), #3242 (gateway écoute continue `endMs<=startMs`),
#3241 (iOS fiche conversation). **Aucune PR ouverte ne touche
`services/gateway/src/services/posts/storyEffectsV3.ts` ni
`services/gateway/src/__tests__/unit/services/posts/canvasV3.fixtures.test.ts`** — zéro
chevauchement de fichier. En particulier #3243 mutualise l'invariant temporel des *segments*
mais ne touche PAS le convertisseur story-effects.

## Sélection : **Priorité 1 — durcissement d'une feature récente (CanvasV3 read-path), follow-up explicite d'itération 236**

L'itération 236 (mergée #3240) a posé l'invariant `end >= start` sur `TimingSchema` ET corrigé
le convertisseur pour que l'audio `bounds` ne sorte jamais un intervalle corrompu. Elle a
laissé un **jumeau** non traité : le `timing` d'objet, construit par `baseObject`, portait
exactement le même défaut de naissance. Ce follow-up ferme le second gap avec le MÊME patron
que le premier.

## Current state (avant correctif)

`convertV1ToV3` sert l'archive story v1 aux clients v3 capables (chemin de LECTURE,
`convertStoryEffectsForWire` → `negotiateWireStoryEffects`, sous `CANVAS_V3_READ`). Sa sortie
n'est **jamais re-validée** contre `CanvasV3Schema` (la validation stricte `CANVAS_INVALID`
vit sur le chemin d'ÉCRITURE, où les blobs v3 sont authorés nativement).

`baseObject` (`storyEffectsV3.ts:22-27` avant correctif) copiait les bornes de fenêtre d'un
objet directement, sans invariant relationnel :

```ts
const timing: NonNullable<ObjectV3['timing']> = {};
if (typeof o.startTime === 'number') timing.start = o.startTime;
if (typeof o.endTime === 'number') timing.end = o.endTime;
```

Un objet v1 (texte, média, sticker…) portant `startTime: 4, endTime: 1` — un ordre légal en
v1, qui n'a jamais eu cet invariant — produisait `timing: { start: 4, end: 1 }`. Un intervalle
qui se termine AVANT de commencer, servi tel quel aux clients v3.

C'est exactement le défaut que l'itération 236 a fermé pour l'audio `bounds`
(`num(..., 0)` → `end: 0` parasite), mais sur le chemin `bounds` uniquement — la fenêtre
d'objet a été oubliée.

## Problems identified

1. **Intervalle temporel corrompu servi aux clients v3.** `TimingSchema` refuse `end < start`
   depuis itération 236 ; le convertisseur pouvait pourtant en fabriquer un et le pousser sur le
   fil sans passer par ce garde (chemin lecture non re-validé). Le contrat côté schéma et le
   comportement côté convertisseur divergeaient.
2. **Asymétrie intra-fichier.** Le même fichier (`storyEffectsV3.ts`) portait la garde sur
   `bounds` (audio) mais pas sur `timing` (objet), alors que la sémantique est identique. Un
   lecteur du code voyait la protection à un endroit et son absence deux blocs plus haut.
3. **Chemin non couvert par les tests.** Le seul fixture v1→v3 (`v1-legacy-full.json`) porte des
   bornes de timing ordonnées ; aucun test n'exerçait l'inversion sur `timing`.

## Root causes
- L'itération 236 a traité le symptôme là où il avait été REMARQUÉ (`bounds`, via le pattern
  `num(x, 0)` destructeur) sans généraliser à l'autre porteur du même couple `(start, end)` dans
  le même convertisseur. Le `timing` d'objet ne passe pas par `num(x, 0)` (il teste
  `typeof === 'number'` directement), donc il n'a pas attiré l'œil du correctif `num`-centré.

## Business impact
- **Faible mais réel, purement défensif.** Un `timing` d'objet inversé signifie une fenêtre
  d'affichage vide/négative : selon le renderer client, l'objet ne s'affiche jamais, ou s'affiche
  de manière indéterminée. Aucun rapport runtime ne l'atteste (les éditeurs actuels produisent des
  bornes ordonnées), mais un blob v1 hérité mal formé, un futur éditeur bogué, ou un import tiers
  pouvait faire passer la corruption jusqu'aux clients — sans trace ni garde. On ferme la porte.

## Technical impact
- **Aucun comportement observable ne change pour les données valides.** Le golden
  `v1-legacy-full.v3.json` porte un timing ordonné → sortie inchangée (test golden vert).
  `end === start` (durée nulle) reste accepté (la borne est `>=`, pas `>`), une timing partielle
  (une seule borne) reste préservée.
- **Convertisseur tolérant, aligné sur `bounds`.** Une fenêtre inversée dégrade en « pas de
  fenêtre » (l'objet reste visible tout du long), jamais en donnée corrompue. Ajout d'un
  `Number.isFinite` sur les deux bornes, à parité avec le helper `num`/le garde `bounds`
  (`NaN`/`Infinity` → borne ignorée plutôt que copiée pour échouer plus loin sur `min(0)`).
- **Types inchangés.** `z.infer<typeof CanvasV3Schema>` inchangé. `tsc --noEmit` gateway : 0
  nouvelle erreur.
- **Coverage :** +4 tests dans `canvasV3.fixtures.test.ts` (jumeau exact du bloc
  `bounds audio ne sortent jamais un intervalle corrompu`).

## Risk assessment
- **Négligeable.** `baseObject` est le SEUL constructeur d'objet du convertisseur ; son unique
  responsabilité est de produire un `ObjectV3`. Aucun fixture ni test existant ne pose une timing
  inversée. Le refine préserve la partialité (une seule borne) et la durée nulle. Recherche : aucun
  consommateur ne dépend d'une timing inversée émise par le convertisseur.
- **Rollback :** `git revert` du commit unique. Aucun changement d'API ni de wire format.

## Proposed improvements
1. **RED** : +4 tests `convertV1ToV3 — le timing d'un objet ne sort jamais un intervalle corrompu`
   (ordre préservé, durée nulle acceptée, borne partielle préservée, inversion droppée). Le 4e
   tombe rouge sur `main` (`{start:4,end:1}` émis verbatim).
2. **GREEN** : garde dans `baseObject` — n'émettre `start`/`end` que comme un intervalle valide
   (`end >= start` quand les deux sont finis) ; une inversion dégrade en « pas de fenêtre », une
   borne unique reste préservée. Docstring citant le jumeau `bounds` et itération 234/236.

## Expected benefits
- Contrat CanvasV3 interne-cohérent : schéma ET convertisseur refusent désormais l'intervalle
  d'objet corrompu, sur les DEUX porteurs du couple `(start, end)` du fichier.
- Fermeture du dernier jumeau identifié du bug `bounds` d'itération 236.
- Norme du codebase (`end >= start`) étendue au chemin de lecture story pour les objets.

## Implementation complexity
- **Faible.** 1 fichier de production (+garde `baseObject`, +docstring), 1 fichier de test
  (+4 tests). Aucun changement de type, aucun changement de comportement pour données valides.

## Validation criteria
- [x] RED : le test d'inversion tombe rouge sur `main` (`{start:4,end:1}` émis verbatim), les 3
      gardes de non-régression passent déjà.
- [x] GREEN : suite `canvasV3|storyEffects*` → **134/134 verts** (11 suites ; 130 + 4 nouveaux).
- [x] Golden `v1-legacy-full.v3.json` inchangé (timing ordonné → sortie identique).
- [x] `tsc --noEmit` gateway → 0 erreur.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)
- **Monotonie inter-keyframes.** `KeyframeSchema.time` dans un tableau `keyframes` n'est toujours
  pas contraint d'être monotone (candidat itération 236, encore ouvert). Contrainte de collection
  qui demande un arbitrage produit (le renderer peut trier plutôt que refuser) — à peser
  séparément.
- **Audit du pattern `num(v, 0)` restant.** Les autres champs du convertisseur (`x`, `y`, `scale`,
  `rotation`, `opacity`, `volume`, `textPosition`) utilisent `num(v, d)` avec un défaut
  SÉMANTIQUEMENT valide (centre, échelle 1, opacité 1…) : aucun ne corrompt son champ comme le
  faisait `bounds`. Audit clos par cette itération — aucun autre site à durcir.
- **Parité clients (web + iOS).** Les renderers CanvasV3 côté client devraient aussi tolérer un
  intervalle corrompu silencieusement — à auditer dès les targets accessibles.
