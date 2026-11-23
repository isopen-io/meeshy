## La portée d'un GATE n'est pas la portée du DIFF (2026-11-22, #20438, cycle 221)

*Mesuré le 2026-11-22 (#20438, cycle 221), en livrant un lot d'`apps/web` que la
suite de `services/gateway` a fait rougir en CI.*

### Le fait

Le lot ne touchait que `apps/web/src` et `tasks/`. J'ai donc rejoué, deux fois en
entier, la suite d'`apps/web` (35 232 témoins), `tsc --noEmit`, `bun run build` et
`node scripts/measure-weight.mjs` — et **pas une fois** la suite de la passerelle,
« puisque le lot ne touche pas la passerelle ».

La CI est tombée sur
`services/gateway/src/__tests__/journal-one-file-per-entry-guard.test.ts` : le
fichier de leçon livré avec le lot portait un `# ` et quatre `## `, là où le
cliquet (#7711) exige une première ligne `## ` et **un seul** titre de ce niveau
hors bloc de code.

### Pourquoi le raisonnement était faux

Les cliquets de JOURNAL vivent dans `services/gateway/src/__tests__/` et jugent
`tasks/`. Leur portée n'a aucun rapport avec le domaine du paquet qui les
héberge : ils jugent une convention de DÉPÔT, et la routine qui écrit ces lots
écrit `tasks/` à chaque cycle. Le même lot a été jugé par `claude-md-paths-exist`
et `lessons-numbering-single-key`, logés au même endroit.

### La règle

> **« Mon lot ne touche pas ce paquet » ne dit rien de « ce paquet ne juge pas
> mon lot ».** Avant de déclarer les gates rejoués, lister les fichiers ÉCRITS
> — pas les répertoires de code modifiés — et chercher qui les JUGE :
> `grep -rl "<répertoire écrit>" */*/src/__tests__ scripts` rend les cliquets de
> dépôt, qui vivent par convention chez un paquet et par vocation nulle part.

### Famille

C'est la forme du défaut que le lot lui-même corrigeait : la liste du rattrapage
web était écrite pour les familles que le MODULE du socket nomme, pas pour celles
qu'un ÉCRIVAIN socket écrit — une portée héritée du site où la règle est posée,
jamais mesurée sur ce qu'elle gouverne. « Une portée est une affirmation, et c'est
celle que personne ne relit, parce qu'elle ne ressemble pas à un inventaire »
(#20091). Elle vaut de la portée d'un gate comme de celle d'un balayage.
