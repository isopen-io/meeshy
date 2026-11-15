## Leçon 95 — « je ne peux pas compiler ici » n'est pas « ce n'est pas gatable » (2026-08-11, routine messaging, cycle 72)

Le cycle 71 a diagnostiqué un `sdk-tests` rouge sur `main`, prouvé la cause par l'arithmétique,
écrit le correctif en prose — et **ne l'a pas posé**, au motif que le conteneur n'a pas de chaîne
Swift. Il notait pourtant, dans le même document, que « `sdk-tests.yml` tourne sur les PR ». Les
deux phrases coexistaient sans se rencontrer : le gate était identifié comme bon pour vérifier du
Swift déjà écrit, pas comme autorisation d'en écrire.

1. **La question utile est « existe-t-il un gate qui compile ceci ? », jamais « puis-je le compiler
   ici ? ».** Elles ont divergé pendant cinq cycles, et la seconde a coûté un `main` rouge laissé
   en l'état une journée entière alors que le correctif tenait en deux fichiers. Avant de reporter
   un travail pour cause d'environnement, **énumérer les workflows qui touchent le chemin
   concerné** — `on: pull_request` suffit, l'absence de toolchain locale ne décide de rien.
2. **La règle « ne pas poser sur `main` du code non gaté » (leçon 92) porte sur `main`, pas sur une
   branche.** L'appliquer à une PR la transforme en interdiction de travailler. Une PR EST le
   dispositif qui rend le code gatable ; s'en priver au nom de la prudence inverse la règle.
3. **Un défaut de témoin se répare en le liant à sa source de vérité, pas en recalant son
   littéral.** `slideTransitionDuration` a bougé deux fois, et deux fois laissé derrière elle des
   témoins rouges décrivant un comportement inchangé. Recaler sur 1,2 aurait armé la troisième
   occurrence. Le prix est assumé et doit être payé explicitement : lier à la SSOT rend certains
   témoins **tautologiques**, et il faut alors leur rendre leur portée par d'autres assertions
   (ici : la largeur reste celle de la fenêtre et non celle du slide, et elle respire avec le zoom).
4. **Un correctif de témoin oblige à relire le code qu'il traverse — c'est là que le vrai défaut
   se trouve.** Dériver les instants d'échantillonnage imposait de relire `applyOpening` à côté de
   `applyClosing`, et l'asymétrie a sauté aux yeux : l'un pose des `CABasicAnimation`, l'autre écrit
   des valeurs **modèle**. Un remplissage `fillMode = .forwards` + `isRemovedOnCompletion = false`
   recouvre la valeur modèle indéfiniment. **Chercher ce motif partout où un instantané piloté par
   le playhead cohabite avec une animation autonome sur la même propriété.**
5. **Le conflit d'une animation se raisonne par keyPath, jamais par nom d'effet.** `.zoom` et
   `.slide` sont deux effets distincts qui écrivent tous deux `sublayerTransform` : une entrée
   `.zoom` masque une sortie `.slide` aussi sûrement que la sienne. Un retrait indexé sur l'effet
   aurait laissé la moitié du défaut en place.
6. **Établir la portée d'un défaut de rendu en balayant TOUS les chemins de rendu, avant de
   conclure.** Ici trois : aperçu du composer (touché), lecteur (indemne — son canvas naît en
   `.play`, `applyOpening` n'y passe jamais), export MP4 (indemne — il n'écrit que des valeurs
   modèle). Sans ce balayage, le rapport aurait annoncé « les fermetures ne marchent pas », ce qui
   est faux, au lieu de « **la surface où l'auteur vérifie ses transitions est la seule qui les
   avale** » — l'aperçu mentait sur l'export, et c'est ce qui rend le défaut coûteux.
7. **Quand le pixel n'est pas observable, assertionner la CAUSE.** `presentationLayer()` exige un
   render server qu'aucun test unitaire n'a. Assertionner `animation(forKey:)` n'est pas un repli
   sur l'implémentation : le remplissage attaché **est** le défaut, et sa présence est exactement
   ce qui rend la valeur modèle invisible.
8. **Un correctif partiel doit nommer ce qu'il laisse ouvert, avec l'arithmétique faite.** Retirer
   l'entrée à `progress > 0` tronque une ouverture encore en vol sur un slide de 2 s (fenêtre 1,2 s,
   seuil de chevauchement 2,4 s). Moins grave que le défaut remplacé, mais réel — et l'arbitrage
   entre relever le plancher de durée, comprimer la fenêtre de sortie, ou l'assumer est **produit**,
   pas technique. Le cycle le mesure, le documente en tête du suivant, et ne tranche pas.
