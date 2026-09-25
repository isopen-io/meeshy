## Leçon 433 — Ce qui s'ÉNUMÈRE se périme, ce qui se DÉRIVE tient

**Deux cas, deux sessions, la même forme, le même jour.** Un convertisseur v1↔v3
qui RECOMPOSE une charge clé par clé a perdu `styleId` en silence — troisième
perte en deux jours sur le même fichier (session voisine, #4832/#4833). Une
rangée d'outils qui ÉNUMÈRE ses entrées a été mesurée à six, une septième est
entrée par un slot d'accessoire, et personne n'a remesuré : la timeline ne
rendait plus **aucun pixel** à taille nominale sur un iPhone 16 Pro (#4379).

> Partout où du code recopie une liste — clés d'une charge, entrées d'une
> rangée, champs d'un `select`, sites d'une règle — **la liste est une dette**,
> et le témoin doit interroger la SOURCE, jamais la copie. Un témoin par clé ne
> parle que des clés auxquelles on a déjà pensé.

Le correctif de la rangée ne resserre pas un écart : il DÉRIVE le compte de ce
qui est rendu (`composerOrder.count + (leadingAccessory == nil ? 0 : 1)`). Une
huitième entrée resserrera la rangée d'elle-même.

**Ce que les deux cas ajoutent l'un à l'autre : le REPLI cachait la perte.**
Chez le voisin, le repli d'un `styleId` absent est `location.pill` — le seul
gabarit qui survivait à l'aller-retour était celui qui SERT de repli. Chez moi,
la rangée était un `ScrollView` : le geste existait, la loi 4 restait tenue, et
**un défilement n'a pas d'état d'échec**. Ce qui manquait était le SIGNAL, pas
le contrôle.

> **Plus le repli est soigné, moins la perte se voit.** Il rend « ce n'est pas
> arrivé » indiscernable de « il n'y avait rien » (leçon 431, autre face).

**Et le piège de l'origine.** Le `ScrollView` de la rangée avait été posé pour
un cas ACCESSIBLE — « à `accessibility-XXXL` six outils dépassent ». Le
raisonnement était juste, daté, et cité de bonne foi pendant deux mois. Un
dispositif posé pour un cas extrême finit par masquer une entrée dans le cas
ORDINAIRE, et son commentaire d'origine continue de le justifier.
