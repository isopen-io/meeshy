## Leçon 135 — un commentaire qui JUSTIFIE une destruction est une prémisse, et une prémisse peut périmer sans que personne ne réécrive la phrase (2026-08-12, routine messaging, cycle 97)

Le cycle 96 avait retenu qu'un commentaire qui **nomme un suivi** est une promesse, au même titre
qu'un champ de schéma. Le cycle 97 trouve l'autre moitié de la règle, et elle mord plus fort : un
commentaire qui **donne la raison** d'un geste destructeur est une PRÉMISSE, et une prémisse est
datée.

`ExpiredStoriesCleanupService` détruisait, avec chaque contenu éphémère périmé, tout post le
repostant — cascade accompagnée de sa justification, écrite noir sur blanc : « *a repost of a story
dead for 7+ days has no value (stories are ephemeral)* ». Elle était **vraie le jour de son
écriture** : un repost ne faisait alors que RÉFÉRENCER sa source, et privé d'elle il n'affichait
plus rien.

Une fonctionnalité postérieure l'a rendue fausse — l'INSTANTANÉ, qui duplique médias, audio, effets
et texte de toute source éphémère dans le repost. Et son propre commentaire dit exactement
pourquoi : *« so a repost that merely referenced it via repostOfId would render EMPTY once the
source is gone »*. **Les deux commentaires se contredisent, à trois cents lignes l'un de l'autre,
dans le même fichier de service et son voisin, depuis des mois.** L'API expose `targetType`, donc
« reposter un statut en POST PERMANENT » est un geste ordinaire ; quatorze jours plus tard le
balayage effaçait ce post permanent, ses commentaires, ses notifications — et, depuis le cycle 96
qui venait de brancher la récupération disque sur cette passe, ses OCTETS.

**Règle : relire la JUSTIFICATION de chaque suppression comme on relit un champ de schéma —
« cette phrase est-elle encore vraie aujourd'hui ? ».** Une prémisse périmée ne lève aucune alerte,
ne casse aucun test et n'apparaît dans aucun audit : elle a l'air d'une décision.

**Corollaire de méthode.** Cinq cycles d'affilée (92 à 96) ont cherché la PROMESSE au dernier
maillon — *qui, côté serveur, fait respecter ce que ce champ annonce ?* — et cinq fois la réponse a
été « personne ». Le cycle 97 montre que la question symétrique n'avait jamais été posée : non pas
« qui fait respecter la promesse ? » mais « **qui vérifie que ce qu'on détruit méritait de
l'être ?** ». Le premier filtre trouve les fuites ; le second trouve les PERTES, qui sont
irréversibles.

**Corollaire technique, gratuit et à ne pas rater.** Le correctif ne pouvait pas se limiter à
épargner le repost : l'épargner en laissant son `repostOfId` viser une ligne détruite n'aurait fait
que déplacer le défaut sur le motif déjà poursuivi trois fois (`TrackingLink.targetId`,
`Notification.context.postId`). Couper le pointeur AVANT la destruction a fermé trois choses d'un
seul geste — le pointeur pendant, le routage des réactions vers un id disparu, et la PROFONDEUR des
chaînes de reposts que la cascade d'un seul niveau ignorait. Ce dernier point était un P2014 en
puissance sur `Post.repostOf` (`onDelete: NoAction`), c'est-à-dire **la construction exacte dont la
même passe corrige déjà le jumeau trois lignes plus haut** pour la self-relation des réponses de
commentaires. Quand un remède est déjà écrit dans le fichier qu'on modifie, chercher qui d'autre a
la même forme.

---
