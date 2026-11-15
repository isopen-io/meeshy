## Leçon 175 — « A-t-il le droit ? » et « où ça part ? » sont DEUX questions (2026-08-15, routine temps réel, cycle 26)

`CommentReactionHandler` vérifiait scrupuleusement l'audience du commentaire visé
— `loadCommentPostAcl` + `canUserInteractWithPost`, refus indistinct, pas
d'oracle — puis diffusait vers `ROOMS.post(<postId fourni par le client>)`. La
garde était juste ; l'ADRESSE ne l'était pas. Le handler avait résolu DEUX
entités (le commentaire, le post) en croyant n'en résoudre qu'une.

**La règle.** Dans un handler temps réel, séparer explicitement :
1. **l'autorisation** — l'acteur peut-il agir sur la ressource nommée ?
2. **l'adresse** — vers quoi l'événement PART-il, et d'où sort cette valeur ?

Une revue qui ne pose que (1) sort verte sur un handler qui échoue en (2). Le
symptôme est muet : ACK `success`, UI optimiste correcte chez l'acteur, aucune
erreur, aucun log — seuls les AUTRES ne reçoivent rien.

**Le test qui manque.** Quand un handler reçoit un id dans le payload ET peut
dériver le même id du serveur, le seul témoin utile est celui où les deux
DIVERGENT. En nominal ils coïncident, donc toute la suite reste verte quel que
soit celui qu'on utilise : la suite ne mesure pas la propriété en cause. Écrire
ce témoin coûte trois lignes et c'est la seule assertion qui discrimine.

**Corollaire — un mock peut FIGER le défaut.** Le doublon de test de ce cycle
déclarait `loadCommentPostAcl → postId: 'post-1'` tout en attendant la diffusion
vers l'id du payload : un monde où le commentaire vit sur un post et son
événement part vers un autre, c'est-à-dire le défaut lui-même, promu au rang de
spécification. Un mock dont les valeurs sont mutuellement incohérentes ne
protège rien — il documente le bug. Vérifier qu'un jeu de doubles décrit un
monde POSSIBLE fait partie de la revue.

**Corollaire — la garde d'un abonnement ne borne rien si l'état se demande aussi
en direct.** `handleJoinPost` gardait l'entrée dans la room ; les deux
`handleRequestSync` rendaient le même état sans aucune garde. Quand un même fait
est servi par un canal PUSH et un canal PULL, l'audience doit être vérifiée sur
les DEUX — sinon la plus stricte est décorative. Recenser les canaux par le FAIT
servi, jamais par le nom du handler.
