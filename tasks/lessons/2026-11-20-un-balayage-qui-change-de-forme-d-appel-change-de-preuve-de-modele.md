## Un balayage qui change de forme d'appel change aussi de PREUVE DE MODÈLE (cycle 195, #20100)

Le cliquet des audiences (#16690, #20091) lisait une **forme d'appel** :
`prisma.participant.findMany|count|groupBy|aggregate`. En l'élargissant à la
forme **imbriquée** — `conversation.findUnique({ select: { participants: { where: … } } })`,
trente-trois audiences invisibles, dont l'éventail de notifications push — le lot
a perdu en silence une garantie que la forme d'avant portait **gratuitement** :

> `participant.findMany` **NOMME la table**. `participants: { where: … }` ne nomme
> qu'une **RELATION**, et deux modèles la partagent.

Mesuré sur `schema.prisma` : le schéma ne porte que deux relations nommées
`participants` — `Conversation.participants: Participant[]` et
`CallSession.participants: CallParticipant[]` — et `CallParticipant` n'a **ni
`isActive` ni `bannedAt`**. Le premier jet rangeait donc
`{ OR: [{ leftAt: null }, { leftAt: { isSet: false } }] }`, les participants d'un
APPEL, parmi les **audiences nues d'une conversation** : un faux constat qui
envoyait réparer une clause n'ayant aucun rapport avec le bannissement.

La question à poser à tout élargissement de discriminant n'est donc pas seulement
« qu'est-ce que je vois en plus ? » mais **« qu'est-ce qui me prouvait, dans la
forme d'avant, que je regardais la bonne chose ? »** — une forme d'appel transporte
des garanties implicites (la table, la cardinalité, la direction de la lecture)
qu'une autre forme ne transporte pas, et elles ne figurent nulle part puisque
personne n'a eu besoin de les écrire.

Remède, et c'est le patron que le dépôt applique déjà à `ADMITTED_FILE_READER_WHERE`
(« le balayage ne lui fait confiance que parce qu'un second témoin prouve
l'identité ») : la garde publie ce qu'elle ne peut pas rattacher à un modèle
(`modèle-indécidable`) au lieu de le juger, et **sa prémisse de schéma est un
témoin** qui relit `schema.prisma` — l'ajout d'une colonne ou d'une troisième
relation `participants` fait rougir le cliquet au lieu de le rendre faux.

### Corollaire : la même garde a failli faire disparaître le site qu'elle venait de corriger

Le prédicat de modèle testait `isActive|bannedAt` **dans le texte** de la clause.
`PARTICIPATION_VIVANTE` ne nomme aucune colonne : le site RESSERRÉ par le lot est
donc sorti du relevé en `modèle-indécidable` au lieu d'y passer au VERT. Et comme
l'inventaire se rééquilibrait — 87 clauses nues, 87 entrées rangées — **tout
paraissait juste**.

> **Un site corrigé qui DISPARAÎT du relevé et un site corrigé qui y passe au VERT
> rendent le même inventaire équilibré.** Un compte d'inventaire ne peut pas faire
> la différence ; seul un témoin qui NOMME le site attendu et exige son verdict
> (`usesLaw === true`) la fait. C'est la troisième fois en deux lots qu'un cliquet
> de cette famille se trompe du côté rassurant — dans le lot qui dénonçait ce
> défaut (#20091), puis dans celui qui le réparait.
