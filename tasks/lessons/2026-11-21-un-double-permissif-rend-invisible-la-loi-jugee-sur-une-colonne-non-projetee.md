## Un double permissif rend INVISIBLE toute loi jugée sur une colonne non projetée — et le correctif est l'INSTRUMENT, pas un témoin de plus

**Date** : 2026-11-21. **Lot** : #20136 (cycle 199). **Famille** : « câbler une
loi sans toucher au `select` produit un correctif VERT et INERTE » (2026-11-20,
#20017), vue cette fois depuis le HARNAIS plutôt que depuis la production.

**Le constat.** `participationEstVivante(row)` lit `row.bannedAt == null`. Un
champ **non projeté** vaut `undefined`, et `undefined == null` est **vrai** :
poser la loi sans ajouter `bannedAt` au `select` rend `true` pour un banni. La
garde a l'air posée, elle ne garde rien, et rien ne rougit.

Ce lot l'avait ANTICIPÉ — l'issue nommait le piège dans son critère de fin — et
il a quand même failli passer. Mesuré, mutation à l'appui : avec le double
d'origine, retirer `bannedAt` du `select` de production faisait tomber **zéro**
témoin sur douze.

**Pourquoi aucun témoin ne pouvait le voir.** Un double Prisma rend ce qu'on lui
dit, quel que soit le `select` reçu. La fixture porte `bannedAt`, donc le
prédicat le lit, donc le témoin est vert — que la production ait demandé la
colonne ou non. La projection est la seule des trois moitiés d'une règle (la
CLAUSE, la PROJECTION, le PRÉDICAT) qu'un témoin de comportement ne peut pas
observer, parce que le double la court-circuite.

**La règle.**

> Quand une loi se juge APRÈS lecture, le double qui sert cette lecture doit
> **appliquer le `select`**. Sans quoi la moitié PROJECTION de la règle n'est
> gardée par rien, et une production qui cesse de charger la colonne reste
> verte.

Le correctif n'est pas « ajouter un témoin de projection » — on en ajoute un,
il garde UN site, et le suivant ne l'aura pas. C'est de réparer l'**instrument** :
un double qui projette ne peut plus rendre un champ que la requête n'a pas
demandé, et le no-op redevient visible par les témoins de **comportement**
ordinaires, sans qu'aucun d'eux ait à parler de projection. La classe entière
redevient visible avec lui.

```ts
findFirst: jest.fn(async (args) => {
  const champs = Object.keys(args?.select?.participants?.select ?? {});
  const projeter = (row) => champs.length === 0 ? row
    : Object.fromEntries(champs.filter((c) => c in row).map((c) => [c, row[c]]));
  return { …, participants: fixtures.map((p) => projeter({ isActive: true, ...p })) };
})
```

**C'est la jumelle de `mongo-where.ts`**, et la parenté mérite d'être dite : ce
dépôt a déjà un double qui **évalue le `where`** au lieu de le comparer à une
copie, pour la raison exactement symétrique — « un test qui compare la clause
reçue à celle qu'il attend passe aussi bien avec une clause juste qu'avec une
clause fausse ». La CLAUSE avait son instrument ; la PROJECTION n'en avait pas.
Les deux moitiés d'une lecture ont désormais chacune le sien.

**Corollaire sur les pièges annoncés.** Nommer un piège dans une issue ne
protège pas de lui. Celui-ci était écrit, en gras, dans le critère de fin —
et la seule chose qui l'a attrapé est d'avoir **exécuté** la mutation qui le
reproduit, puis d'avoir pris au sérieux un résultat de mutation qui ne tombait
pas. Un ROUGE qui refuse de tomber est une mesure, pas une bonne nouvelle : il
dit que le témoin ne regarde pas ce qu'on croit.
