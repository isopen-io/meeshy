## Une porte FRANCHIE peut mener à la mauvaise pièce (cycle 171, #18616)

*2026-11-15, cycle 171, #18616.*

### Le fait

Le dépôt garde la file de remise hors ligne par un cliquet d'ENFILAGE
(`delivery-queue-door-sweep`) : aucun transport n'a le droit d'écrire lui-même
dans la file, tout passe par les deux portes partagées. Il est vert depuis le
cycle 116 et son inventaire est vide.

Pendant ce temps, `MeeshySocketIOHandler.startMediaPipelines` construisait une
**seconde instance** de `RedisDeliveryQueue` et la remettait aux quatre
déclencheurs de `message:attachment-updated`. Cette seconde file passe par
l'unité partagée. Elle respecte le contrat `(eventType, payload)`. Elle suit la
clé `userId ?? id`. **Elle est irréprochable à tous les cliquets du dépôt, et
c'est une autre file.**

### Pourquoi c'est une famille, et pas un oubli

Le dépôt a déjà écrit deux formes de cette question :

| forme | ce qui est faux | cliquet qui l'attrape |
|---|---|---|
| une porte RELÂCHÉE | la signature a été réécrite | le cliquet de TYPE |
| une porte CONTOURNÉE | le site n'importe pas la porte | le BALAYAGE |
| **une porte FRANCHIE vers la mauvaise pièce** | **le site fait tout bien, sur une autre instance** | **aucun** |

Les deux premières demandent « qui appelle quoi ». La troisième demande
**« à quel OBJET parle ce site ? »** — et rien, dans « qui appelle quoi », ne
porte cette question. Un balayage d'appels mesure des SITES ; l'unicité est une
propriété des INSTANCES.

### Ce qui l'a tenue invisible

**Le substrat partagé.** La tranche Redis est commune à toutes les instances,
donc le cas nominal marche, et chaque témoin de comportement du pipeline média
était vert à juste titre. Ce qui diverge est la tranche MÉMOIRE — le repli d'une
panne Redis, c'est-à-dire le chemin que personne n'exerce et que personne ne
regarde.

> **Quand deux instances partagent leur substrat NOMINAL, leur divergence ne se
> voit que sur le chemin de PANNE.** C'est le pire endroit où mettre une
> divergence : il n'est exercé qu'au moment où tout le reste va déjà mal.

### Et les deux doc-comments disaient faux

`server.ts:273` et `delivery-queue-registry.ts` AFFIRMENT tous les deux l'unicité
— « la seule dont la tranche MÉMOIRE porte des entrées de message », « la seule
où les entrées de message sont effectivement enfilées ». Ils sont à l'endroit
exact où l'on irait vérifier.

C'est la leçon du cycle 94 (« un commentaire qui ÉNONCE une contrainte est une
AFFIRMATION, et se vérifie comme telle ») avec son coût maximal : non seulement
l'affirmation était fausse, mais **elle était la raison pour laquelle personne
n'allait chercher.** Une phrase posée au point de vérification remplace la
vérification.

### La règle

> Devant un doc-comment qui affirme qu'une chose est UNIQUE, poser deux
> questions : **(1) qu'est-ce qui le MESURE ?** et **(2) la propriété porte-t-elle
> sur des APPELS ou sur des INSTANCES ?** Un cliquet d'appels ne mesure jamais
> une unicité d'instance, et un inventaire de sites d'appel vert se lit pourtant
> comme une preuve.

Corollaire de réparation, repris des cycles 105 et 108 : quand le cliquet
d'unicité tombe, la réparation est de **RÉSOUDRE** la dépendance par son
registre, jamais d'ajouter une ligne à l'inventaire — il n'y a pas de seconde
file légitime dans un processus.

### Corollaire : la résolution est un ACCESSEUR, pas une capture

Un registre résolu UNE FOIS au câblage a l'air équivalent et ne l'est pas. En
production l'enregistrement précède le câblage, donc une capture unique passe
tous les témoins écrits depuis l'état nominal — et un `undefined` capturé fige
le consommateur hors de la dépendance pour toute la vie du processus, en
silence.

**Le témoin qui tient ce point enregistre la dépendance APRÈS le câblage.** Il
ne décrit aucun ordre de production ; il décrit ce dont le consommateur n'a pas
le droit de dépendre.

### Corollaire : une projection de capacité déclare la signature RÉELLE

`QueuedEntryEnqueuer.enqueue` porte `{ sealAtRest }`, le troisième paramètre qui
décide du scellement au repos. Mesuré : une projection à deux paramètres reste
**assignable** à un type à trois (bivariance), et `tsc --noEmit` rend `EXIT=0`
sous la forme narrow.

> Une capacité déclarée plus étroite que la méthode qu'elle projette est la
> forme « interface » du `select` trop étroit : **la projection est la seule des
> conditions qu'aucun témoin de comportement ne peut voir**, parce que l'objet
> de production fait la bonne chose quoi qu'en dise son type.
