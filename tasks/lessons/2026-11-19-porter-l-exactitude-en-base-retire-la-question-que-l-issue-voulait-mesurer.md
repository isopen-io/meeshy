## Porter un filtre d'exactitude EN BASE retire la question que l'issue voulait mesurer — avant de lancer la mesure qu'une issue prescrit, chercher le levier qui la rend inutile (2026-11-19, #19906)

**Contexte.** `findExactCallGroups` cherche le groupe dont l'ensemble des membres
actifs est EXACTEMENT celui d'un appel. La lecture ne bornait que par le
SUR-ENSEMBLE — « les groupes qui CONTIENNENT ces membres » — et l'exactitude se
jugeait en mémoire, APRÈS une fenêtre de vingt lignes. Un groupe appariant
exactement, mais rangé derrière vingt sur-ensembles plus récents, était invisible,
et l'appel en créait alors un neuf : un DOUBLON, sans erreur ni trace.

**Ce que l'issue prescrivait.** Trois étapes, dans l'ordre : (1) mesurer en staging
combien de groupes vivants un même ensemble de membres peut porter ; (2) selon la
queue mesurée, porter le filtre en base ou lever la fenêtre ; (3) écrire le verdict
au site. L'étape 1 demandait un accès que la session n'avait pas, et la lecture
naturelle était « ce lot est bloqué ».

**Ce qui débloque.** Le levier (2) ne DÉPEND PAS de la mesure (1) : il la rend sans
objet. À l'intersection déjà exprimée (« tous les membres visés sont actifs ici »,
un `some` par membre) il suffit d'ajouter son complément (« aucun membre actif d'ici
n'est hors de la cible »), et les deux ENSEMBLE sont l'égalité des ensembles. La
fenêtre reste, et devient démontrablement inoffensive : ce qu'elle tronque est la
queue d'un ensemble DÉJÀ exact, ordonné par le rang sur lequel l'appelant choisit —
le premier candidat dont la réservation se prend est toujours présent.

> **Une issue qui prescrit « mesurer, puis décider » énumère les décisions qui
> dépendent de la mesure. Elle n'affirme pas qu'il n'en existe aucune qui n'en
> dépende pas.** La question à lui poser avant de la déclarer bloquée est : *parmi
> les leviers proposés, y en a-t-il un dont la justesse ne se lit pas dans le
> chiffre attendu ?* Ici le chiffre répondait à « 20 est-il assez ? » ; le levier
> retenu répond à « 20 décide-t-il encore de quelque chose ? » — et une fois la
> seconde réponse NON, la première cesse d'être une question d'exactitude pour
> redevenir une question de volumétrie.

**La forme qui rend le lot sûr sans base de données.** Le filtre ajouté ne peut que
RESSERRER : `sameSet` en mémoire reste autoritatif. Un filtre de base qui ne fait
que retirer des candidats ne peut introduire aucun faux positif — au pire il en
retirerait un vrai, et c'est cela seul qu'il faut instruire. Ici l'instruction est
explicite : un participant SANS compte n'a pas de clé `userId`, et toute négation
sous MongoDB exige la clé présente (#8309), donc l'intrus se dit en branches
POSITIVES (`isSet: false`, `null`, `notIn`) et non par une négation de document.
**Choisir une direction d'erreur AVANT d'écrire le filtre est ce qui permet de le
livrer sans l'avoir exécuté contre la vraie base.**

**Ce qui reste vrai de la mesure.** Elle n'est pas annulée, elle change de
catégorie : combien de groupes un même ensemble de membres peut porter est une
question de volumétrie (#19837), plus une dette de correction. Le site le dit
désormais ; il disait auparavant que rien ne soutenait la fenêtre, ce qui se lisait
comme un défaut ouvert.
