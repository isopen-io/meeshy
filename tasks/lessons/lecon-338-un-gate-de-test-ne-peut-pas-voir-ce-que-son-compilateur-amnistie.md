## Leçon 338 — un gate de TEST ne peut pas voir ce que son compilateur AMNISTIE

Le lot #4359 a livré cinq routes canoniques sous `/me/categories`. Son agent a joué ses témoins
ciblés (25/25) puis sept suites de non-régression (55/55) : **tout vert**. Le gate complet du gateway
l'était aussi — **1028 suites, 21627 témoins, zéro échec**.

`npx tsc --noEmit` rendait **EXIT=2**, sur quatre `TS2345` dans le fichier neuf.

Les quatre montages canoniques omettaient les **génériques de route** que leur alias déclare
(`fastify.post<{ Body: CategoryBody }>(…)`). Sans eux, Fastify infère `RouteGenericInterface`, et le
gestionnaire typé n'est plus assignable au paramètre attendu. Le code sort **avant même** de tourner.

### Pourquoi aucun témoin ne pouvait le voir

`jest.config.json` du gateway porte `diagnostics.ignoreCodes: [2307, 2322, 2339, 2345, 2740]`.
**`TS2345` est dans la liste.** `ts-jest` compile donc le fichier fautif, avale l'erreur, et exécute
un code que `tsc` refuse. Un témoin — ciblé, complet, ou les deux — est **structurellement incapable**
de rougir sur cette classe.

Et l'étape « Type-check » de la CI est **BLOQUANTE** pour `gateway` depuis le cycle 105 bis. Le lot
serait donc parti vert en local et rouge en CI, sur une erreur qu'aucun test n'aurait localisée.

> **Un gate ne garde que ce que son outil REGARDE.** `services/gateway/CLAUDE.md` le dit déjà, à
> propos des couples `(événement, charge)` : *« noter les codes IGNORÉS par ts-jest : 2322 et 2345
> sont exactement ceux qu'un couple dépareillé produit — un témoin ne peut donc pas servir de cliquet
> pour ces deux-là »*. La règle était écrite. Elle vaut au-delà des événements : **elle vaut pour
> toute assignabilité**, et donc pour tout montage Fastify typé.

### La règle de manœuvre

**`npx tsc --noEmit` se joue SÉPARÉMENT de `jest`, et son code de sortie se lit.** Les deux ne sont
pas redondants : ils regardent des choses disjointes, et l'un amnistie précisément ce que l'autre
bloque. Un lot qui ajoute un **montage de route** ou touche une **signature partagée** est
exactement le cas où l'écart s'ouvre.

Corollaire de brief : un sous-agent à qui l'on interdit le gate complet (à raison — un run parasite
rend les mesures inattribuables) **ne peut pas découvrir cette classe**. C'est donc à l'intégrateur
de la chercher, et de ne jamais lire « mes témoins sont verts » comme « ça compile ».

### Deux corollaires de forme, tirés du correctif

- **Le générique se recopie de l'ALIAS, jamais réinventé.** Le module d'origine déclarait déjà les
  six formes exactes ; le canonique en omettait quatre.
- **Un type nommé par un générique doit être EXPORTÉ, pas redéclaré.** `CategoryBody` et
  `CategoryIdParams` étaient `interface` privées du module d'origine. Les redéclarer côté canonique
  aurait créé la jumelle divergente que tout le lot cherchait à éviter — elles sont désormais
  exportées et importées.

---
