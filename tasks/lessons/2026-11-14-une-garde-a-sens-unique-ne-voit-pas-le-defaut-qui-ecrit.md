# Une garde à sens unique ne voit pas le défaut qui ÉCRIT

*2026-11-14, cycle 157. Issues : #18158 (la garde), #18157 (la panne), #18159
(ce qui reste). Garde jumelle : #18070. Classe nommée par : #18124.*

## La règle

Quand une garde compare deux déclarations — un miroir client et un contrat
serveur — **elle choisit un sens, et le sens qu'elle ne regarde pas porte sa
propre famille de défauts.** Les deux ne se ressemblent pas, et le second est le
plus coûteux.

| | le miroir EXIGE trop | le miroir DÉCLARE trop |
|---|---|---|
| à l'exécution | la désérialisation lève | le champ prend son DÉFAUT |
| effet | la trame ENTIÈRE tombe | la trame arrive **avec un trou dedans** |
| ce qui s'écrit | **rien** | `null` / `0` / `false`, **par-dessus la donnée juste** |

Le premier sens PERD un événement. Invisible, mais rien n'est écrit : l'écran
garde ce qu'il avait. Le second le laisse ARRIVER, et le trou a l'air d'une
donnée — donc il est RECOPIÉ, et il écrase.

> **Le défaut qui écrase est pire que le défaut qui perd**, et c'est le sens
> qu'on garde en second parce que c'est celui auquel on ne pense pas : on écrit
> d'abord la garde qui empêche de lever.

## Ce qui l'a mesuré

La passerelle sert `likeCount` ; trois miroirs Kotlin lisaient `likesCount`.
`ignoreUnknownKeys` laissait passer la trame, le champ prenait son défaut `0`,
et **six consommateurs** l'écrivaient comme le total ABSOLU de j'aime — leurs
propres doc-comments le disent. Un post à 42 j'aime affichait **0** au premier
`post:liked` reçu en direct, sur les quatre écrans sociaux d'Android.

L'intention du contrat (`types/post.ts`) était de servir l'absolu plutôt qu'un
`±1`, pour que l'événement soit idempotent sous double livraison et rattrapable
après un manqué. Elle était entièrement perdue à l'arrivée, et remplacée par
son pire cas.

## Le corollaire de MÉTHODE, qui est la vraie leçon

#18124 avait trouvé UN cas de ce sens, par audit adversarial, et l'issue disait
elle-même ce qui manquait : « personne n'a balayé le dépôt pour cette classe ».

**Le balayage en a rendu quinze**, dont deux pannes vivantes que personne ne
cherchait.

> La différence entre « un cas connu » et « quinze » n'est pas une différence de
> soin. C'est la différence entre une relecture et un outil — et c'est la leçon
> du cycle 155 (« une règle en prose ne couvre que ce que son outil exprime »)
> appliquée à une règle qu'on venait justement d'écrire en prose.

Quand une issue dit « personne n'a balayé », c'est une **spécification
d'outil**, pas une réserve de prudence.

## Deux pièges en écrivant la garde

**1. Le critère doit exclure ce qui a un AUTRE producteur.** Une classe partagée
avec le REST (`ApiMessage`) porte légitimement des champs que le fil ne sert
pas : l'API les remplit. Les compter aurait noyé la garde sous treize faux
positifs — et un outil qui crie à tort finit désarmé. La frontière est le
FICHIER qui déclare la classe (`*SocketEvent*.kt` ⇒ le fil est l'unique
producteur), pas le nom de la classe.

**2. Un inventaire de divergences restantes se tient par DEUX assertions, et
c'est la seconde qui compte.**

- « aucune divergence hors table » est celle qu'on écrit spontanément ;
- **« aucune entrée de la table qui ne diverge plus »** est celle qui empêche la
  table de devenir le cimetière où l'on range ce qu'on ne veut plus voir. Elle
  force une divergence réparée à SORTIR de l'inventaire.

Sans la seconde, un inventaire est un baseline — c'est-à-dire une garde verte
sur un défaut vivant, qui arme le piège au lieu de le désamorcer.

## Et le corollaire de LIVRAISON

Entre deux correctifs justes, **celui qui ne demande rien aux consommateurs est
celui qui peut être prouvé**. `@SerialName("likeCount")` ne change pas le nom de
propriété Kotlin : les six consommateurs restent tels quels, et seul
`:core:model` — qui se compile sur une JVM nue depuis Maven Central — avait
besoin d'être vérifié. Renommer la propriété aurait touché `feature/feed`,
`feature/reels` et `feature/chat`, donc l'AGP, donc `dl.google.com`, que le
proxy refuse : même valeur produit, lot invérifiable.

## Et un empêchement se mesure, même quand il ne dispense de rien

`gradle` a rendu trois fois « Not enough memory to run compilation ». La machine
avait 13 Go libres : le compilateur Kotlin lit `kotlin.daemon.jvmargs` comme une
propriété **Gradle** (`-P`), pas comme une propriété **système** (`-D`).

Le cycle 156 a appris qu'un blocage qui DISPENSE de livrer se vérifie comme un
défaut. Celui-ci ajoute l'autre moitié : **un blocage qui ne dispense de rien se
vérifie aussi.** Trois échecs d'affilée portant le mot « memory » ressemblent à
une machine trop petite ; c'était un nom d'option.
