## Leçon 342 — Un garde qui itère la structure DÉRIVÉE est aveugle à ce qui manque à la structure dérivée

Cycle : revue croisée du lot L-0.5 de la v3 web, issue #4397 (« Le lockfile s'aligne sur les
manifestes »).

Le garde livré avec le lot parcourait `bun.lock → workspaces` — les entrées que le lock connaît
**déjà** — puis lisait le `package.json` de chacune. Jamais l'inverse. Un manifeste de workspace que
le lock n'a **jamais vu** n'était donc contrôlé par personne : le sens *manifeste → lock*, celui que
le titre de l'issue nomme, n'était testé nulle part. Ce n'était pas théorique — `apps/web-v3` était
exactement dans cet état (absent de `HEAD:bun.lock`, intégralement non suivi), et le garde certifiait
« aligné » pendant tout ce temps. Sonde du relecteur : un `packages/zz-probe/package.json` créé sans
relancer `bun install` → **16 tests verts, zéro rouge**.

> **La DIRECTION dans laquelle un garde itère EST la direction de l'invariant qu'il garde.** Itérer
> `A` pour aller chercher son pendant dans `B` prouve « tout A a son B », jamais « tout B a son A ».
> Devant un garde de correspondance, nommer les deux ensembles à voix haute et exiger une boucle par
> sens. Le sens manquant est presque toujours celui où la structure dérivée (lock, index, cache,
> manifeste généré) fait autorité sur la structure source — c'est-à-dire le sens faux.

**Corollaire d'entrée, trouvé dans le même garde.** Son ensemble de manifestes venait d'un parcours
récursif du disque depuis la racine. Il ramassait donc `tests/package.json` — que la racine ne
déclare dans **aucun** glob `workspaces` (`apps/*`, `services/*`, `packages/*`), dont `bun.lock` n'a
aucune entrée, et qui n'a même pas de `node_modules` — et `packages/shared/prisma/client/package.json`,
un manifeste **généré et gitignoré**. Deux dégâts d'un coup : l'entrée du garde variait selon qu'un
`prisma generate` avait tourné (9 manifestes ici, 8 sur un clone propre), et il a fait naître un
invariant INVENTÉ — « un paquet suivi n'est jamais déclaré sur un plancher différent d'un manifeste à
l'autre » — au nom duquel un bump de `@playwright/test` a été écrit dans `tests/package.json`, où
**rien n'est installé** : un changement inerte, présenté dans le rapport comme constitutif du
résultat.

> **L'entrée d'un garde se calcule depuis la déclaration qui fait AUTORITÉ, jamais par un parcours du
> disque.** Un `find` trouve des fichiers ; il ne sait pas lesquels appartiennent au graphe que
> l'outil gouverne. Un garde dont l'entrée déborde ce graphe ne devient pas « plus strict » : il
> devient faux, et il fabrique du travail sur des fichiers que personne n'installe.

**Et un garde d'infrastructure hébergé par une app ne tourne dans aucune CI.** Celui-ci vivait dans
`apps/web-v3/__tests__/`, sortait de son workspace (`join(__dirname,'..','..','..')`) et n'était
appelé par aucun workflow (`grep web-v3 .github/workflows/ci.yml` = rien) : l'invariant n'existait
que le jour où quelqu'un lançait les tests de la v3. C'est la règle de placement (B) de la conception
— un composant vit sous la surface qui le rend — appliquée à un garde : sa surface était la RACINE du
dépôt. Le précédent était déjà là, `scripts/check-type-debt.sh`, appelé par le job `quality`.

