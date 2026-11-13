## Une mutation doit changer la GARDE, jamais le nom que l'outil cherche — et on ne restaure pas par `git checkout`

**2026-11-08, cycle 147 (lot H), #17026.** Deux erreurs de méthode sur le même
outil, commises dans le même après-midi par deux agents indépendants, dans des
directions opposées. Elles coûtent chacune une mesure fausse, et une mesure
fausse d'un cliquet est pire qu'une mesure absente : on en conclut quelque chose.

### 1. Muter le NOM, c'est mesurer l'outil au lieu du code

Pour vérifier qu'un balayage voit un site, on annule la GARDE de ce site. Si on
annule autre chose, on mesure autre chose.

L'auditeur, vérifiant que le cliquet voyait le cinquième site, a renommé
`emitEditedToReaders` en `emitEditedToReaders0`. Le balayage cherche ce nom dans
son inventaire `EMIT_HELPERS` : renommé, il n'y figure plus, donc l'émission
redevient invisible — et le verdict rendu fut **« RATÉ »** alors que le cliquet
voyait parfaitement ce site. La mutation avait retiré l'œil, pas la garde.

> **Une mutation de preuve se lit comme un résultat de mesure : avant de croire
> son rouge (ou son vert), vérifier qu'elle a changé la PROPRIÉTÉ visée et
> rien d'autre.** Sur un outil qui s'appuie sur des noms, tout renommage est
> une mutation de l'instrument.

Symétrique de la mienne, le même jour, au tour précédent : j'avais écrit
`await (async () => {…})()(this.prisma, …)`, qui appelle une *Promise* et lève
donc un `TypeError` synchrone inconditionnel. Cinq témoins sont tombés, et
**aucune de ces chutes ne prouvait quoi que ce soit.**

Les deux erreurs ont la même forme : *la mutation a cassé plus que ce qu'elle
visait, et le rouge obtenu ressemblait au rouge attendu.*

### 2. `git checkout <fichier>` restaure depuis HEAD, pas depuis l'avant-mutation

J'ai muté un fichier portant du travail **non commité** pour prouver qu'un
témoin tombe, puis restauré par `git checkout <fichier>`. Il est revenu à HEAD :
**cinq corrections non commitées, effacées en silence** — et le témoin dépendait
d'une signature que le fichier restauré ne portait plus, donc l'arbre était
incohérent sans qu'aucune commande n'échoue.

Je l'avais fait juste : dans les cinq mutations précédentes du même lot, j'avais
copié le fichier dans le scratchpad AVANT de muter, et restauré depuis la copie.
J'ai sauté l'étape une fois.

> **Avant toute mutation, copier la cible hors du dépôt, et restaurer depuis
> cette copie.** `git checkout` n'est une restauration correcte que si le
> fichier est propre — c'est-à-dire précisément la situation qui ne se présente
> jamais au milieu d'un lot. La parade coûte une commande ; la panne coûte un
> travail invisible, parce que l'arbre compile *presque*.

Famille proche, déjà dans ce tracker : `git checkout -- .` TRONQUE un fichier
« intent-to-add » (#16813). Même racine — `git checkout` est un outil de
restauration vers une RÉFÉRENCE, et la référence n'est jamais ce qu'on avait
une seconde plus tôt.

### Corollaire sur ce que vaut une boucle de mutations

Elle vaut beaucoup : c'est elle, et elle seule, qui a mesuré que mon cliquet
voyait 3 sites sur 7 là où son inventaire vide et deux mutations réussies me
donnaient l'impression du contraire. Mais elle ne vaut que si chaque mutation
est INSTRUITE — ce qu'elle casse, et ce qu'elle ne casse pas. Une boucle de dix
mutations non relues rend dix verdicts dont on ne sait pas lesquels mesurent la
portée et lesquels mesurent une faute de frappe.

Détail : `tasks/realtime-sync-audit-2026-11-08-cycle147.md` § « Sixième tour ».
