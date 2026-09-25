## Leçon 224 — une note de conception qui déclare une règle « impossible » nomme un ÉTAT à chercher, pas un fait à croire (2026-08-17, routine messagerie, cycle 57 bis)

**Le constat.** `conversationWriteAdmission` portait en tête, dans sa section « ce que ce module
ne fait pas », la phrase qui a protégé une fonctionnalité morte pendant deux cycles :

> `Conversation.slowModeSeconds` est de la même famille (un réglage de conteneur que personne
> n'applique) mais demande un état « dernier envoi par personne » qui n'existe nulle part : c'est
> un limiteur de débit, pas une admission.

Les deux moitiés sont fausses, et différemment. L'état existe — c'est la table `Message`, dont
l'index `[senderId, conversationId]` porte EXACTEMENT cette question. Et la seconde moitié oppose
deux catégories qui n'en font qu'une : « cet envoi passe-t-il maintenant ? » est une admission dont
la réponse dépend du temps, et le module en portait déjà une du même genre (l'état terminal dépend
de `closedAt`).

**Le tell.** La phrase cherchait un COMPTEUR — une colonne dénormalisée, avec son écrivain, son
invalidation, sa dérive — et concluait « n'existe nulle part » en ne le trouvant pas. Le mot qui
trahit est **« un état »** : il fait entendre une structure à CONSTRUIRE là où la question portait
sur une information à LIRE. Un journal d'événements répond déjà à toutes les questions de la forme
« quand, pour la dernière fois, X a-t-il fait Y ? », autoritairement et sans écrivain à tenir.

**Pourquoi ça survit.** Une note de conception qui ferme une question ne se relit pas comme une
hypothèse. Les cycles 31 et 56-bis ont tous deux LU cette phrase — 56-bis la cite même dans ses
« écartés délibérément » — et l'ont reçue comme un constat d'inventaire. C'est la forme la plus
discrète de dette : pas un oubli (qu'un recensement trouve), pas un TODO (qu'une recherche trouve),
mais une affirmation soignée, dans un fichier soigné, écrite par quelqu'un qui venait de faire le
travail juste à côté. Son autorité vient du voisinage.

**La règle.** Une note qui déclare une règle hors de portée pour cause d'état manquant doit nommer
la LECTURE qu'elle a essayée et qui n'a pas suffi, jamais seulement l'état qu'elle a cherché. « Il
faudrait un compteur `lastSentAt` par participant, que personne n'écrit » est vérifiable et
réfutable ; « demande un état qui n'existe nulle part » ne l'est pas, et c'est ce qui la fait
traverser les cycles intacte. Réciproquement, en lisant une telle note : avant de la croire,
demander **quelle table journalise déjà l'événement dont on veut la date ?** — la réponse est
presque toujours celle des lignes qu'on écrit de toute façon.

**Le corollaire de forme, découvert en chemin.** Quand la question de temps se pose à une REQUÊTE,
borner la fenêtre dans le `where` (`createdAt > now - fenêtre`) plutôt qu'après le tri fait
d'une pierre trois coups : l'ensemble trié devient minuscule (aucun index neuf), l'existence d'une
ligne DEVIENT la décision, et l'arithmétique qui suit ne fait plus que chiffrer — donc un
`if (restant > 0)` posé après coup est le même calcul une seconde fois, et une branche qu'aucun
état de la base ne peut atteindre. C'est le trou de COUVERTURE qui a nommé cette redondance : une
ligne non couverte sur un module à 100 % est plus souvent du code inatteignable qu'un témoin
manquant. Cf. `tasks/realtime-sync-audit-2026-08-17-cycle57-bis.md` §3.1.

**Le voisinage.** Miroir exact de la leçon 219 (« appliquer une règle jusque-là inerte change la
question à poser au site qui l'ÉCRIT »), vue depuis l'autre bout : là, un cycle avait armé un champ
sans regarder son écrivain ; ici, un cycle avait DÉSARMÉ une question en écrivant que son état
n'existait pas. Et parent de la leçon 214 (« un correctif nommé dans un journal ne prouve que le
site qu'il a touché ») : dans les deux cas, c'est une PROSE de dépôt — journal ou en-tête — qui a
été prise pour une preuve.
