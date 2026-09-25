## Leçon 350 — Un observateur qui se branche sur une chaîne de prototypes doit prendre son point d'appui HORS de la chaîne

**Contexte (#4318 → #4489 → #4492, 2026-08-30).** Le collecteur du manifeste de routes devait savoir
si un contexte Fastify encapsulé porte une garde d'authentification. Ces gardes sont posées par
`fastify.addHook('preHandler', authMiddleware)` et ne sont recopiées sur aucune route : invisibles à
toute inspection de `routeOptions`. J'ai donc enveloppé `addHook` sur chaque contexte, via le hook
`onRegister` :

```ts
const original = instance.addHook.bind(instance);          // ← le défaut
(instance as any).addHook = function (name, fn) { … ; return original(name, fn); };
```

**Une instance encapsulée Fastify hérite PROTOTYPALEMENT de son parent.** Pour un enfant,
`instance.addHook` ne résout donc pas vers l'implémentation de Fastify : il résout vers l'enveloppe
que je venais de poser sur le PARENT — dont la fermeture tient le registre du parent **et** son propre
`original`, lié au parent. `bind` fixe `this` ; il ne change pas la fermeture qu'on appelle. Le hook
finissait enregistré sur un **ancêtre**.

**L'observateur MODIFIAIT le graphe qu'il prétendait décrire.** La garde de `me/preferences`
atterrissait sur le contexte parent et s'appliquait à ses modules FRÈRES : `GET
/me/delete-account/{confirm,cancel,delete-now}` rendaient 401 dans le serveur assemblé, et 302 partout
ailleurs. Correctif : capturer l'implémentation PRISTINE une fois sur la racine, et l'appeler en
`.call(instance, …)`.

### Ce qui rend la leçon coûteuse : j'avais la contradiction sous les yeux

Deux mesures, toutes deux justes :

| mesure | verdict |
|---|---|
| commenter la ligne `addHook` de `me/preferences` fait passer la route de 401 à 302 | vrai — compatible avec les DEUX explications |
| une reproduction MINIMALE de la même imbrication Fastify ne fuit pas | vrai — **incompatible** avec « c'est un défaut du produit » |

J'ai écrit la contradiction dans l'issue (« le mécanisme est propre à ce code, pas à Fastify ») et j'en
ai tiré la mauvaise moitié : j'ai conclu que le code avait un défaut exotique, au lieu de voir que la
reproduction propre ne différait du cas réel que par **l'absence de mon instrument**. J'ai ouvert une
issue de bug (#4492) et retiré de `PUBLIC_ROUTES` trois entrées qui disaient vrai depuis toujours.

> **Une mesure faite À TRAVERS un observateur ne vaut que ce que vaut l'observateur.** Quand un
> comportement n'apparaît que sous instrumentation et qu'une reproduction propre le contredit, le
> premier suspect est l'instrument — pas le code observé. La reproduction minimale ne servait pas à
> confirmer Fastify : elle isolait la seule variable qui restait, et cette variable était moi.

**Le témoin qui l'aurait attrapé** : comparer le comportement servi AVEC et SANS instrumentation
(`buildAssembledApp` face à un montage nu du même module). Une instrumentation qui ne change rien doit
pouvoir le PROUVER, comme un balayage doit prouver qu'il balaie.

**Corollaire de forme.** Ce piège vaut pour tout `Object.create`-based host : Fastify, les prototypes
Express, `vm` contexts, les proxys de test. `X.method.bind(X)` capture ce que la chaîne rend
AUJOURD'HUI, y compris une enveloppe posée par soi-même une itération plus tôt — c'est un
auto-empilement silencieux, et il grandit avec la profondeur d'encapsulation.
