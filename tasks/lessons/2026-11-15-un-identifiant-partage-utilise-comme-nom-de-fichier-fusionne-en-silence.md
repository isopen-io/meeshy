## Un identifiant d'espace de noms partagé utilisé comme NOM DE FICHIER transforme la collision en FUSION silencieuse (cycle 167, #18632)

Le `CLAUDE.md` racine annonce la classe depuis #5102 : « les collisions d'espace
de noms partagé (numéros de leçon, cliquets mesurés, registres générés) relèvent
d'une règle différente — **un identifiant qui ne s'alloue pas ne collisionne
pas** ». Ce cycle en a mesuré la forme la plus chère, et elle n'est pas celle
qu'on imagine.

**Trois sessions ont écrit le même jour.** L'une a pris « cycle 163 » la veille
(#18573). Une autre a pris « cycle 163 » le même jour **et le même nom de
fichier** — `tasks/realtime-sync-audit-2026-11-15-cycle163.md` (#18649). Un
« 165 » existait déjà.

Ce que la fusion a produit n'est ni un conflit, ni un écrasement : **git a
fusionné LIGNE À LIGNE deux journaux sans aucun rapport.** Un document de 436
lignes où le titre de l'un tombait au milieu de l'autre, suivi d'une section
« Preuves » dont on ne pouvait plus dire de qui elle était. Aucun texte perdu,
et les deux illisibles.

> **Un conflit se voit ; une fusion réussie de deux documents sans rapport ne se
> voit pas.** Git a fait exactement son travail — deux fichiers ajoutés au même
> chemin sur deux branches, des régions disjointes, donc un merge propre et
> silencieux. Le défaut n'est pas dans l'outil, il est dans le fait que le NOM
> portait un identifiant que personne n'alloue.

### Ce qui l'attrape, et ce qui ne l'attrape pas

- **Ne l'attrape pas** : mieux choisir son numéro. J'ai pris 163 en lisant
  `ls tasks/ | grep cycle` au DÉMARRAGE du cycle — la mesure était juste à cet
  instant, et périmée avant mon premier commit. Un relevé d'identifiant libre a
  la durée de vie d'un `fetch`.
- **Ne l'attrape pas** non plus : un cliquet sur l'unicité des noms. Il serait
  vert sur chaque branche prise séparément, puisque la collision n'existe qu'à
  la fusion.
- **L'attrape** : ne pas dériver un nom de fichier d'un compteur partagé. Un nom
  qui porte quelque chose d'unique par construction — la branche, le SHA de
  départ, l'issue livrée — ne peut pas collisionner. `…-2026-11-15-18632.md` ne
  rencontre jamais son jumeau.

### La réparation se fait depuis les SOURCES, jamais à la main

Reconstruire un document fusionné en le découpant au jugé perd la frontière
exacte : ici, la section « Preuves » et le « Suivi ouvert » existaient dans les
DEUX journaux, donc aucune lecture ne pouvait dire à qui attribuer celles qui
restaient. Les deux fichiers se restaurent depuis ce qui fait foi —
`git show origin/dev:<chemin>` pour celui qui a fusionné le premier,
`git show <mon dernier commit>:<chemin>` pour le mien — et la restauration se
VÉRIFIE (`diff -q` contre `dev` : identique octet pour octet).

### Et quand on cède un identifiant, on prend le suivant, pas le trou

« 164 » était libre. Le prendre aurait fait croire que ce cycle précède le 165,
qui était écrit avant lui. Un numéro de cycle est un ORDRE, pas une place de
parking : on prend le premier libre **après le plus haut**.
