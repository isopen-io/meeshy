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

### Corollaire mesuré : le cliquet qu'on écrit est lui-même une affirmation

Le balayage livré avec ce lot déclarait, dans son doc-comment, geler `server.ts`
comme **seul** site de construction de production. L'audit adversarial a fait
tourner la VRAIE fonction sur six contre-exemples — alias d'import, liaison
locale, parenthèses autour du constructeur, `Reflect.construct`, sous-classe,
fichier `.mts` — et elle n'en a vu **aucun**.

C'est la règle du cycle 105 (« chercher une forme fautive par son NOM de
déclaration, c'est manquer tous les sites qui l'obtiennent autrement »)
retournée contre l'instrument écrit pour l'appliquer.

> **Un cliquet neuf n'hérite d'aucune présomption.** Son vert est une mesure de
> l'instrument avant d'être une mesure du dépôt, et la seule façon de savoir
> lequel des deux on lit est de lui montrer la famille, pas l'exemplaire qu'on
> avait en tête. La question à poser au balayage qu'on vient d'écrire est
> **« par quelles autres formes cette chose peut-elle arriver ? »**, et elle se
> répond en les écrivant toutes en fixtures.

Deux des six portent leur propre leçon : la **sous-classe** est la forme
réaliste (une file consciente du scellement, instrumentée pour les métriques,
est un refactor ordinaire) et elle porte bien une seconde tranche mémoire ; et
l'**alias** se ferme sans être suivi — interdire le renommage de l'identifiant
clôt la famille à la ligne, là où la résoudre ferait du cliquet un
demi-résolveur de modules.

### Corollaire plus coûteux : j'ai écrit l'affirmation fausse DANS le lot qui ferme cette classe

Le registre citait depuis sa création un `delivery-queue-registry-capabilities.test.ts`
qui n'a jamais existé — sa seule occurrence dans le dépôt était le doc-comment
qui le citait. Ce lot a ajouté **deux doc-comments à ce fichier** sans la voir.

Puis, en écrivant le témoin manquant pour rendre la phrase vraie, son préambule
a crédité `ts-jest` de tenir `TS2344` : exact de sa liste d'amnistie, et sans
objet depuis #10203, qui lui a retiré le typecheck. Mesuré : sous la mutation,
`npx jest` est **vert**, et c'est le gate A (`tsc -p tsconfig.test.json`) qui
rougit.

> **Une affirmation fausse ne se reconnaît pas à ce qu'elle a l'air faux** —
> elle se reconnaît à ce qu'elle nomme une chose VÉRIFIABLE que personne n'a
> vérifiée. Les deux ci-dessus nomment un FICHIER et un OUTIL : deux commandes,
> jamais lancées. Écrire un lot sur cette classe de défaut n'immunise pas contre
> elle ; le relevé mécanique, si.

### Corollaire : un invariant se garde au CONSOMMATEUR, pas au littéral

« La dépendance est résolue par ACCESSEUR, donc relue à chaque usage » est vrai
du littéral et ne dit rien de qui le lit. Mesuré : ajouter
`const { deliveryQueue } = deps;` en tête du vrai consommateur laisse
`tsc --noEmit` à `EXIT=0` et 197 suites au vert.

> Un accesseur ne garantit une relecture que si quelqu'un relit. La question
> n'est pas « le site résout-il à l'usage ? » mais **« le CONSOMMATEUR
> redemande-t-il ? »** — et elle se répond en faisant tourner le consommateur,
> jamais son double. Un témoin qui capture les dépendances depuis un
> consommateur MOQUÉ prouve la forme de l'objet, pas l'usage qu'on en fait.

### Corollaire le plus net : prouver le ROUGE ne suffit pas, il faut prouver le VERT du MÊME témoin

Le témoin écrit pour tenir le troisième paramètre interrogeait
`Extends<Parameters<…>['length'], 3>`. Pour une fonction à paramètre OPTIONNEL,
`Parameters<…>['length']` vaut `2 | 3` et jamais `3` : l'assertion se résolvait
en `boolean`, donc elle était **ROUGE DANS LES DEUX ÉTATS**.

Elle avait l'air d'une garde parce que la mutation la faisait passer de
`boolean` à `false` — deux `TS2344` à la même ligne, indiscernables pour qui ne
lit que « ça tombe ». Le cliquet de dette de types l'a signalée, pas moi : son
plafond est passé de 76 à 77 **sans aucune mutation**.

> **Une assertion cassée tombe sous toutes les mutations, y compris celles
> qu'elle ne garde pas.** La discipline du dépôt — *toujours prouver le ROUGE* —
> a une seconde moitié qu'on oublie parce qu'elle a l'air acquise : le même
> témoin doit être VERT sans la mutation, et ça se vérifie en le regardant, pas
> en supposant que la suite l'aurait dit. Ici la suite ne pouvait rien dire :
> `ts-jest` ne typecheque plus, donc seul un gate que personne ne lance à chaque
> édition portait l'information.

Le sens juste était l'interrogation inverse — **3 est-il une arité POSSIBLE ?**
(`3 extends 2 | 3` ⇒ vrai ; `3 extends 2` ⇒ faux.)
