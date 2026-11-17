## Épurer n'est pas retirer les repères (retour porteur du 2026-11-11, #17584)

Le premier passage de l'épure web a appliqué six règles qui visaient toutes à
RETIRER du texte, et il s'est mesuré par un compte de mots visibles. Le lot des
liens (#17597, fusionné) et celui des réglages (#17596) ont donc réduit des écrans
jusqu'à des libellés nus. Retour du porteur : « Tu as trop réduit certaines pages
et on perd les repères. Les liens de partage, la sécurité de compte, les features
spécifiques de Meeshy et non usuelles dans les autres applications méritent les
explications. Mes appareils chiffrés doit lister les dates d'enregistrement, de
dernier usage, et si c'est cet appareil. »

> **Un texte se juge par ce qu'il apprend, pas par sa longueur.** Une explication
> est du bruit sur ce que tout le monde connaît (thème, langue, notifications) et
> un repère sur ce que Meeshy est seul à faire. La même règle « l'explication
> passe derrière un (i) » est juste sur le premier et fausse sur le second.

Règles tirées :

- **Classer avant de couper.** Chaque bloc d'un écran est USUEL ou PROPRE À MEESHY.
  L'usuel se réduit au libellé. Le propre garde, visible au repos, une phrase qui
  dit ce que c'est et ce que ça fait ; le (i) ne porte que le détail secondaire.
- **Le test de l'inconnu.** Quelqu'un qui n'a jamais vu l'écran sait-il où il est,
  ce que fait chaque bloc et ce que son geste déclenche, sans ouvrir un (i) ?
- **Une métrique qui ne sait que baisser pousse à trop couper.** Le compte de mots
  est un garde-fou contre le retour du bavardage, jamais l'objectif d'un lot. Un
  budget se relève, motivé, quand un repère revient.
- **Une liste à surveiller montre de quoi reconnaître chaque ligne.** Sessions,
  appareils, liens : nom, dates (enregistrement, dernier usage), « Cet appareil ».
  Retirer ces champs au nom de l'épure retire la raison d'être de l'écran.
- **Un prototype « après » validé en chiffres n'est pas validé en lecture.** Le
  compte rendu montrait −39 % de mots ; il aurait dû faire relire deux écrans
  propres à Meeshy avant de lancer vingt lots.

La règle 7 du workflow `meeshy-epure-interfaces` porte cette leçon et prime sur
les règles 1, 2, 4 et 6.
