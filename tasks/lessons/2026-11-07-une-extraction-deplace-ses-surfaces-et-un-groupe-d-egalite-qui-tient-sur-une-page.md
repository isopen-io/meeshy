## 2026-11-07 — Une extraction DÉPLACE ses surfaces, et un groupe d'égalité qui tient sur une page ne prouve rien

Deux erreurs du cycle 139 (#16684, curseur keyset du fil), dans l'ordre où elles
sont tombées. Toutes deux ont la même forme : **j'ai cru mesurer, et je mesurais
un cas qui ne pouvait pas me contredire.**

### 1. Mon premier témoin PASSAIT sur la route fautive

Le défaut : la page suivante filtre `createdAt < T` et saute les messages du
groupe d'égalité restés sur le carreau. Mon corpus était trois messages, dont
DEUX dans la même milliseconde, avec une page de 2.

Il passait. Les deux membres de la fratrie tenaient **sur la même page** : la
frontière tombait APRÈS le groupe, donc le `<` strict n'excluait personne
d'intéressant. **Un groupe d'égalité qui tient entier sur une page est servi
correctement même par la fenêtre fausse.**

Il faut quatre messages et une page de 2 pour que la frontière tombe *dans* le
groupe. C'est la règle connue du dépôt — « un témoin de RANG s'écrit sur un rang
AUTRE que le premier » — sous un autre habit : ici, **le témoin doit s'écrire
sur une frontière qui COUPE la classe d'équivalence**, pas sur une frontière qui
la borde.

> La question à poser à un témoin de pagination n'est pas « contient-il le cas
> pathologique ? » mais **« la FRONTIÈRE tombe-t-elle à l'intérieur de ce cas ? »**.
> Un cas pathologique entièrement contenu dans une page est un cas nominal.

Et ce qui l'a attrapé n'est pas une relecture : c'est d'avoir lancé le témoin
AVANT d'écrire le correctif et d'avoir lu « 2 passed » là où j'attendais 0. **Le
ROUGE se prouve, il ne se suppose pas** — et un témoin qui passe au moment où il
devrait tomber est une information, pas un contretemps.

### 2. Extraire une unité déplace ses surfaces, et un inventaire par FICHIER ne distingue pas un déplacement d'un ajout

Le handler franchissait le seuil de 1 000 lignes ; j'ai extrait la résolution de
la fenêtre `around` dans le module de la loi. Deux cliquets d'inventaire ont
rougi — `personal-history-hiding-surface-guard` et
`orphaned-sender-repair-surface-guard` — qui dénombrent, **fichier par fichier**,
les lectures de `Message` et ce que chacune applique.

Ils ont fait exactement leur travail : une surface de lecture qui apparaît sans
être déclarée est une règle qu'on n'a pas décidé d'appliquer. Mais je ne les
avais pas anticipés, parce que je raisonnais « je ne change aucun comportement,
je déplace du code ».

> **Un refactor qui ne change aucun comportement change quand même ce qu'un
> cliquet d'inventaire VOIT.** Avant d'extraire une unité qui lit une table
> gardée, demander : *quel inventaire nomme le fichier d'où je sors ce code ?*
> La réponse se trouve par `grep` du nom du fichier dans `__tests__`, et elle
> coûte une commande.

### 2 bis — et le corollaire qui m'a surpris : recevoir une loi en PARAMÈTRE la rend invisible au cliquet

J'avais d'abord injecté `applyPersonalHistoryHiding` et `applyHistoryFloor` dans
l'unité extraite, par réflexe de testabilité. Les deux balayages lisent le
**TEXTE** du fichier : sous injection, l'unité appliquait bien les deux lois et
aucun cliquet ne pouvait le voir. Le compte déclaré aurait été juste, et la
garde morte.

> **Une surface gardée qu'un cliquet ne peut pas voir n'est pas gardée.** Quand
> une règle est tenue par un balayage textuel, son site doit l'IMPORTER, pas la
> recevoir. L'injection déplace la décision chez l'appelant — c'est-à-dire chez
> quelqu'un que l'inventaire n'interroge pas.

### 3. Et j'ai écrit un compte rendu avant d'avoir le compte

J'ai annoncé « 39 488 verts, seuls rouges des codecs d'image » alors que la
suite complète tournait encore : les deux cliquets ci-dessus n'étaient pas
encore tombés. La CI les a nommés avant moi.

> **Un compte est une AFFIRMATION** (le dépôt le dit déjà des tris et des
> inventaires) : il se compte, il ne s'anticipe pas, et surtout pas depuis une
> exécution ANTÉRIEURE au dernier changement. Ne pas publier de chiffre de gate
> tant que le gate n'a pas rendu sa dernière ligne.

### Ce qui a bien marché, et vaut d'être rejoué

Avant d'écrire ma propre fenêtre keyset, j'ai vu passer
`src/__tests__/unit/utils/keyset-cursor.test.ts` dans une liste de suites et je
suis allé l'ouvrir. **La loi existait** (`utils/keyset-cursor.ts`), son
doc-comment énonçait mot pour mot l'invariant que je venais de rediagnostiquer,
et le fil était la seule liste à ne pas l'appeler. Écrire la mienne aurait été
la jumelle que `cursor-pagination-single-law-guard.test.ts` existe pour
empêcher.

> Le signal n'était pas une intuition : c'était **un nom de fichier dans la
> sortie d'un `--listTests`**. Quand on s'apprête à écrire une règle, lire les
> noms des suites voisines coûte zéro et répond à « quelqu'un l'a-t-il déjà
> écrite ? ».
