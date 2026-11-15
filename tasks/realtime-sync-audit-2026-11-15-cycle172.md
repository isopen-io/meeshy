# Cycle 172 — deux files là où deux doc-comments juraient qu'il n'y en avait qu'une

*2026-11-15. Branche `claude/exciting-planck-kexumt`, dans la continuité des
cycles 170 et 171.*

**Livré** : #18616 — le pipeline média prend la file de remise du PROCESSUS.

---

## Le défaut

`server.ts` construit la file et DÉCLARE son unicité sur place :

> « l'instance VIVANTE est celle-ci … donc **la seule dont la tranche MÉMOIRE
> porte des entrées de message**. »

`delivery-queue-registry.ts` le redit. **Les deux disaient faux.**
`MeeshySocketIOHandler.startMediaPipelines` en construisait une SECONDE, remise
aux quatre déclencheurs d'`emitAttachmentUpdated`.

La tranche **Redis** est partagée : rien n'y cassait. La tranche **MÉMOIRE** est
par instance, et sur la seconde aucune des trois méthodes qui la gouvernent
n'était jamais appelée :

| méthode | qui l'appelle | conséquence |
|---|---|---|
| `drain()` | le drain, sur celle du manager | une entrée tombée en mémoire pendant un hoquet Redis n'est **jamais livrée** — le destinataire garde définitivement le vocal NON enrichi, la panne même qu'`emitAttachmentUpdated` existe pour empêcher |
| `purgeMessage()` | les sites de destruction, par le REGISTRE | `'attachment-updated'` porte du TEXTE : la transcription d'un message brûlé **survit** dans cette tranche de tas |
| `cleanup()` | le job, sur l'instance enregistrée | aucun balayage de TTL |

**Pourquoi la forme est la plus coûteuse** : les deux doc-comments sont à
l'endroit exact où l'on irait vérifier. Qui lit `server.ts:273` conclut que la
purge est complète.

## Ce qui a produit la seconde instance, et ce qui la rend inutile

Une contrainte d'ORDRE, presque sûrement : `setupSocketIO()` — donc le démarrage
du pipeline média — court APRÈS `setSharedDeliveryQueue`, mais le CONSTRUCTEUR
du handler court avant. Qui résout à la construction ne trouve rien, et
construit. Qui résout au démarrage du pipeline trouve l'instance du processus.

Le correctif est donc moins un changement d'objet qu'un changement de MOMENT.

## Ce que le lot a dû extraire pour être prouvable

La composition vivait en ligne dans une méthode privée : le seul témoin possible
de sa forme était un `grep` — une lecture de TEXTE, qui reste verte quand le
comportement disparaît. Elle vit désormais dans `socketio/mediaPipelineDeps.ts`,
sur le patron de `database-bootstrap.ts` et pour la raison que celui-ci écrit.
Ses types viennent de `MediaReadyListenerDeps`, pas d'`unknown` : la composition
reste gardée par le compilateur, qui est la moitié de la preuve.

## Mutation, et celle qui a SURVÉCU

| # | mutation | témoins tombés |
|---|---|---|
| Q1 | le pipeline reconstruit sa file, par `require` inline | **0 — survit** |
| Q1b | le pipeline reconstruit sa file, forme RÉELLE | 2 |
| Q2 | la file remise est toujours `null` | 1 |
| Q3 | l'accesseur rend n'importe quel objet enregistré | 1 |

**Q1 est la mesure la plus utile du lot.** Le cliquet d'instances lit une FORME
DE TEXTE (`new RedisDeliveryQueue(`) ; une construction INDIRECTE passe sans le
faire rougir. Ce n'est pas un oubli réparable en élargissant l'expression — un
balayage statique ne suit pas une indirection. La bonne réponse n'était pas de
prétendre le contraire mais de **borner la portée du cliquet dans son propre
doc-comment**, et d'avoir une seconde moitié qui ne dépende pas du texte :
`mediaPipelineDeps.test.ts` mesure l'IDENTITÉ de l'objet remis, donc tombe sur
n'importe quelle façon d'en fabriquer un autre.

Q2 est l'autre garde essentielle : le cliquet d'instances seul serait
intégralement satisfait par `deliveryQueue: null`, qui couperait en silence tout
rejeu hors ligne de `message:attachment-updated` — le correctif trop large dans
sa forme la plus discrète.

## Preuve

- `src/socketio`, `src/__tests__/unit/services` et les deux cliquets de budget :
  14 951 témoins verts ; les 2 rouges sont environnementaux (`heif-convert`
  absent) et tombent à l'identique sur l'arbre stashé.
- `tsc --noEmit` EXIT=0.
