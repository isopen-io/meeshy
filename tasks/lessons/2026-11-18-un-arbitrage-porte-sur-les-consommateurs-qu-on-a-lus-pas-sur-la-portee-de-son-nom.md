# Un arbitrage porte sur les consommateurs qu'on a LUS, pas sur la portée de son nom

*2026-11-18, cycle 176 bis, #19299. Détail : `tasks/realtime-sync-audit-2026-11-18-cycle176-bis-19299.md`.*

## La forme

Un lot tranche une question — « peut-on abaisser cette borne ? » — et la
réponse se formule naturellement comme une propriété de la VALEUR : *« élargir
est sûr »*, *« ce champ est facultatif »*, *« ce repli est inoffensif »*. Ainsi
formulée, elle voyage. Elle voyage vers la jumelle, vers l'appelant d'à côté,
vers le même nom dans un autre paquet — et personne ne la réinstruit, parce
qu'une propriété d'une valeur n'a pas l'air d'avoir un périmètre.

**Elle en a un, et c'est le jeu de consommateurs dont on a lu ce qu'ils font de
cette valeur.** Hors de ce jeu, la phrase n'est pas « encore vraie » ou « déjà
fausse » : elle n'a pas été posée.

## Ce qui l'a mesuré

#19261 a tranché pour la chaîne de LIVRAISON : *le gel est write-once, donc un
message sous le plancher est un message que le curseur DÉCLARE remis ; élargir
est sûr.* La chaîne de LECTURE a la même structure, les mêmes deux colonnes, les
mêmes trois consommateurs. **La phrase ne s'y applique pas** — le dépôt écrit
l'inverse du confort pour la lecture (`MarkReadBodySchema.caughtUpToMessageId`,
la borne `until` de #16744 : *un message gravé lu à tort l'est pour toujours*).

Réinstruit consommateur par consommateur, le verdict est le même — abaisser le
plancher — **par trois raisons différentes**, et aucune n'est celle de la
livraison :

| consommateur | la raison |
|---|---|
| la fenêtre du GEL | **convergence**, pas tolérance : le compte de non-lus dérive du curseur par `createdAt > lastReadAt`, donc les messages visés étaient DÉJÀ comptés lus. Le gel cesse de contredire l'index |
| le BALAYAGE de contiguïté | **conservatisme** : plus de candidats, et un trou BLOQUE l'avance |
| le site EXACT | la borne y est **inerte** — on la passe quand même, une valeur fausse inexploitée étant un piège armé (cycle 84) |

Et la différence de raison change le lot. Sous « élargir est sûr », il n'y avait
aucun motif de vérifier que la borne HAUTE (`until`) reste en place ; sous
« convergence », c'est `until` qui garantit qu'on ne grave rien au-dessus de ce
que le lecteur déclare. **La même conclusion, atteinte par le mauvais chemin,
aurait laissé partir le lot sans sa seule protection.**

## Le test

Devant un arbitrage qu'on s'apprête à reprendre d'un lot voisin — ou à étendre
d'un consommateur à un autre — ne pas demander *« est-il encore vrai ici ? »*,
qui invite à chercher un contre-exemple et à conclure non en l'absence d'un.
Demander :

> **« Pour qui cette phrase a-t-elle été écrite, et ai-je lu ce que CE
> consommateur-ci fait de la valeur ? »**

Si la réponse est non, la phrase n'est pas un acquis à vérifier : c'est une
question à reposer. Le coût est celui de lire un site ; le coût de l'inverse est
un lot qui a l'air juste et dont la justification ne tient pas la protection
qu'il croit porter.

## Corollaires mesurés dans le même lot

**1. Une garde structurelle garde ce qu'elle peut VOIR.** Un type dont les
champs sont REQUIS fait rougir un site qui PROJETTE trop étroitement
(`TS2345` prouvé). Il est **muet** sur un site qui ramène la ligne entière sans
`select` — la ligne est assignable. Les deux sites ont l'air également gardés
dans un `tsc` vert, et un seul l'est. Question à poser à un cliquet de type :
non pas « est-il rouge sur la mutation que j'ai en tête ? » mais **« quelle
forme de site échappe à sa prise ? »**.

**2. Une règle qui a aussi une forme de TYPE a deux populations de copies.** Un
relevé d'idiome recense des CALCULS (`a ?? b`) et des PROJECTIONS (`select`). Une
copie du TYPE — la même structure réécrite inline dans une signature — ne porte
ni l'un ni l'autre : elle ne calcule rien et ne demande rien, elle DÉCLARE. Elle
est donc absente de tout relevé fait dans la langue du défaut, tout en portant
la même dérive (un champ ajouté au modèle manque à la déclaration inline sans
qu'aucun site ne rougisse). L'inventaire de #19299 nommait six copies de la
valeur ; il y avait une septième, du type, trouvée en consolidant et non en
cherchant. C'est la leçon 261 d'un cran plus haut.

**3. Un nom de fichier de journal a besoin d'autant de discriminants qu'il y a
eu de collisions.** Le cycle 175 bis a appris que suffixer par l'ISSUE ne
désambiguïse que des lots d'issues différentes. Ce cycle-ci porte la DATE, le
« bis » et le numéro — trois — parce qu'un seul discriminant a déjà perdu un
fichier.
