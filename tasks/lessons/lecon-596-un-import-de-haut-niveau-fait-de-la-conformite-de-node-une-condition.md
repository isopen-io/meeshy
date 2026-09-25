## Leçon 596 — Un import de HAUT NIVEAU fait de la conformité de `node` une condition de CHARGEMENT de la suite, pas d'exécution de la garde

`#6201` ajoute `import { Agent, fetch } from 'undici'` au sommet de
`services/gateway/src/services/zmq-agent/agent-illustration.ts`. Sous jest, la suite
entière a cessé de charger :

```
TypeError: webidl.util.markAsUncloneable is not a function
  at new CacheStorage (undici/lib/web/cache/cachestorage.js:20)
  at agent-illustration.ts:4
→ « Test suite failed to run » : les ~20 témoins SSRF ne s'exécutent PLUS
```

J'ai lu ce rouge comme une régression de la fusion. Il ne l'était pas. Trois lignes
tranchent, et elles se lisent **avant** de toucher au code :

```
undici@8.10.0     engines: { node: ">=22.19.0" }
services/gateway  engines: { node: ">=22.19.0" }   ← déjà déclaré AVANT ce lot
.github/ci.yml    NODE_VERSION: '22.19'            ← conforme
ma machine        v22.9.0                          ← hors spec
```

`markAsUncloneable` (`node:worker_threads`) n'apparaît qu'à node **22.12**. Rejoué
sous `~/.nvm/versions/node/v22.13.1/bin/node` : **45 témoins verts**.

1. **Le rouge mesurait la machine.** Même famille que « un rouge des deux côtés du
   diff mesure aussi la machine », avec un détour de plus : ici le `engines` juste
   était **déjà là, antérieur au lot**, et c'est l'environnement qui avait dérivé
   sans qu'aucun outil ne le dise. La parade est une commande, pas une intuition :
   `node -e "console.log(require('<paquet>/package.json').engines)"` croisé avec
   `node --version` et le `NODE_VERSION` du workflow.
2. **Le symptôme ne nomme RIEN du sujet.** Ni SSRF, ni DNS, ni le lot : une erreur
   de `webidl` dans un fichier de cache HTTP. Un import de haut niveau transforme
   la conformité de node en condition de *chargement*, donc vingt témoins de
   sécurité disparaissent d'un coup pour une raison qui n'a aucun rapport avec eux.
   Un import dynamique dans la fonction déplacerait la panne de « la suite ne
   charge pas » vers « cette garde-là échoue » — c'est une dette nommée, pas
   corrigée dans ce lot.
3. **La bonne version dort souvent déjà sur la machine.** `ls ~/.nvm/versions/node`
   avant de conclure « je ne peux pas vérifier localement, la CI dira » :
   `PATH=~/.nvm/versions/node/<v>/bin:$PATH npx jest …` a suffi à prouver le lot.

Corollaire de **contre-épreuve sans égression**. Pour prouver qu'un témoin
DISCRIMINE le correctif, le témoin livré visait un vrai site tiers. Rejoué sur un
hôte en `.invalid` (TLD réservé RFC 2606, jamais résolu) : avec l'épinglage la
résolution ne quitte jamais le `lookup` injecté, donc l'hôte est sans importance ;
sans lui, le transport résout un nom inexistant et échoue **sans ouvrir de
connexion**. Mesuré `calls=2` (vert) contre `calls=1` (rouge). Et l'assertion
discriminante n'était pas `expect(result).toBeNull()` — une connexion qui échoue
rend `null` aussi — mais le **compte de résolutions**.

Issues : #6201 (l'épinglage), #6160 (le cliquet fusionné dans le même lot).
Mémoire : `reference_a_top_level_import_makes_node_conformance_a_loading_condition.md`.
