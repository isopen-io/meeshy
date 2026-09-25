## Leçon 523 — Un gate de conformité qui dépend d'un état non déclaré rend un écran invisible aux instruments, en silence

**Le fait (revue de `vitrine`/`home`, #5115, 2026-09-04).** Le portage de la charte du tour 3
(contour, encre, dégradé) sur `app/vitrine/feuille.ts` et `app/connecte/feuille.ts` a été validé par
`type-check`, `lint`, `test` (76/76 sur `charte.test.ts`) — trois gates VERTS, tous exécutés. Aucun
d'eux n'est le gate de CONFORMITÉ VISUELLE (`compare-rendu.js`), qui rend `RC_NON_COMPARABLE` (rc=3)
sur `vitrine` et `home` depuis que les deux visent la même route `/` sans qu'aucune des deux ne
déclare d'état de session (§ 12.8 de la conception le documente déjà comme un défaut de
l'INSTRUMENT, pas de l'écran). Résultat : deux écrans en tête du focus explicite du porteur reçoivent
un changement de profil de luminance (le dégradé du héros) sans qu'AUCUN gate structurel ne le
regarde — et les trois gates verts donnent, à qui ne vérifie pas lesquels ont tourné, l'impression
d'une conformité complète.

> **Un jeu de gates verts ne dit rien sur le gate qui manque.** La question à poser avant de clore
> une revue n'est pas « tous les gates lancés sont-ils verts ? » mais **« quels gates EXISTENT pour
> ce changement, et lesquels de ceux-là n'ont pas tourné — et pourquoi ? »**. Un gate absent pour une
> raison connue et documentée (ici : une collision de route non résolue par l'instrument) reste un
> gate absent : le rapport doit le nommer à côté des gates verts, jamais le laisser se fondre dans
> leur nombre.

Site : `apps/web-v3/e2e/visual/lib` (`compare-rendu.js`, `selectionComparable`) ; conception
`docs/product/MeeshyWebV3Design/conception-web-v3.md` § 12.8. Détail : rapport de revue `vitrine`
(#5115), tour 2026-09-04.
