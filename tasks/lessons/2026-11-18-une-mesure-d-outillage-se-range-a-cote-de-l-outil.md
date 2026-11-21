## Une mesure d'outillage se range À CÔTÉ de l'outil, jamais dans le récit de la session qui l'a payée (cycle 178, #19662)

La boucle TDD locale de `:core:model` (Android) tombait en
`java.lang.OutOfMemoryError: Java heap space` au `compileKotlin`, sur une machine
à 14 Go libres. Deux faits non devinables règlent le cas :

1. le conseil imprimé par Gradle désigne un `gradle.properties`, et
   `kotlin.daemon.jvmargs` **n'est pas lu comme une propriété système** :
   `-Dkotlin.daemon.jvmargs=…` est ignoré en silence, seul `-P…` passe ;
2. `-PjvmCheckModelOnly` retire `:core:crypto` et `:core:e2ee`, donc la
   dépendance `org.signal:libsignal-client` que le proxy des conteneurs refuse
   (403 sur `build-artifacts.signal.org`, même famille que `dl.google.com`).

Les cycles **157** et **158** avaient déjà payé exactement ces deux diagnostics,
et les avaient écrits — dans leur journal daté. Le cycle 178 les a repayés, une
dizaine de minutes chacun, parce qu'il ne savait pas qu'il devait les chercher.

> **Un journal daté ne se lit que par celui qui sait déjà quoi y chercher.** Une
> mesure d'outillage — un drapeau, un tas, une dépendance refusée — ne se range
> donc pas dans le récit de la session qui l'a payée, mais **à côté de l'outil
> qu'elle répare**, là où le prochain la rencontrera sans la chercher. Le témoin
> qui attrape la rechute n'est pas un test : c'est le fait que l'outil
> fonctionne sans qu'on ait rien à savoir.

`apps/android/scripts/jvm-check/gradle.properties` porte désormais le tas, avec
sa raison et la mention que `-D…` ne marche pas. Plus personne n'a à retrouver
le drapeau.

### Le critère, et ce qu'il ne dit pas

Ranger une mesure « à côté de l'outil » veut dire : dans un fichier que l'outil
LIT, ou dans un doc-comment que son échec DÉSIGNE. Un `README` du dossier ne
suffit pas — rien n'oblige à l'ouvrir. Ici, le message d'erreur de Gradle nomme
littéralement `gradle.properties` : c'est le seul endroit où la réponse arrive
en même temps que la question.

La leçon ne dit PAS qu'un journal est inutile : il porte le RAISONNEMENT, qui
ne tient pas dans un fichier de propriétés. Elle dit que la part
**actionnable** d'une mesure doit en sortir. Le journal du cycle 157 était juste
et complet ; il était seulement rangé là où on ne tombe pas dessus.

### C'est la dimension 12 appliquée à nous-mêmes

« La complexité se paie dans le CODE, jamais chez l'utilisateur » (§ Roadmap,
dimension 12). Une session EST un utilisateur de ses outils, et un outil qui
exige deux drapeaux non devinables lui fait payer la complexité. Même famille
que la leçon du cycle 177 sur `--check` : **un outil qui ne dit pas ce qu'il
sait laisse chaque passant le redécouvrir** — là en mesurant la taille d'une
dette, ici en retrouvant un drapeau.

### Corollaire de forme, du même lot

Le relevé que j'ai cité dans le corps de la PR portait un SHA abrégé écrit de
mémoire (`d8a7…`) au lieu d'être relevé : il n'existait pas. Le vrai est
`c0e17d40c`. C'est la leçon du cycle 177 (« un relevé destiné à être CITÉ se
prend en entier, jamais par sa queue ») déplacée de la troncature à
l'**invention** : un identifiant ne se paraphrase pas. Corrigé par un
commentaire de la PR qui donne les quatre SHA, plutôt qu'en réécrivant le corps
en silence.
