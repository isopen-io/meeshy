# Deux sessions sur un même incident produisent deux COUCHES, pas deux copies — ne pas céder, composer

**2026-11-08** — #16852, rencontré pendant le cycle 145 de l'audit temps réel.

## Ce qui s'est passé

La CI du SDK iOS était par terre sur TOUT le dépôt, `dev` compris. Deux sessions
l'ont attaquée en parallèle.

- **La mienne** : `sdk-tests.yml` n'appelait pas `scripts/ci/resolve-spm-packages.sh`
  (le remède de #6545, qui purge une collision du cache d'artefacts), parce que
  le script prenait un `-project` et que ce workflow résout un PAQUET. Je l'ai
  généralisé, câblé, et étendu son garde aux deux workflows.
- **La sœur** (`9d8eda430e`) : sur une réponse non-200, l'URLSession de SwiftPM
  **déplace le corps d'erreur à l'emplacement du cache**. « already exists in
  file system » est donc un **refus de téléchargement déguisé** — purger ne
  peut rien, l'entrée purgée réapparaît au même essai. Remède : un
  préchargement AUTHENTIFIÉ.

**Leur diagnostic était la cause ; le mien le symptôme.** Et je le sais parce
que je l'ai mesuré : mon `workflow_dispatch` est passé l'étape de résolution —
mon lot la fait enfin *tenter*, là où elle échouait instantanément — **et a
quand même échoué**.

## Le réflexe à ne pas avoir

Devant un correctif de session sœur qui va plus loin que le sien, le réflexe est
de céder (« ils l'ont fait, je retire »). **Il aurait laissé la CI du SDK rouge
AVEC le bon correctif dans le dépôt** : leur remède vit dans un script que
`sdk-tests.yml` n'appelait toujours pas, et dont le garde ne vérifiait l'appel
que pour `ios.yml`. Mesuré, pas supposé : `grep -c resolve-spm-packages
.github/workflows/sdk-tests.yml` rendait **0** sur `dev` après leur fusion.

## La règle

Deux sessions sur un même incident ne produisent presque jamais deux fois le
même correctif : elles produisent **deux couches**, et il faut demander de
chacune *ce qu'elle ne couvre pas*.

- la leur corrigeait la CAUSE, et n'atteignait pas le workflow en panne ;
- la mienne corrigeait le SYMPTÔME, et était le seul chemin par lequel la leur
  atteignait ce workflow.

Le corollaire de méthode est la **règle d'asymétrie lue dans le bon sens**
(#5243) : elle tranche qui cède sur un FICHIER disputé, pas qui a raison sur un
DIAGNOSTIC. Sur un diagnostic, on compose — en fusionnant à la main, en gardant
les deux côtés, et en vérifiant **ligne à ligne** que les deux mécanismes
survivent (ici : `prefetch_artifact` ET le déréférencement sûr de
`PROJECT_ARGS`, plus un garde qui passe de 4/4 à **5/5** scénarios).

## Le geste

Quand `dev` apporte un correctif au défaut qu'on traite :
1. lire leur commit **en entier**, y compris son récit — c'est là que le
   diagnostic vit ;
2. demander **ce que leur correctif n'atteint pas**, par une commande et non par
   intuition (`grep -c` sur le site qu'on croit couvert) ;
3. fusionner à la main, garder les deux, et **le dire** dans le message de
   fusion — sinon la couche la plus faible passe pour la seule.
