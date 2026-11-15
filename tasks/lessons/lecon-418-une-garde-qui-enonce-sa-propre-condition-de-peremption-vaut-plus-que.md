## Leçon 418 — Une garde qui énonce sa PROPRE condition de péremption vaut plus que la règle qu'elle protège

`test_laPorteDuTray_nAtteintAucuneSurfaceQuiPublieParLeSocle` gardait un refus
inconditionnel (`onPublishDocument: { _ in false }`) en disant, en toutes
lettres : « le jour où cette ouverture changerait, ce refus deviendrait une
flèche qui ne publie rien — en silence. Cette garde est le bruit qui manquerait
alors. »

Ce jour est arrivé avec la leçon 417. Le mécanisme :
`ComposerScenePresence.hasScene` compte ce que la scène CONTIENT, jamais la
slide SEMÉE. Basculer l'éventail sur « Post » sans rien poser laissait donc
`documentHasScene` faux ⇒ le meuble montait le SOCLE ⇒ sa flèche appelait le
refus. **La bascule de routage, livrée seule, aurait produit le bon écran avec
une flèche d'envoi inerte.**

> Une règle de routage qui ouvre un chemin doit livrer ce que ce chemin promet.
> Router sans publier ne corrige pas le défaut : il l'échange contre un défaut
> MUET, et le déplace vers la loi 4 dans sa forme la plus dure — la flèche
> d'envoi.

Cette garde n'était PAS dans le gate ciblé du lot ; elle a été trouvée en
balayant `grep -l storyTray apps/ios/MeeshyTests/`. **Un changement de règle
partagée se balaye par le NOM de ce qu'on change, jamais par les suites qu'on
croit concernées.**

Trois notes qui valent pour la suite :

- **Un état intermédiaire non nommé produit deux couches justes qui se
  contredisent** : une slide SEMÉE existe sans être une MATIÈRE — le canvas la
  montre, la présence ne la compte pas. Une forme qui ne connaît que « scène » /
  « pas de scène » ne peut pas décrire ça, et c'est là que naissent les flèches
  inertes. (Repris par la session qui tient la forme unifiée.)
- **Un témoin qui affirme A et mesure B reste vert jusqu'au jour où B change,
  puis rougit en accusant le mauvais coupable.**
  `test_surface_duStoryTray_resteLaScene_memeAuFormatPost` affirmait « le canvas
  composé survit » et mesurait « la caméra est exemptée ». Le retourner a
  demandé de retrouver quelle couche portait vraiment son énoncé —
  `ComposerMountedView.mounted(surface:hasScene:)`.
- **Un témoin écrit pour prouver qu'un chemin marche peut prouver qu'il
  REFUSE** : j'attendais qu'un `.reel` texte-seul parte sous le type « REEL ».
  Rien n'est parti, et le refus était juste — un réel EST une vidéo. C'est
  l'attente qu'on corrige alors, jamais le code qu'elle accuse.

Vérifié au simulateur (iPhone 16 Pro, binaire de 3 min) : « Add a story » ouvre
le meuble, le viseur s'arme, l'éventail sert les quatre formats, la bascule en
Post monte le document, et la flèche PUBLIE — composer fermé, post présent dans
le fil. Elle levait au passage #4746 : un volet câblé par une session voisine,
avec témoins verts, n'était jamais apparu parce que le flux story montait
l'atelier.
