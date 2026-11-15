## Leçon 598 — Une montée de dépendance peut changer l'UNITÉ d'une borne de validation, et un seul témoin sur des centaines rougira

`dev` était rouge sur un typecheck : `ZodLiteral<"all">` non assignable à `SomeType`, parce que dependabot avait monté `zod` dans `packages/shared` seul et que le type traversait la frontière de paquet — deux univers de types. J'ai aligné les quatre workspaces **vers le haut**. Le typecheck est passé au vert, et le vrai défaut s'est ouvert :

```
z.string().max(32) sur '😀'.repeat(20)   (40 unités UTF-16, 20 code points)
  zod 4.4.3 → REFUSÉ          zod 4.6.3 → ACCEPTÉ
```

`4.4.3` comptait des unités UTF-16 (`String.length`) ; `4.5+` compte des **code points**. `.min()` et `.length()` basculent avec `.max()`. Sens de la panne : **fail-OPEN** — une borne emoji passe de 32 unités (~64 octets) à 32 code points (~128 octets) — sur **242** sites : 171 dans `services/gateway/src`, 70 dans `packages/shared`, 1 dans `services/agent`.

1. **Une seule de ces 242 bornes avait une fixture en caractères ASTRAUX**, donc un seul témoin pouvait rougir (`socket-event-schemas.test.ts`, « rejects an oversized forged emoji payload »). Les 241 autres ont changé de sens sans qu'aucun test ne bouge. **Un changement d'unité ne se voit que sur une entrée qui distingue les deux unités** : en ASCII, code points et unités UTF-16 coïncident, donc toute fixture ASCII reste verte par construction.

2. **Le premier symptôme n'est pas le défaut, et aligner VERS LE HAUT est le mauvais réflexe.** La question à poser avant d'aligner une version sur la plus récente n'est pas « quelle version dependabot veut-il ? » mais **« cette version change-t-elle un COMPORTEMENT, ou seulement des types ? »**. Aligner vers le BAS ferme une scission de types tout aussi bien, sans rien changer d'autre — et c'est la seule direction sûre quand on ne peut pas auditer les sites affectés dans le même lot.

3. **Un caret ne tient rien ; seul un épinglage tient.** Ramener les quatre manifestes à `^4.4.3` laissait le lock garder 4.6.3, et n'importe quel `bun install` futur aurait rejoué le fail-open en silence. Un override racine est la garde.

4. **Un contrat écrit dans un commentaire et vérifié par personne se perd à la première montée de dépendance.** Le contrat d'unité était énoncé au bon endroit depuis onze jours (`packages/shared/__tests__/types/reaction.test.ts` : « counts UTF-16 code units (String.length) ») et ses trois témoins l'assertaient en **JS pur** (`longest.length`) : ils ne pouvaient pas voir zod changer d'avis. Un commentaire qui énonce un invariant dont aucun témoin n'exerce le PRODUCTEUR est une documentation, pas une garde.

5. **L'aveu qui compte le plus** : le message de mon premier correctif ne citait comme preuve que des `type-check` et un garde de lockfile — **aucune suite de tests**. Le défaut vivait exactement là. **Un correctif de DÉPENDANCE se prouve par les SUITES, jamais par le typecheck** : le typecheck voit les formes, jamais les comportements. C'est la leçon des « ensembles disjoints » (typecheck et tests ne couvrent pas les mêmes fichiers) appliquée à une autre dimension — ils ne couvrent pas les mêmes QUESTIONS.

Le témoin posé tient désormais le contrat : `z.string().max(EMOJI_MAX_LENGTH)` sur 32 emojis astraux (64 unités pour 32 code points, la seule forme qui distingue les deux comptages), avec sa contre-épreuve en BMP. Contre-épreuve du témoin lui-même, jouée sur les deux copies du store :

```
entrée : 64 unités UTF-16, 32 code points
zod 4.4.3 → max(32) refuse    ✓ le témoin passe
zod 4.6.3 → max(32) ACCEPTE   ✗ le témoin rougit
```

Issues : #6234 (le `dev` rouge), #6235 (la montée délibérée, avec l'unité des 242 bornes à régler — l'override EST la garde jusque-là).
Décision : `packages/shared/decisions.md` § 2026-09-13.
Mémoire : `reference_a_dependency_bump_can_change_the_unit_of_a_validation_bound.md`.
