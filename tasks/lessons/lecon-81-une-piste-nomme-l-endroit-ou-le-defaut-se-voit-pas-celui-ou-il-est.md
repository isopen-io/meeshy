## Leçon 81 — Une piste nomme l'endroit où le défaut SE VOIT, pas celui où il est (2026-08-10, routine messaging, cycle 56)

La piste héritée du cycle 52 disait : « `broadcastCommentDeleted` n'annonce que la cible et pas le
sous-arbre ». Elle est confirmée mot pour mot — le broadcast ne portait bien que la cible. Et elle
désigne quand même le mauvais fichier.

Le broadcast n'annonçait pas le sous-arbre parce qu'il **ne l'avait pas**. `deleteComment` calculait
la liste des ids retirés, s'en servait pour le soft-delete, le décompte et le retrait des
notifications, puis rendait `{ success: true }` : la liste mourait dans la méthode. La route
n'avait à sa disposition que le `commentId` de son propre chemin d'URL.

Corriger à l'endroit nommé aurait voulu dire reconstruire le sous-arbre dans la route — une SECONDE
dérivation d'une règle qui a déjà un propriétaire unique un étage plus bas, et qui plus est
impossible après coup (le soft-delete est committé, `NOT_DELETED` masque désormais les lignes qu'il
faudrait relire). C'est exactement la classe de défaut que le cycle 54 a payée sur les types
éphémères : deux copies d'une même liste, qui dérivent.

Ce que ça ajoute à la leçon 73 : celle-ci disait que le **remède** suggéré par une piste est une
seconde hypothèse. Celle-là dit que le **lieu** l'est aussi. Une piste est écrite depuis le
symptôme, donc depuis le dernier maillon — celui qu'on observe. Le geste qui la met à l'épreuve :
remonter d'un étage et demander « d'où cette fonction tient-elle ce qu'elle annonce ? » avant
d'écrire la moindre ligne à l'endroit nommé. Si la réponse est « elle ne le tient de nulle part »,
le correctif n'est pas là.

**Addendum, attrapé sur moi-même dans ce cycle.** Le premier jet de l'ADR et du relevé affirmait
« iOS et Android retirent toujours la seule cible, leurs réponses dépliées survivent ». Faux sur les
deux plateformes : iOS fait `repliesMap[id] = nil`, Android appelle `removedThread(commentId)`. Le
web était le seul client sans compensation. J'avais déduit le comportement des deux autres du fait
que le serveur ne leur envoyait pas l'information — un raisonnement qui confond « n'a pas la
donnée » et « ne fait rien ». **Une conséquence affirmée sur un composant qu'on n'a pas lu est une
hypothèse, même quand elle découle « logiquement » de ce qu'on vient de prouver ailleurs.** Trois
`grep` l'ont réfutée en deux minutes, et la réfutation a rendu le cycle plus intéressant qu'il ne
paraissait : le vrai défaut n'était pas « le serveur se tait », c'était « le serveur se tait, et
chaque client paie sa propre traversée pour compenser ». Le coût de ne pas vérifier n'aurait pas été
un bug — le code était bon — mais un relevé qui aurait envoyé le cycle suivant corriger sur iOS et
Android un défaut qui n'y était pas.

Corollaire de vérification : quand le correctif consiste à faire remonter une valeur, la sonde de
fidélité qui compte est celle qui la fait remonter FAUSSE (ici : rendre `[commentId]` au lieu de la
vraie liste), pas celle qui la supprime. Une valeur absente casse la compilation ou tous les
témoins ; une valeur plausible mais fausse ne fait tomber que les témoins qui mesurent vraiment le
comportement — et c'est le seul décompte qui prouve quelque chose.
