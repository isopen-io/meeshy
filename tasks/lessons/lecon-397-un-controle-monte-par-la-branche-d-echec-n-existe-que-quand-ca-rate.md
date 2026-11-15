## Leçon 397 — Un contrôle monté par la branche d'ÉCHEC n'existe que quand ça rate

**Contexte.** « Rédiger » — la seule porte pour écrire à la main la description
d'un vocal — était monté par `errorPanel`, le panneau de la reconnaissance
ÉCHOUÉE. Conséquences, toutes invisibles à la relecture du code qui l'entoure :
une transcription RÉUSSIE n'était pas corrigeable, et un son ROUVERT — qui ne
re-transcrit pas, délibérément — n'affichait ni son texte ni le moyen d'en
écrire un. La directive porteur (« avec toujours la possibilité de rédiger la
description ») disait « toujours », le code disait « en cas d'erreur ».

**La leçon.** Un contrôle hérite de la CONDITION de la vue qui le monte. La
question ne se pose pas au bouton (« existe-t-il ? ») mais à son hôte : **sur
quelle branche est-il monté, et cette branche est-elle celle où le contrôle doit
vivre ?** Le motif est double, et la seconde moitié est la plus vicieuse : une
`.sheet` attachée à une vue conditionnelle **disparaît avec elle**. Elle avait
d'ailleurs déjà été posée là pour une bonne raison — un commentaire du fichier
raconte qu'elle avait failli n'être montée nulle part, et qu'on l'avait donc
attachée « sur le panneau qui l'ouvre ». Le correctif d'hier devient l'angle
mort d'aujourd'hui : le montage appartient au PARENT des branches.
