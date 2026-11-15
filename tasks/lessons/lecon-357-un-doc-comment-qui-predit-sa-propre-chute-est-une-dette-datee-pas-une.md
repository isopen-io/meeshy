## Leçon 357 — Un doc-comment qui prédit sa propre chute est une dette datée, pas une documentation

**Le fait.** `test_offered_unlockedItem_keepsEveryAction` affirme qu'un objet déverrouillé
obtient TOUTES les actions de son menu. Son doc-comment, écrit au #4046, disait :

> « `canLeaveScene` est le sixième cas, et son défaut FERME. **Sans ce paramètre, ce témoin
> n'affirmerait plus "toutes" mais "toutes sauf une", en le disant avec le même mot.** »

Le #4082 a ajouté `hasTrimmableSource` — septième cas, même famille, défaut FERMÉ. Le
témoin est tombé au premier run complet qui a suivi. **La prédiction était exacte, publiée,
lue par ses relecteurs — et elle n'a pas empêché la chute**, parce qu'un doc-comment ne
s'exécute pas.

> **Un témoin qui affirme « toutes » se remet en question à chaque ajout d'une capacité**,
> sans quoi il finit par affirmer « toutes celles que je connaissais quand on m'a écrit ».
> La forme qui tient : une attente DÉRIVÉE d'`allCases` (moins ce qui a une raison nommée
> d'être absent), jamais une liste écrite à la main.

**Et deux lectures d'un même rouge ne sont presque jamais symétriques.** Le second témoin
tombé, `test_contextMenu_ordinaryText_offersEveryAction`, passait par la VUE. On pouvait
croire qu'enrichir la fixture (un média au lieu d'un texte) le rendrait vert : non —
`contextMenu(for:kind:)` n'appelle pas `offered(hasTrimmableSource:)` **du tout**, parce
que rogner ouvre une bande SOUS la scène, une place que le menu d'appui long n'a pas. La
fixture-média aurait seulement rendu l'échec plus difficile à lire. Avant de choisir entre
« corriger la fixture » et « corriger l'attente », **lire ce que le site sous test APPELLE**.

Corollaire : retirer une valeur d'une attente est un geste dangereux — il rend vert
« le site ne l'offre pas » ET « l'entrée n'existe plus nulle part ». Le fusible qui
distingue les deux se pose dans le même commit.
