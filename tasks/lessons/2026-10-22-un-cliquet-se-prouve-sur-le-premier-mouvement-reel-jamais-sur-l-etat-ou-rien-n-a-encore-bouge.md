## Un cliquet se prouve sur le PREMIER MOUVEMENT RÉEL, jamais sur l'état où rien n'a encore bougé

**Contexte** (2026-10-22, vérification du lot #10278, commit d2c9dd691) : le cliquet des versions des packs de cadres de gloire — un générateur, une CLI en CI, un témoin vitest, un refus au démarrage de la passerelle, une décision consignée — était vert sur le dépôt tel qu'il est : 9 packs en v1, aucune clé `glory-frame/<slug>@<n>` dans `retained.json`, `dev` et `main` au même registre. La vérification a trouvé cinq défauts, et quatre d'entre eux n'existent que le jour où quelque chose bouge pour la première fois :

1. Le témoin « ROUGE prouvé » exigeait l'égalité STRICTE avec `[below-baseline:<slug>, …]`. Au premier bump légitime (un pack en v2, `@1` retenu), abaisser de 1 produit AUSSI `reuses-retained` : le témoin rougit sur un dépôt correct.
2. La base de la CI était `origin/dev` en dur, pour un workflow qui se déclenche aussi sur `main`. Au premier bump stagé non promu, toute PR de correctif vers `main` tombe en `below-baseline`.
3. La passerelle rejetait toute version égale à une version quittée ; le cliquet admettait l'égalité pour les mêmes fichiers. Deux lois pour un cas qui n'était encore jamais survenu — et le registre que la CI laissait passer disparaissait en silence de la boutique.
4. La décision affirmait « après la fusion de deux branches qui ont chacune produit un v2, régénérer rend v3 ». Faux : chacune a quitté v1, aucune n'a retenu @2, la régénération rend v2. Personne n'avait joué le scénario que la décision décrivait.

**Pourquoi c'était invisible** : chaque gate avait été écrit et exécuté sur l'état INITIAL — celui où toutes les branches de la loi se confondent. Au rang 1 (leçon 261), l'égalité stricte et l'inclusion rendent le même verdict ; sans clé retenue, « égal pour les mêmes fichiers » et « égal » rendent le même verdict ; avec `dev == main`, « la base est dev » et « la base est la cible » rendent le même verdict. Un cliquet est fait pour tenir pendant un MOUVEMENT ; le prouver à l'arrêt ne prouve rien.

**Règles** :

1. Un témoin de cliquet se joue sur un dépôt FICTIF où le mouvement a déjà eu lieu une fois (un pack monté, sa version quittée retenue, une base différente de la branche) — pas seulement sur le dépôt tel qu'il est. L'état initial est un cas de plus, jamais le seul.
2. Une assertion sur une liste de violations dit ce qui DOIT y être (`toContainEqual`, ou un prédicat nommé), jamais ce que la liste EST : une égalité stricte interdit toute violation future légitime et bloque le premier vrai mouvement.
3. La preuve de rouge est UNE fonction, partagée par la CLI et le témoin (`lowerVersionProofHolds`) : si la CI exige « chaque pack tombe, nommé », la CLI l'exige aussi — sinon la décision décrit une preuve que personne n'applique.
4. Une référence de workflow (`origin/dev`) se lit avec les déclencheurs du workflow : si `on:` cite plusieurs branches, la base est la branche CIBLE (`github.base_ref || github.ref_name`), et un témoin garde cette forme.
5. Deux sites qui appliquent « la même loi » (CI et démarrage) se testent sur le même cas limite (égal pour les mêmes fichiers) et doivent rendre le même verdict : une loi écrite deux fois diverge d'abord sur le cas que personne n'a joué.
6. Une affirmation de décision du type « dans le scénario X, l'outil rend Y » se reproduit par une sonde avant d'être consignée ; sinon elle s'écrit au conditionnel, avec le scénario à jouer.
7. Un `it.skipIf(<ressource absente>)` n'est pas un témoin : dans le job où la ressource manque, il est vert sans avoir rien dit. Soit la ressource est garantie, soit le témoin n'existe pas et un commentaire nomme qui porte la preuve.

**Comment l'appliquer** : avant de fermer un lot qui pose un cliquet, un plancher ou une garde de monotonie, écrire le scénario « le premier mouvement a eu lieu » (bump, promotion partielle, restauration) comme fixture, et vérifier que CHAQUE site de la loi — CI, témoin, démarrage, décision — rend le verdict attendu dessus.
