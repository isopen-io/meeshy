## Un cliquet qui nomme la mauvaise ligne a tort de façon CRÉDIBLE (cycle 181, #19799)

Le balayage posé au cycle 180
(`services/gateway/src/__tests__/helpers/where-equality-null-scan.ts`) tire toute
sa valeur de ce qu'il NOMME : fichier, ligne, colonne, graphie. Son dépouillement
des commentaires remplaçait chaque bloc `/* … */` par la chaîne vide —
**emportant ses retours à la ligne**. Tout ce qui suit remontait d'autant, et le
site `routes/communities/addable-user.ts:19` était annoncé `:8`, onze lignes de
doc-comment plus haut.

> **Un instrument qui a tort de façon CRÉDIBLE coûte plus cher qu'un instrument
> muet.** À `:8` il n'y a rien qui ressemble au défaut annoncé ; la conclusion
> naturelle du lecteur n'est pas « la ligne est fausse » mais **« le cliquet s'est
> trompé de SITE »** — c'est-à-dire la conclusion qui le fait désactiver. Un
> cliquet se livre donc avec un témoin sur **le champ le plus actionnable de son
> rapport**, pas seulement sur son verdict : ici une fixture portant un
> doc-comment de plusieurs lignes au-dessus du filtre, et l'assertion que la ligne
> rendue est celle du FICHIER.

Deux corollaires :

- **La ligne fausse rend le tri impossible EN AMONT.** Pour trier les quinze
  colonnes de #19748 il faut savoir quel MODÈLE chaque site interroge, et cela se
  lit en remontant depuis la ligne jusqu'au `prisma.<modèle>.`. Avec un décalage
  de quelques dizaines de lignes, mes trois premières lectures de `deletedAt` ont
  désigné des modèles faux — un schéma de réponse, un `groupBy` de langues — et
  chacune ressemblait à une mesure. Réparer l'instrument était la condition du
  tri, pas une coquetterie de fin de lot.

- **Un tri à la main manque ce qu'un balayage voit, y compris quand c'est soi qui
  a compté.** Ma première passe avait QUATRE sites `deactivatedAt` ; le cliquet,
  posé après le correctif, a nommé le CINQUIÈME — et c'était le plus grave des
  cinq, le site unique des deux routes d'ajout en communauté. La leçon 261 à
  l'envers : « zéro trouvé » n'est pas « zéro existe ». Un balayage posé APRÈS le
  correctif vaut mieux que pas de balayage, parce qu'il mesure ce que le correctif
  a oublié.
