## Leçon 156 — Un code mort qui décrit un CONTRAT a des jumeaux vivants ; c'est eux qu'il faut aller voir

Cycle 118 (`socket-validator.ts`, décodeur `notification:new` web).

Deux cycles de suite, la question posée sur `socket-validator.ts` était « le retirer ou le
brancher ? ». Elle n'avait pas de réponse : son schéma exige `createdAt` à la RACINE, la gateway
l'émet sous `state` depuis le regroupement. Le brancher aurait rejeté 100 % des notifications
réelles. **Une question binaire dont aucune branche ne tient est le signe qu'on n'a pas lu l'objet,
seulement son étiquette** — ici « validateur de sécurité », qui invite à débattre de sécurité au
lieu de comparer un schéma à un payload. Le grep de trois secondes qui tranchait — comparer
`NotificationEventSchema` à `formatNotification()` — n'a été fait ni au cycle 116 ni au 117.

**Mais le vrai enseignement est ailleurs.** Un fichier mort qui encode une FORME de données n'est
presque jamais seul : il est le résidu d'une migration, et une migration laisse le même résidu
partout où la forme était écrite. Ici, trois artefacts portaient la forme plate — le validateur
(mort), **le décodeur du singleton (vivant, à chaque notification)**, et la fixture de son test
(vivante, et c'est elle qui rendait le vert). Le mort était le seul inoffensif.

**Règle : devant du code mort qui décrit un contrat, ne pas décider de son sort — chercher d'abord
qui d'autre écrit ce contrat.** La valeur du fossile n'est pas dans son sort, elle est dans la date
qu'il donne : il dit « à une époque, l'équipe croyait que la forme était celle-ci », et il suffit
alors de demander qui le croit ENCORE.

**Corollaire — le champ qui dégrade vers une valeur plausible est plus dangereux que celui qui
jette.** Le décodeur lisait quatre champs au mauvais endroit. `isRead` retombait sur `false` et
`readAt` sur `null` : *justes* pour une notification neuve — donc invisibles. `createdAt` retombait
sur `new Date()` : l'horloge de l'APPAREIL substituée à l'horodatage serveur, une valeur qui a
toujours l'air correcte et qui pilote pourtant le regroupement par jour, le « il y a X » et
l'anti-doublon des toasts. Et `title`/`subtitle`, simplement pas recopiés, faisaient retomber
l'affichage sur un repli client — dans une autre langue que celle que le serveur avait résolue,
alors que le Prisme désigne le titre serveur comme source unique. **Quand un décodeur a un défaut
par champ, chercher d'abord les champs dont le défaut est CRÉDIBLE : ceux-là ne remonteront jamais
en bug.**

**Corollaire — une fixture de test inventée fige le contrat qu'on croyait avoir, pas celui qu'on a.**
`makeNotificationData()` construisait un payload plat, et un test affirmait explicitement
`state.createdAt === createdAt` racine — il PROUVAIT le décalage en le nommant. CLAUDE.md le dit
déjà (« use real schemas/types in tests, never redefine them ») ; ce qui manquait, c'est le motif de
reconnaissance : **une fixture écrite à la main pour un payload de FIL doit citer son émetteur**
(ici `{...formatNotification(raw), title, subtitle}`), sans quoi elle ne teste que la cohérence du
client avec lui-même.

**Corollaire — retirer un fossile, c'est aussi retirer ce qu'il rendait attirant.**
`sanitizeNotification()` n'avait qu'un appelant : le validateur mort. Elle RECONSTRUISAIT `context`
avec 4 clés sur 21 — quiconque l'aurait « juste rebranchée » aurait perdu en silence
`callSessionId`, `postId`, `parentCommentId`, `firstAttachmentUrl`, donc la navigation. Un fossile
avec une jolie façade (`@author Security Team`, « Rejection of malformed messages ») ne se contente
pas d'être inutile : il se propose. Le laisser en place en documentant qu'il est mort ne suffit pas
— deux cycles l'ont fait, et le troisième a failli le brancher.
