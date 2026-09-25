## Leçon 600 — Un `jest.mock` de module qui ne rend qu'UNE PARTIE de ses exports laisse les autres à `undefined` : un piège LATENT qui se déclenche quand une route adopte l'export voisin

En portant `withMutationOutcome` à la route `POST /posts/:postId/like` (#6293), un
témoin sans rapport a rougi : `routes/posts/__tests__/error-format.test.ts`
attendait **404** pour un post inconnu et lisait **500**. Sa cause était dans son
propre double :

```js
jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn().mockImplementation(({ op }) => op()),
}));
```

L'usine remplace le module ENTIER. `withMutationOutcome` et la classe
`MutationResultGone` y valaient donc `undefined` — appeler le premier levait un
`TypeError` que le `catch` de la route déguisait en 500, et aucun message ne
parlait d'idempotence.

1. **Le piège est LATENT, et il se compte.** Balayé : **42** fichiers du gateway
   mockent ce module sans étaler le réel ; **un seul** rougissait, parce qu'un
   seul exerce la route que je venais de changer. Les 41 autres attendent la
   prochaine route qui adoptera un export voisin. Un double trop étroit ne casse
   rien le jour où on l'écrit — il casse le jour où quelqu'un d'autre grandit le
   module.
2. **Le remède tient en une ligne, et il était déjà écrit** :
   `...jest.requireActual('<module>')` avant l'override. `interactions.harness.ts`
   le fait ET l'explique (« une usine qui ne rendait que `withMutationLog` les
   laissait à `undefined` — `instanceof undefined` lève un TypeError qui se
   déguise en 500 sur des chemins d'erreur sans rapport »). La connaissance
   existait à côté du piège, sans le désarmer.
3. **Corollaire, mesuré dans le même lot : une file `mockResolvedValueOnce` non
   consommée est un ÉTAT PARTAGÉ entre témoins.** Deux témoins pilotaient le
   helper mocké pour atteindre son chemin `onDuplicate` ; ma route ne l'appelant
   plus, leurs `Once` restaient en file et FUYAIENT dans les `describe` suivants,
   décalant d'un cran les doubles de onze témoins `DELETE` — onze rouges dont
   aucun ne parlait de `like`. **Un témoin qui pilote un mock plutôt que son
   sujet coûte deux fois : il ne mesure rien, et il déplace ce que les autres
   mesurent.**

**Complément du même jour, et c'est une faute que j'ai commise en corrigeant la
première.** Le remède — étaler le module réel — s'écrit avec un CAST :

```js
...(jest.requireActual('<module>') as object),   // et non `...jest.requireActual(...)`
```

`jest.requireActual` rend `unknown`, et TypeScript refuse d'étaler `unknown`
(**TS2698**). Écrite sans cast, ma correction a rendu la suite **incapable de se
CHARGER** — signature à reconnaître, déjà connue de ce dépôt : `Tests: 24138
passed, 24138 total` avec `Test Suites: 1 failed`. **Zéro test en échec et une
suite en échec = une suite qui n'a pas compilé**, donc une garde muette, pas une
assertion fausse.

Et la convention existait : balayé, le gateway porte ~145 étalements de
`requireActual` et **tous** portent un cast (`as object`, `as Record<string,
unknown>`) ou la forme générique `requireActual<Record<string, unknown>>(...)`.
`interactions.harness.ts` l'évite autrement — il prend le module en PARAMÈTRE
typé `object`, et son doc-comment dit pourquoi. J'ai cité ce doc-comment dans mon
message de commit sans copier sa forme.

> **Citer une convention n'est pas l'appliquer.** Quand un fichier voisin explique
> pourquoi il fait quelque chose d'une certaine façon, la relecture utile n'est
> pas « il a raison » mais « ma ligne a-t-elle la même forme que la sienne ? ».

Et le même jour : mon balayage local était passé au VERT sur cette forme avant que
`jest` ne monte de 30.4.2 à 30.5.1 dans une intégration de dépendances. Un
typage qui se resserre transforme une ligne légale en erreur de compilation, sans
que la ligne ait bougé — corollaire direct de la leçon 598.

Et la leçon de fond sur ces deux témoins : ils affirmaient le chemin de rejeu en
le SIMULANT. Leur intention est reprise dans
`__tests__/unit/routes/posts/likeIdempotency.test.ts`, qui ne mocke PAS le helper
— le rejeu y est réel, levé par un faux `MutationLogService` en mémoire. C'est la
même doctrine que `repostIdempotency.test.ts` énonce depuis son en-tête : « un
`jest.mock(...)` ici rendrait toute la suite verte que la route enveloppe ou non ».

Issue : #6293. Le balayage des 41 doubles restants a son issue propre.
