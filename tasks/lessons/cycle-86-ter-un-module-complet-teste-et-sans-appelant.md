## Cycle 86-ter — Un module complet, testé, et sans appelant

Quatrième forme de la famille ouverte au 77-bis, et la première qu'aucune
lecture du code source ne peut trouver.

| cycle | forme | comment on la voit |
|---|---|---|
| 77-bis | un état avec un lecteur et **aucun écrivain** | `grep` « qui écrit ça ? » |
| 78 | un producteur alimenté et **aucun lecteur** | `grep` « qui s'y abonne ? » |
| 79 | un lecteur qui s'exécute, **dont l'écriture ne porte sur rien** | aucun `grep` |
| **86** | un module entier, complet, testé, **sans appelant** | `require.resolve` |

`routes/communities.ts` (2047 lignes) et `routes/communities/` (1920 lignes)
répondent au MÊME spécificateur d'import. En CommonJS le fichier gagne. Le
dossier n'a jamais servi une requête — et trois cycles de correctifs y ont
atterri, chacun avec ses témoins verts.

> **Un refactor de scission n'est pas terminé quand le dossier est complet ; il
> est terminé quand l'ancien chemin ne porte plus d'implémentation.** Entre les
> deux il n'y a pas un doublon — il y a un module mort qui accepte les
> correctifs et les témoins comme s'il vivait. Les trois autres scissions du
> même lot (`attachments`, `users`, `voice`) se terminent toutes par
> `export { X } from './X/index'` ; celle-ci ne l'avait pas eu, et c'est toute
> la différence.

Le cycle 85 demandait « cette entité a-t-elle une JUMELLE ? ». La réponse ici
est plus dure que la question :

> **Une jumelle peut porter le MÊME NOM, et la résolution de module décide
> seule laquelle vit.** Conversation / communauté se voit : deux fichiers qu'on
> ouvre côte à côte. `X.ts` / `X/` ne se voit pas : import identique, les deux
> compilent, les deux ont des témoins verts, et rien dans le source ne dit
> lequel répond.

Et le geste manquant, qui est la vraie sortie du cycle :

> **Un témoin qui atteste un comportement s'importe par le chemin de la
> PRODUCTION** — spécificateur copié depuis le point d'enregistrement, jamais
> composé à la main. Six des huit suites communauté visaient explicitement le
> module mort. Une septième visait le bon module mais mockait les schémas
> partagés en `{ additionalProperties: true }`, désarmant fast-json-stringify —
> exactement la couche où vivaient deux des cinq défauts. Aucune ne demandait
> « quelles routes la passerelle expose-t-elle ? », et un `404` sur une route
> qu'iOS appelle depuis toujours n'était vu par personne.

Corollaire de manœuvre, coûteux à oublier :

> **Basculer vers la jumelle exige de porter d'abord ce que l'exemplaire VIVANT
> avait de plus.** Le dossier ignorait `flattenCommunityCounts` et quatre
> routes ; y basculer sans les porter aurait servi `memberCount: 0` partout et
> retiré `join` / `leave` / `invite` / `mine`. Les témoins qui PASSENT déjà
> avant la bascule sont ceux-là — on les écrit dans le même lot que ceux qui
> échouent, et ils valent autant.
