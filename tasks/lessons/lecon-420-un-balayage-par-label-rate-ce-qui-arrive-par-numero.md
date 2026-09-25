## Leçon 420 — Un balayage par LABEL rate ce qui arrive par NUMÉRO

`grep "loi 8"` sur `docs/product/MeeshyComposerDesign/BOUCLE.md` rend **zéro**.
J'en ai conclu, à voix haute, que la loi 8 n'existait pas. Elle est ligne 45.

Le document NUMÉROTE ses lois (`**8. LE PRISME N'AFFICHE QUE…**`) et ne les nomme
jamais « loi 8 » — mais ses renvois internes, eux, écrivent bien « loi 4 » et
« loi 7 » (`grep "loi 4"` rend trois résultats).

> **Le pire cas d'un balayage n'est pas le silence : c'est le silence dans un
> corpus où la même méthode répond pour les VOISINS.** L'absence se lit alors
> comme un fait sur le monde plutôt que comme une limite de la requête — la
> méthode paraît validée par les frères, et échoue précisément sur celui qu'on
> cherche.

Le réflexe qui l'attrape : avant de conclure « X n'existe pas », **chercher X±1**.
Si les voisins répondent et pas X, c'est la REQUÊTE qu'il faut changer, pas la
conclusion qu'il faut tirer.

Cette leçon existait déjà en mémoire
(`reference_a_sweep_by_label_misses_values_that_arrive_by_name`, écrite pour un
champ atteint par un nom plutôt qu'un label) et je l'ai refaite sur un document
au lieu d'un fichier de code. La forme est indifférente au support.
