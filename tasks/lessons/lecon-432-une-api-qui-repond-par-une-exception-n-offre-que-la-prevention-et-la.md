## Leçon 432 — Une API qui répond par une EXCEPTION n'offre que la prévention, et la prévention s'écrit devant l'APPEL

**Le fait (2026-09-02).** Toucher le bouton d'enregistrement du viseur vidéo
tuait l'application. `AVCaptureMovieFileOutput.startRecording(to:recordingDelegate:)`
ne rend pas d'erreur quand il n'a pas de connexion active : il lève une
`NSInvalidArgumentException`. Aucun `do/catch` Swift ne la rattrape, aucun
`guard` en aval ne la voit passer. Le seul résultat possible est la mort du
processus.

> **Devant une API qui répond par une exception Objective-C, le choix
> « rattraper ou prévenir » n'existe pas.** Il n'y a que la prévention. Et une
> prévention n'a qu'une place : DEVANT l'appel, dans la même fonction — pas
> « quelque part dans le fichier », pas dans l'appelant.

Le témoin de câblage a donc deux moitiés, et la seconde est celle qui compte :
la garde EXISTE (facile), et elle **précède l'appel dans le corps de
`startSegment()`** (ce qui la rend efficace). Une garde posée dans
`startRecording()` seul aurait laissé intact le second site d'appel — celui
qui rouvre un segment après une bascule de caméra.

**Ce qui a laissé le défaut vivre.** Le chemin vidéo était vert partout : sept
témoins sur le raccord des segments, deux sur le changement de caméra en cours
d'enregistrement. Aucun ne pouvait poser la question qui tue — « et si la
connexion n'existe pas ? » — parce qu'aucun ne monte de caméra. **Une garde qui
manque ne se voit pas dans le cas nominal**, et une famille de témoins qui
partage un présupposé ne le teste jamais.

**Le corollaire d'ordre.** Le correctif n'est pas seulement le `guard`. Le
chrono d'enregistrement partait AVANT le segment : sans réordonner, un refus
aurait laissé courir une durée sur une vidéo que rien n'écrit — point rouge et
compteur qui monte sur un enregistrement fantôme. *Quand on ajoute une
condition d'échec à une fonction qui n'en avait pas, relire tout ce qu'elle
pose AVANT et APRÈS l'appel gardé* : ce qui était inconditionnel devient un
mensonge d'état.

**Et la manière dont il a été trouvé.** En vérifiant AU SIMULATEUR un lot qui
n'avait aucun rapport (la tenue des rangées), en cherchant un chemin vers une
surface. Le gate était vert, il l'aurait été indéfiniment. **Conduire l'app
trouve ce qu'aucune suite ne peut poser** — c'est le sens de la directive
« utilise le simulateur pour tester et valider ».
