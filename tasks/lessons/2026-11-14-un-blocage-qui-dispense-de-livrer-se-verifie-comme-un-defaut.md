# Un blocage qui dispense de livrer se vérifie avec le même soin qu'un défaut qu'on rapporte

*2026-11-14, cycle 156. Défaut de raisonnement du cycle 155, trouvé en le reprenant.*

## Ce qui s'est passé

Le cycle 155 a mesuré un défaut sévère (#18069 — aucune traduction temps réel
n'atteignait Android), l'a parfaitement documenté, et a REFUSÉ de le livrer. Sa
raison, écrite en toutes lettres dans son journal :

> **`android.yml` n'a ni `workflow_dispatch` ni déclencheur `pull_request`** : il
> ne tourne que sur `push` vers `main` et `dev`. Un lot Android n'est donc
> prouvable qu'une fois FUSIONNÉ.

Le fichier porte **les deux** : `pull_request: branches: [main, dev]` avec
`apps/android/**` dans ses chemins, et `workflow_dispatch`. Un `grep
workflow_dispatch .github/workflows/android.yml` le disait en une seconde.

Le vrai blocage existait, mais ailleurs, et il n'a pas la même forme : la
variable de dépôt `CI_DEV_SEUL` (#18048, directive du porteur de la veille) ne
laisse tourner les jobs que sur `dev`, `main` et `ci/promotion-*`. Le défaut
était donc effectivement non prouvable sur une branche de lot — pour une raison
**temporaire, nommée, avec un critère de levée**, et non pour une propriété
permanente du workflow.

## Pourquoi l'écart compte, alors que la conclusion tenait

Les deux causes n'ouvrent pas les mêmes suites, et c'est tout l'enjeu :

| si la cause est… | la suite est… |
|---|---|
| « le workflow n'a pas de déclencheur » | attendre une session qui a le SDK Android — c'est-à-dire **jamais**, depuis un conteneur |
| « une variable de gel, levée par un critère » | écrire le lot, l'ouvrir en PR, et **le faire prouver à la levée** |

Le cycle 155 a classé un empêchement conjoncturel en fatalité structurelle. Le
coût n'est pas le défaut — il était consigné — c'est le lot qui n'a pas été
ÉCRIT pendant qu'il avait son contexte, et qu'il a fallu reconstruire.

## La règle

**Une raison de ne pas livrer est une affirmation sur le dépôt, exactement comme
un défaut. Elle se MESURE avant d'être écrite.** Le dépôt tient déjà la moitié
symétrique de cette règle — « on n'annonce pas une panne qu'on n'a pas mesurée »
(cycle 103) — et elle ne s'applique pas qu'aux pannes : *ce qui m'empêche de
livrer* est le constat le moins relu de tous, parce qu'il conclut un travail au
lieu d'en ouvrir un, et que personne n'a envie de le contredire.

Le test est mécanique, et tient en une ligne : **si la raison cite un fichier,
ouvrir le fichier.** Si elle cite une configuration, la lire. Si elle cite un
refus réseau, le provoquer.

## Ce que ce cycle a fait de son propre empêchement

Il l'a provoqué plutôt que déduit : `./apps/android/meeshy.sh jvm-check` échoue
sur `build-artifacts.signal.org` (403 par le proxy), et le `workflow_dispatch`
lancé sur la branche de lot est revenu `skipped`. Les deux sont des MESURES,
datées, reproductibles — et la seconde a du même coup montré que le dispatch
d'une branche de lot est précisément ce que #18048 existe pour empêcher, ce
qu'une lecture du `if` seule n'aurait pas dit.

## Et je l'ai rejouée dans le cycle qui l'écrit

`./apps/android/meeshy.sh jvm-check` échoue sur `build-artifacts.signal.org`
(403 par le proxy). J'en ai conclu, et ANNONCÉ au porteur, que « ce conteneur ne
compile pas Kotlin ».

Faux. `gradle -p apps/android/scripts/jvm-check test -PjvmCheckModelOnly` ne tire
que Maven Central : **`:core:model` compile et passe ses 18 539 témoins ici**,
en deux minutes et demie. C'est l'audit adversarial qui l'a trouvé, en essayant
au lieu de déduire.

L'empêchement était RÉEL (une commande a bien échoué) et sa PORTÉE était
inventée : j'ai conclu d'une invocation à une capacité. Exactement la forme du
cycle 155, qui concluait d'une lecture à une propriété du workflow.

> **Un échec prouve que CETTE commande échoue, jamais que la capacité manque.**
> Avant d'écrire « on ne peut pas X ici », chercher la deuxième façon de faire X
> — surtout quand la première tire une dépendance que X n'exige peut-être pas.

Le reliquat, lui, est mesuré et tient : `:sdk-core` et `:feature:chat` exigent
l'AGP, donc la CI. Dire « le modèle se prouve ici, ses consommateurs non » coûte
une phrase de plus et n'est pas faux.