**Le lock lui-même n'était pas un artefact de sa tâche.** Sur 138 lignes de diff de `bun.lock`, 29
citent les quatre paquets suivis ; le seul bloc `"apps/web-v3": {...}` en fait 32, et sa présence
faisait basculer des résolutions hoistées **sans rapport** (`@emnapi/core` 1.11.1→1.10.0,
`@next/eslint-plugin-next` 16.3.1→15.5.23, `eslint-plugin-react-hooks` 7.1.1→5.2.0 au premier
niveau). Le rapport n'en disait rien. Le correctif durable n'est pas une phrase dans un rapport : les
**deux** sens du garde rendent la divergence impossible en silence — un `bun.lock` commité sans
l'arbre qu'il décrit rougit, et réciproquement.

**Dernière forme, sur le refus motivé.** Le lot avait REFUSÉ de monter les épingles `overrides` de
`dompurify`/`postcss`/`uuid` — « ça change ce qui est installé pour tous les consommateurs
transitifs, c'est une décision de dépendances avec ses propres gates » — tout en montant, dans le même
bloc et le même commit, celles de `react`/`react-dom`. L'argument était juste ; il ne s'appliquait
simplement pas qu'aux trois.

> **Un refus motivé se vérifie sur la CLASSE d'acte, pas sur le paquet.** Écrire son refus, puis
> relire son propre diff en se demandant : *ai-je fait ailleurs exactement ce que je viens de
> refuser ?* Si oui, l'un des deux est mal classé — et c'est presque toujours celui qu'on n'a pas
> pris pour une décision. Ici la montée de React était bien la bonne direction (l'issue dit que le
> LOCK s'aligne, et `apps/web-v3` épingle `19.2.8` exact), mais elle valait une décision assumée et
> son gate : la suite complète de `apps/web` rejouée sur les paquets réellement installés — 818
> suites / 14 975 tests verts —, pas un « aucune dépendance du gateway, du translator ni de shared
> n'a changé » qui omet le seul workspace dont le runtime a changé.

**Addendum (revue croisée suivante, même lot L-0.5) — le garde mal placé avait un FRÈRE, et le
corriger n'a pas corrigé l'autre.** `apps/web-v3/__tests__/makefile-workspaces.test.ts` gardait le
`Makefile` de la RACINE depuis le même dossier, avec le même `join(__dirname,'..','..','..')` et la
même absence de CI. La tâche sœur a livré son garde AVEC son appel dans `ci.yml` (« Lockfile
alignment guard ») pendant que celle-ci laissait le sien inerte — dans le MÊME arbre de travail, à
quelques heures d'écart. La règle était donc écrite noir sur blanc, en commentaire, dans le fichier
que l'autre tâche venait de modifier ; elle n'a pas traversé.

> **Corriger un garde mal placé, c'est chercher ses FRÈRES dans le même lot.** Un défaut de placement
> naît d'une habitude de session (« mes tests vont dans `__tests__` »), pas d'un accident : elle a
> produit tout ce que la session a écrit ce jour-là. La requête qui les trouve ne cherche pas le
> sujet du garde mais sa FORME — un test qui remonte au-dessus de son propre paquet :
> `grep -rn "'\.\.', *'\.\.'" apps/*/__tests__/`.

**Et « 7/7 rouges avant » n'est pas une preuve.** Le rapport affirmait avoir vu le garde rougir ;
rien dans le dépôt ne le rejouait. Les quatre `scripts/check-*` appelés par le job `quality` portent
tous un `--self-test`, celui-ci n'en avait aucun. Le garde porté en
`scripts/check-makefile-workspaces.mjs` soumet six mutations en mémoire (`structuredClone` du monde
lu, sans écrire sur le disque) et exige que chacune produise l'échec attendu — la CI vérifie donc à
chaque passage que le garde SAIT rougir, avant de lui demander s'il est vert.

> **Une affirmation de session meurt avec la session.** « Je l'ai vu rouge » et « le dépôt prouve
> qu'il rougit » sont deux niveaux de preuve différents ; seul le second survit au commit. Le témoin
> définitif se cherchait ici dans l'historique : le garde rejoué sur `HEAD` (avant le nettoyage)
> rend **19 défauts réels**, 0 après — un chiffre qu'un tiers peut refaire en une commande.

---
