# Un cliquet qui nomme la mauvaise ligne a tort de façon CRÉDIBLE

*2026-11-19, cycle 181 — #19799.*

## Ce qui s'est passé

Le balayage posé au cycle 180 (`__tests__/helpers/where-equality-null-scan.ts`)
tire toute sa valeur de ce qu'il NOMME : fichier, ligne, colonne, graphie. Son
dépouillement des commentaires remplaçait chaque bloc `/* … */` par la chaîne
vide — **emportant ses retours à la ligne**. Tout ce qui suit remontait d'autant,
et le site `routes/communities/addable-user.ts:19` était annoncé `:8`, onze
lignes de doc-comment plus haut.

## La règle

> Un instrument qui a tort de façon CRÉDIBLE coûte plus cher qu'un instrument
> muet. À `:8` il n'y a rien qui ressemble au défaut annoncé ; la conclusion
> naturelle du lecteur n'est pas « la ligne est fausse » mais **« le cliquet s'est
> trompé de SITE »** — c'est-à-dire la conclusion qui le fait désactiver.

Un cliquet se livre donc avec un témoin sur **le champ le plus actionnable de son
rapport**, pas seulement sur son verdict. Ici : une fixture portant un
doc-comment de plusieurs lignes au-dessus du filtre, et l'assertion que la ligne
rendue est celle du FICHIER.

## Corollaire

**La ligne fausse rend le tri impossible en amont.** Pour trier les quinze
colonnes de #19748, il faut savoir QUEL MODÈLE chaque site interroge, et cela se
lit en remontant depuis la ligne jusqu'au `prisma.<modèle>.`. Avec un décalage de
quelques dizaines de lignes, les trois premières lectures ont désigné des modèles
faux — un schéma de réponse, un `groupBy` de langues — et chacune ressemblait à
une mesure. **Réparer l'instrument était la condition du tri, pas une
coquetterie de fin de lot.**
