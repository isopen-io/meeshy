# Cycle 185 — un tri qui se croyait clos en avait manqué quatre, dont l'export RGPD

*2026-11-19, à la suite du cycle 184 (#19802, fusionné dans `dev` par `b9525b350e`).
Branche `claude/exciting-planck-loe3fu`. Livre **#19909** (l'export RGPD) et la
moitié `PostComment` de **#19803**. Ouvre **#19910** et y RENVOIE l'autre moitié.*

---

## Ce que ce lot n'est plus

Il avait été instruit comme « les DEUX derniers `deletedAt: null` du tri de #19748 :
le fermer permet de fermer #19748 ». Les deux affirmations étaient fausses, et c'est
l'audit adversarial du lot qui l'a mesuré :

| ce que le lot affirmait | ce qui est vrai |
|---|---|
| il en reste **deux** | il en restait **cinq** |
| `story-comment.ts` est le **seul** site du dépôt à lire cette colonne par une égalité | trois autres, sur les mêmes modèles, dans `routes/me/export-sections.ts` |
| **105** voisines passent par `NOT_DELETED` | **103**, tous modèles confondus |
| fermer ce lot ferme #19748 | **#19748 n'est pas clos**, et son compte ne doit pas être réhérité |

La phrase fausse était écrite à **quatre endroits** — commentaire de production,
en-tête du témoin, corps de #19803, journal — et un seul d'entre eux a été
instruit. Les trois autres l'ont recopiée.

> **Un tri est une AFFIRMATION, et le tri qui prétend clore la classe est celui
> qu'on vérifie le moins.** Le dépôt a déjà la leçon pour un compte (cycle 93) et
> pour un ordre (cycle 86 bis). Ici l'affirmation portait sur l'EXHAUSTIVITÉ
> — « ce sont les sites où la règle s'applique » — qui est la moitié d'un
> inventaire que presque personne ne vérifie (leçon 261). Je l'ai recopiée
> depuis #19748 sans la remesurer, alors que la remesure est un `grep`.

## Le défaut que la remesure a rendu : l'export RGPD servait vide

`routes/me/export-sections.ts` portait trois égalités nues sur `Post` et
`PostComment`, dont **aucun** des quatre créateurs n'écrit la colonne
(`PostService` — création et les deux reposts — et `PostCommentService.create`) :

| ligne | fonction | ce qui n'était jamais rendu |
|---|---|---|
| 69 | `exportPosts` | tous les posts et tous les reels |
| 87 | `exportStories` | toutes les stories et tous les statuts |
| 105 | `exportComments` | tous les commentaires |

**`GET /api/v1/me/export`** — `description: 'Export user data (GDPR data
portability)'`, `tags: ['me','gdpr']` — rendait donc zéro publication pour tout
compte. Droit d'accès et de portabilité (RGPD art. 15 et 20).

> **Et le `total` est la moitié qui rend le défaut invisible.** Le `where` est
> partagé par `findMany` ET `count`, donc l'archive servait `items: []` AVEC
> `total: 0` : elle ne se présentait pas comme tronquée mais comme « vous n'avez
> rien publié » — indistinguable d'un compte vide. C'est « la liste vide est plus
> dangereuse que la réponse vide » (`services/gateway/CLAUDE.md`), portée d'un
> écran d'administration à une obligation légale. Un témoin qui n'assert que
> `items` laisse passer exactement ce qui tenait le défaut en vie.

## Pourquoi le site du talkie est SORTI du lot

C'est le constat le plus coûteux de l'audit, et il ne se corrige pas en changeant
l'ordre de fusion.

`mostRecentSharedConversation` (`services/talkie/talkieFallback.ts`) porte la même
égalité nue, et le repli ne rend donc jamais rien. Tant qu'il ne rend rien,
`withFallbackConversation` ne pose aucun `conversationId` sur l'accusé et **le
client choisit seul**, en appliquant sa propre règle d'admission.

> **Réparer ce filtre ne « rallume » pas un chemin : il TRANSFÈRE la décision du
> client au serveur.** Et le `where` du serveur n'applique pas les restrictions
> que **son propre doc-comment déclare** : « une copie n'atterrit ni dans une
> communauté » — alors que `communityId` n'est filtré nulle part, et que
> `routes/communities/core.ts:815` rattache une conversation existante à une
> communauté *sans toucher son `type`*. Il manque aussi
> `isAnnouncementChannel`, `defaultWriteRole` et `deletedForMe`, que le client,
> lui, exclut.

Et les trois clients ne vérifient rien de ce que le serveur nomme — iOS
(`TalkieVoiceCopy.swift:194`) et Android prennent l'id servi tel quel ; le web ne
contrôle que le registre E2EE. Les trois miroirs de la règle d'admission sont donc
court-circuités dès que le serveur nomme quelque chose. L'envoi serait ensuite
**refusé** par `admitConversationWrite`, qui lit exactement
`isAnnouncementChannel` puis `defaultWriteRole` : la copie vocale est perdue, et
sur Android une bulle optimiste a déjà été peinte dans le salon.

C'est la leçon 124 du dépôt, littéralement : *un champ de service qui DÉCLARE une
restriction ne la fait pas respecter*. La restriction était inoffensive **parce
que** le filtre ne appariait rien. Le lot qui répare le filtre est celui qui doit
la rendre vraie → **#19910**.

## Ce que l'ordonnancement ne résout pas, et je l'avais cru

J'avais conclu « #19901 d'abord, le mien ensuite », en croyant que le lot du rang
rendrait le chemin vivant. **Faux** : #19901 garde `deletedAt: null`
(vérifié ligne à ligne). L'interrupteur est le correctif de FILTRE, quel que soit
l'ordre — donc tout ce qui précède atterrit avec lui et avec aucun autre lot.
L'ordre reste **nécessaire** (sinon le serveur nomme par `lastMessageAt` seul quand
le client élit par le rang, #19834) mais il n'est pas **suffisant**.

> **Un ordonnancement ne referme que les conséquences qui dépendent de l'ordre.**
> Je l'avais présenté comme la réponse au risque entier ; il n'en couvrait qu'un
> quart, et le moins grave.

## La collision, et ce qu'elle a coûté

PR #19901 (poussée 1 h 34 avant la mienne) réécrit la même fonction pour #19834 sur
cinq surfaces, derrière un helper partagé `highestRanked.ts`. J'ai **cédé le rang** :
elle a poussé d'abord, elle est plus large, et son audit a trouvé un risque que ma
version n'affronte pas par chance plutôt que par conception — deux lectures
concurrentes ne partagent aucun instantané, d'où l'exigence de résoudre le régime
chiffré AVANT le rang. Son audit avait de plus trouvé mon propre défaut et l'avait
classé en suivi (#19905) au lieu de le corriger.

Un point mesuré à verser à #19904 (« les deux lecteurs de rang divergent ») : sur
**ce** site l'ensemble candidat est déjà borné par les conversations partagées de la
paire, donc un `findMany` + `listRankFromColumns` suffit en **une** lecture là où les
deux flux en coûtent deux — et une lecture unique ne peut pas rencontrer le risque
ci-dessus. Ce n'est pas un reproche au helper, dont la machinerie existe pour trier
une collection entière : c'est une entrée pour l'arbitrage du jour où l'on choisira
le site unique.

## Quatre témoins de production qui attestaient le défaut

C'est la part la plus instructive, et elle s'est reproduite **dans ce lot même**.

1. **`export-sections.test.ts` × 3** — `toHaveBeenCalledWith(objectContaining({ where: { …, deletedAt: null } }))`,
   dont un sous le titre **« excludes soft-deleted »** alors que la clause qu'il
   épinglait excluait TOUT. Ils recopiaient la clause, donc ils ne vérifiaient que
   leur propre copie. Ils attendent désormais `NOT_DELETED` **importé de la
   production** : l'attendu ne peut plus dériver du site.
2. **`NotificationService.storycomments`** — même forme, corrigée dans ce lot.
3. **Et mes propres témoins, première rédaction.** Je ne gardais `story-comment.ts`
   que par un `readFileSync` + `toContain('deletedAt: NOT_DELETED')` et par un
   `matchesMongoWhere` contre une clause **réécrite à la main**. Aucun des deux
   n'appelle la fonction, donc aucun ne peut dire qu'un commentateur est prévenu.
   L'audit les a refusés, et il avait raison : c'est la famille que ce lot dénonce
   par ailleurs, commise à son propre site.

> **Écrire la leçon ne protège pas de la commettre.** « Un témoin qui recopie la
> clause ne vérifie que sa propre copie » est la phrase de ce lot, et ce lot l'a
> enfreinte sur le site qu'il réparait. La règle utile n'est pas l'énoncé mais la
> question mécanique : *ce témoin APPELLE-t-il la fonction ?*

Le témoin de remplacement appelle `getStoryNotificationRecipients` et assert sur
`previousCommenterIds`. Son double modélise `distinct` explicitement, parce que
`findManyIn` le REJETTE — et c'est le bon comportement d'un double qui ne sait pas :
on modélise, on ne retire pas la clé pour faire passer.

## Preuve

- **RED par mutation** : l'égalité nue rendue aux quatre sites ⇒ **9 témoins sur 11
  tombent** ; les 2 qui tiennent sont les discriminants `matchesMongoWhere` nus, qui
  n'appellent pas la production et ne doivent donc pas bouger ;
- **79 suites / 1255 témoins verts** sur les notifications, les routes `me`, l'export,
  le cliquet de soft-state et les deux gardes CI que `dev` vient de changer ;
- **8 suites talkie / 187 verts** après retour du site à l'état de `dev` ;
- `tsc --noEmit` sur `services/gateway` : **EXIT=0** ;
- `dev` (`1c183a31cd`) fusionnée dans la branche, gates rejoués sur l'arbre fusionné.

## Ce qui n'a pas été mesuré, et ne doit pas se lire comme vert

- **#19907 reste ouverte** : la sémantique de `NOT` sur une condition COMPOSÉE contre
  un vrai MongoDB. L'audit a confirmé qu'elle n'est pas mesurable ici — `docker`
  existe, le démon n'est pas joignable, aucun `mongod`. Elle ne touche plus ce lot
  (elle vivait sur le site du talkie), et **#19910 la rend sans objet pour ce
  site** en passant à `SERVER_READABLE_REGIME_FILTER`, l'inverse POSITIF que la
  jumelle `directPair.ts:65` emploie déjà pour cette question exacte.
- **La rafale que l'éventail de story met en service.** Jusqu'à `FANOUT_ROW_CAP + 1`
  = 501 commentateurs distincts entrent désormais dans `previousCommenterIds`, et le
  filtrage d'audience et de blocage est APRÈS la requête. Le premier commentaire neuf
  sur un fil ancien très commenté prévient d'un coup tout son historique. Mon
  journal précédent classait l'arriéré « sans objet, ce sont des LECTURES » : vrai
  des lignes en base, **faux de la rafale de notifications**. Ni le p95 de l'éventail
  ni le coût de `resolveRecipientLangs` sur ~1000 ids ne sont mesurés.
- **Le volume des exports concernés** : aucun compte de lignes de production n'est
  possible depuis ce conteneur.
- **Les dix sites `Post` / `PostComment` restants**, que le tri de #19748 n'a pas
  ouverts : `services/posts/{postMentions,postIncludes,postCounters,directContactVisibility,soundFormats}.ts`,
  `services/ExpiredStoriesCleanupService.ts`, `services/engagement/engagementAxisHistory.ts`,
  `routes/admin/{posts,post-gestures,user-publications,content}.ts`. Ils sont nommés
  dans #19909 et s'ouvrent un par un — pas par un verdict global.
