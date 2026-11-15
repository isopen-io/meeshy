## Leçon 83 — Une convention tenue par les APPELANTS n'est pas testée par ce qui la consomme (2026-08-10, routine messaging, cycle 58)

Le modèle `Message` fait tenir son soft-delete par ses écrivains : ~119 lectures filtrent
`deletedAt: null`, et ce sont les sept `message.create` qui rendent ce filtre vrai en écrivant la
colonne. Deux l'avaient perdu depuis longtemps. Aucune suite ne l'a vu.

La sonde qui l'a établi vaut plus que le constat. Après avoir corrigé les deux sites, j'ai vidé la
constante partagée (`{}`) et relancé 45 suites voisines : **seuls mes deux témoins neufs sont
tombés.** Les cinq créateurs qui portaient le littéral correctement depuis toujours n'avaient AUCUNE
couverture dessus. La couverture de leurs chemins était pourtant excellente — contenu, expéditeur,
métadonnées, idempotence P2002, races — parce que les tests sont écrits contre ce que la méthode
CALCULE, jamais contre ce qu'elle doit se contenter de recopier.

**Règle** : quand une invariante est tenue par N appelants plutôt que par le type ou le schéma,
elle n'a de couverture nulle part par défaut — les tests de chaque appelant portent sur ce qui lui
est propre. Le geste qui le mesure : vider l'invariante à la source et regarder ce qui tombe. Si la
réponse est « seulement les témoins que je viens d'écrire », la conclusion n'est pas « ma couverture
est suffisante », c'est « voilà comment la divergence est née, et elle recommencera ».

**Corollaire sur la forme du correctif.** La sonde a changé le correctif, pas seulement le rapport.
Ajouter le littéral aux deux sites fautifs aurait rendu la suite verte en laissant sept copies sans
propriétaire. Extraire UNE constante nommée fait deux choses qu'aucune des sept copies ne faisait :
elle donne un endroit unique où écrire POURQUOI, et elle rend l'invariante testable par un témoin
unique sur la source — sept témoins de créateur auraient été sept fois le même test.
