## Un créateur de `Message` écrit `deletedAt` — et le créateur n'est pas toujours le site d'appel (2026-11-21, #20172)

**Décision.** `src/__tests__/message-creator-sweep.ts` relève tout créateur de `Message` de la production et juge ce qu'il écrit dans `deletedAt` ; `message-creator-sweep.test.ts` en fait un cliquet dont l'inventaire des sites NUS doit rester VIDE. La réparation d'un rouge est de répandre `LIVE_MESSAGE_MARK`, jamais d'ajouter une ligne d'inventaire : il n'existe pas de créateur légitimement muet, les lectures du dépôt filtrant `deletedAt: null`.

### Pourquoi il fallait un cliquet

`Message` a résolu le piège MongoDB de l'égalité nue par la discipline d'ÉCRITURE, là où `Post` l'a résolu par la LECTURE (#19909). La discipline a un nom et un fichier (`services/messaging/liveMessage.ts`) — et elle n'était tenue par **rien** : `liveMessage.test.ts` n'assert que la FORME de la constante, et `deletedAt` est explicitement hors du cliquet `soft-state-equality-filter-guard` (#19748). Ce n'est pas théorique : `liveMessage.ts` dit lui-même que deux créateurs — les messages d'appel de `CallService` — l'avaient PERDU, et `git log -S` date leur réparation du 2026-11-18. Un huitième créateur qui l'oublierait n'allumerait rien.

### Le point qui fait de ce balayage autre chose qu'un `grep`

**Le créateur n'est pas toujours le site d'appel.** `routes/links/messageIdempotency.ts` appelle `prisma.message.create({ data })` sur un `data` qui est un **paramètre** ; la marque est posée par son appelant, `routes/links/messages.ts`, un fichier plus loin. Un balayage qui ne regarde que les sites de `message.create` publierait ce relais comme indécidable pour toujours **et manquerait un second appelant qui oublierait la marque** — le défaut le plus probable, puisque rien n'oblige un nouvel appelant à relire le relais.

Les RELAIS sont donc reconnus (une fonction qui reçoit un `Prisma.Message…CreateInput` et le passe à `message.create`) et ce sont leurs APPELANTS qui sont jugés. C'est « une audience IMBRIQUÉE est une audience » (#20100) appliqué à une écriture : la question n'est pas « qui appelle Prisma ? » mais « qui DÉCIDE de ce qui est écrit ? ».

### `relais` n'est pas une variante d'`indecidable`

Le balayage rend quatre verdicts, et la distinction est portante : `marque` · `nu` · `relais` (ce site REÇOIT son `data`, ses appelants sont jugés à sa place) · `indecidable` (le balayage ne sait pas lire ce `data`, et il le DIT). Fondre `relais` dans `indecidable` transformerait une délégation en dette, et l'inventaire se lirait « on ne sait pas » là où on sait très bien — c'est la leçon des deux inventaires du cliquet de l'audience vivante : « décidé » et « pas encore instruit » ne sont pas la même phrase.

### Ce que le cliquet reconnaît, et ce qu'il refuse de deviner

Deux orthographes de la discipline : `...LIVE_MESSAGE_MARK` répandu, et `deletedAt:` écrit en clair. Un `data` déclaré par un `const` du même fichier est résolu (la forme de `MessageProcessor`). Tout le reste — un appel, un ternaire, un identifiant venu d'ailleurs — est **publié** avec sa raison plutôt que jugé. Les commentaires sont dépouillés avant la recherche, sans quoi le balayage retrouve les commentaires des cycles précédents au lieu des sites.

Mesuré à la pose : **six créateurs, six marqués** ; un site `relais` (l'écrivain idempotent des liens), **zéro nu, zéro indécidable**.

### Ce que ce cliquet NE dit pas

**Rien des lignes déjà en base.** Une passe verte ne dit pas que la population est saine, elle dit que le prochain créateur ne la dégradera pas. Le comptage (`db.Message.countDocuments({ deletedAt: { $exists: false } })`, par `messageType`) et la migration sont l'autre moitié de #20172, ils touchent des données de production, et ils attendent le feu vert du porteur précédé d'une sauvegarde vérifiée.

Et il ne dit rien des LECTURES. Mesuré sans être trié : **183** occurrences du littéral `deletedAt: null` dans la production (tous modèles, écritures ET filtres confondus) et **27** sites portant déjà `unsetOrNull('deletedAt')`. Séparer les lectures sur `Message` des écritures et des autres modèles demande le même genre de scanner que celui-ci — c'est la seconde moitié de #20172, et ce chiffre ne doit pas être cité comme « 183 lectures de `Message` ».
