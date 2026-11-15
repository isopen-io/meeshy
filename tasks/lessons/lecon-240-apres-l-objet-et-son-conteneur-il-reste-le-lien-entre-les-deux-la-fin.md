## Leçon 240 — après « l'objet » et « son conteneur », il reste le LIEN entre les deux : la fin d'APPARTENANCE (2026-08-18, routine messagerie, cycle 74)

### Le fait

Le cycle 73 avait posé la règle : devant tout état éphémère, poser DEUX questions
— « qu'est-ce qui termine cet objet ? » et « qu'est-ce qui termine ce qui le
contient ? ». Elle a été appliquée, et elle était **incomplète d'une question**.

Quatre routes mettent fin à l'appartenance d'un membre à une conversation qui,
elle, **continue de vivre** : quitter, être banni, être retiré par un modérateur,
supprimer le fil pour soi. Aucune n'éteignait le partage de position que le
sortant tenait dans le fil. Le fil vit, les autres membres restent dans la room,
et la position réelle du sortant restait affichée **au groupe qui vient de
l'exclure**, jusqu'à huit heures.

### Ce qui rend cette fin-là plus chère que les deux précédentes

Le sortant perd **en sortant** le pouvoir même d'arrêter :
`handleLiveLocationStop` commence par résoudre l'appartenance (`isActive: true`),
donc la sortie fait taire le SEUL verbe capable de retirer l'épingle — et il
tombe en silence, `return` sans callback ni erreur.

Au cycle 73, la commande d'arrêt disparaissait **avec l'écran**. Ici elle est
morte **avant** l'écran. Même issue, une étape plus tôt, et sans trace.

> Quand une garde d'AUTORISATION protège aussi le verbe de RETRAIT, la perte du
> droit gèle l'état au lieu de le libérer. Chercher, pour tout état éphémère
> qu'un acteur peut créer : « le verbe qui l'annule est-il gardé par la même
> condition que le verbe qui le crée ? » Si oui, la fin de cette condition
> **emprisonne** l'état.

### Pourquoi la règle du cycle 73 ne suffisait pas

Ses deux questions portent sur des ENTITÉS — l'objet, le conteneur. Une fin
d'appartenance n'est ni l'une ni l'autre : c'est la fin du **lien** entre les
deux, et elle ne figure dans aucune des deux listes. Le conteneur est intact,
l'objet est intact ; seule la relation s'arrête.

> La question complète est TRIPLE, et la troisième est celle qu'on n'écrit
> jamais : « qu'est-ce qui termine cet objet ? », « qu'est-ce qui termine son
> conteneur ? », **« qu'est-ce qui retire l'acteur d'un conteneur qui, lui,
> continue ? »**. Les deux premières se répondent en lisant un cycle de vie ; la
> troisième se répond en lisant les routes d'ADMINISTRATION, où personne ne va
> chercher un état temps réel.

### Le corollaire de conception, confirmé une seconde fois

Les quatre routes portaient déjà, recopiée quatre fois, la même paire de gestes :
sortir les sockets du partant de la room, invalider son cache d'appartenance. Y
ajouter quatre appels d'extinction aurait reproduit exactement la structure que
les cycles 67, 71 et 73 ont payée.

> Une répétition EXISTANTE à N endroits est le meilleur indice de l'endroit où
> créer l'unité : elle prouve que les N chemins partagent déjà une décision, donc
> qu'ils partageront la suivante. Ne pas attendre le défaut N+1 pour la nommer.

### Le corollaire d'ordre : la même contrainte, l'argument INVERSE

Le cycle 73 impose « éteindre AVANT d'annoncer », parce que les clients OUBLIENT
la conversation en recevant l'annonce. Ce cycle impose « éteindre AVANT
d'évincer », parce que le sortant QUITTE la room par laquelle on l'atteint — et
que la diffusion de fin est le seul point d'accroche capable de couper son GPS.

Même contrainte d'ordre, deux raisons sans rapport. La déduire de la première
aurait donné la bonne réponse pour la mauvaise raison, donc rien de réutilisable.

> Un ordre d'exécution se justifie par **le canal**, jamais par analogie avec un
> ordre déjà écrit ailleurs. Écrire lequel des deux gestes DÉTRUIT la voie que
> l'autre emprunte : c'est la seule formulation qui survit au prochain appelant.

### Le corollaire de témoin : figer le MÉCANISME du coût, pas seulement le correctif

Un témoin de ce lot n'atteste pas le correctif : il atteste que
`location:live-stop` tombe en silence dès l'appartenance finie — c'est-à-dire la
raison pour laquelle l'extinction serveur est **nécessaire** et ne peut pas être
déléguée au client. Il est vert avant comme après.

> À côté des témoins qui tombent sous la mutation, en garder un qui fige **le
> mécanisme qui rend le correctif nécessaire**. Le jour où quelqu'un propose « le
> client n'a qu'à envoyer un stop avant de partir », ce témoin répond seul.
