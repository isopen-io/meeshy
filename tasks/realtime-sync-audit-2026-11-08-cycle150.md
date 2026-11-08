# Cycle 150 — deux lois bien tenues, et ce qui n'était pas écrit dans leur langue

*2026-11-08. Branche `claude/exciting-planck-lnj0k7`, redémarrée depuis `dev`
après la fusion du cycle 149 (PR #17102, `22bf0e635`).*

Les deux constats restants de l'audit du cycle 148 qui étaient ACTIONNABLES sans
décision produit. Ils n'ont rien en commun sur le fond — l'un est une fuite de
confidentialité, l'autre une saturation de la file Prisma — et la même forme :
**une règle du dépôt, bien écrite, bien testée, bien motivée, qui ne couvrait
pas un site parce que ce site n'est pas formulé dans sa langue.**

| lot | issue | ce qui change de comportement |
|---|---|---|
| K | #17076 | `GET …/stats` sert l'agrégat BORNÉ au plancher du lecteur |
| L | #17081 | le lot de mentions ne tient plus que 16 créations en vol |

## Lot K — l'agrégat n'était pas un « message », donc la loi ne l'a pas vu

### Le défaut

`routes/conversations/stats.ts` avait deux gardes : `resolveConversationId`,
puis `canAccessConversation`. Aucune occurrence de `historyFloor`,
`loadReaderHistoryFloor`, ni d'un plancher de rang dans tout le fichier.

Ce qu'il servait, pour toute la vie de la conversation : `totalMessages`,
`totalWords`, `totalCharacters`, `contentTypes`, `hourlyDistribution`,
`languageDistribution`, `dailyActivity` (une ligne par jour) et
`participantStats` — enrichi NOMINALEMENT (`username`, `displayName`, `avatar`)
et portant par personne son volume écrit, son `firstMessageAt` et son
`lastMessageAt`.

Un inscrit entré aujourd'hui par un lien `allowViewHistory: false` a un plancher
d'historique à son arrivée, que le fil, la recherche, les fils de réponses et
les traductions partagées respectent TOUS. Cette porte-ci lui disait quand la
conversation a commencé, qui a écrit combien, et le volume de chaque journée.

**Fuite ACTIVE** : `ConversationAnalysisService.byIdStats` (SDK iOS) et
`ConversationStatsViewModel` (Android) l'appellent.

### Une correction au constat de l'audit

L'issue écrit « `dailyActivity` — une ligne par jour **depuis la création** ».
C'est faux : `pruneDailyActivity` l'élague à 90 jours, sur le chemin de
persistance comme sur le recalcul. La fenêtre réelle de ce champ est donc
trimestrielle, et c'est tout — ce qui ne change pas le verdict (90 jours
d'activité datée restent l'historique qu'on refuse message par message), mais
change ce qu'on peut affirmer. `firstMessageAt`, lui, n'est borné par rien, et
c'est la fuite la plus nette de la charge.

### Pourquoi la loi ne l'avait pas atteint

`services/historyFloor.ts` est une des lois les mieux outillées du dépôt :
forme unitaire, ensembliste, tolérante, fail-closed, et cinq surfaces qui
l'appellent avec leur témoin. **Toutes ses formes rendent un `Date | null`
destiné à un `where.createdAt`, et tous ses appelants sont des requêtes qui
rendent des messages.** Un agrégat précalculé n'a pas de `where` à borner, ne
rend aucune ligne, et ne porte le mot « message » que dans des noms de
compteurs. Un balayage qui demanderait « quelles requêtes de messages oublient
le plancher ? » rend `[]` sur ce site.

### Les deux fausses sorties

**Plafonner.** Servir les totaux en bornant les dates : le lecteur connaît sa
propre fenêtre par construction, donc il déduit l'avant par soustraction. Un
agrégat plafonné ne cache rien à celui qu'il est censé borner — l'issue le disait
déjà.

**Refuser la route.** C'est la sortie du réflexe, et elle coûte la feature à
toute une population. La fenêtre d'un lecteur à plancher EST celle que
`GET …/messages` lui sert déjà : replier l'agrégat dessus ne publie RIEN de neuf.

### L'implémentation, et ses deux pièges

Le PLI vivait MÊLÉ à l'`upsert` de `recompute()`. Extrait pur dans
`services/conversations/messageStatsAggregate.ts` (`foldMessageStats`,
`shapeMessageStats`, `FOLDABLE_MESSAGE_SELECT`,
`aggregateMessageStatsUnderFloor`), il définit une fois ce que chaque compteur
veut dire, pour les deux fenêtres. Le service passe de 588 à 493 lignes.

1. **Emprunter `recompute()` avec une borne** aurait écrit la ligne de TOUS
   depuis la fenêtre d'UN seul, corrompant les compteurs de la conversation au
   premier appel d'un invité. Un témoin assert qu'une lecture planchéisée
   n'appelle ni `upsert` ni `update`.
2. **Ranger un agrégat planchéisé dans le cache existant** (clé :
   `conversationId`) l'aurait servi à toute la conversation — la fuite INVERSE.
   Le second seau est à deux niveaux, conversation → plancher, pour que
   `invalidate` reste en O(1) : une clé composite aurait obligé chaque nouveau
   message à balayer la carte.

Fail-CLOSED, et c'est écrit au site : `loadReaderHistoryFloor` propage, le
`catch` de la route en fait un 500. C'est l'inverse de la posture de
`personalHistoryFilter` (« cacher est une courtoisie, montrer est le produit »),
parce que ce plancher-ci n'est pas une courtoisie.

### Le ré-export qui ne traverse pas un double

En extrayant, j'ai laissé `export { resolveAttachmentType }` chez le service
pour ne pas toucher aux neuf importateurs. **À travers un double
`{...jest.requireActual(module), singleton: {…}}` — le patron que le dépôt
prescrit — ce ré-export se résout en `undefined`.** Le consommateur fait
`mimeTypes.map(resolveAttachmentType)`, donc `map(undefined)` LÈVE, dans un
`try/catch` best-effort dont la seule trace est un `warn` : sept témoins tombés
sur « le compteur n'a pas été débité », à deux fichiers de la cause.

La réparation est de ne PAS réexporter : les trois consommateurs de production
importent la table du module feuille, que personne ne double — donc ils
reçoivent toujours la vraie, ce que les commentaires de ces doubles réclamaient
(« `resolveAttachmentType` reste le VRAI »). Le ré-export promettait ce que seul
le changement d'import garantit.

Note de méthode : ma première sonde faisait `{ ...requireActual(m) }` dans un
fichier où `m` n'était PAS enregistré comme mocké. Elle est passée, et m'a fait
chercher ailleurs. **Une sonde qui ne reproduit pas le RÉGIME du site fautif
répond à une autre question.** C'est l'instrumentation du `catch` qui a nommé la
cause en une ligne.

### Les deux doubles voisins étaient PARTIELS

`conversations/stats.test.ts` et `conversations-stats.test.ts` n'avaient ni
`participant.findFirst` (le plancher) ni `getStatsUnderFloor`. Complétés avec la
raison sur place — et la ligne de participant posée est celle d'un membre NOMMÉ
plutôt qu'un `null`, parce qu'un `null` dirait « ce lecteur n'est pas membre »,
ce que ces témoins contredisent à chaque assertion. **Un double qui répond faux
pour obtenir le bon verdict gèle le verdict, pas la règle.**

## Lot L — la borne était rangée chez le site qui l'avait mesurée

### Le défaut

#10819 a mesuré, borné, documenté et gardé l'éventail `regular` :
`settleWithConcurrency(…, 16, …)`, avec la mesure en doc-comment (370 créations
d'un coup tenaient la file Prisma et la boucle d'événements 10 à 14 s, et TOUTES
les routes attendaient derrière) et un témoin qui compte le pic en vol.

`createMentionNotificationsBatch` était un `Promise.all` NU, jusqu'à
`MAX_MENTIONS_PER_MESSAGE = 50`.

### Pourquoi

Le coût que la borne borne n'est pas dans l'éventail qui l'a mesurée : il est
dans `createNotification` → `computeConversationUnreadBadge`, qui dit son prix
à voix haute — « 2 requêtes + une par conversation NON MUETTE du destinataire ».
La mention le paie à l'identique, plus quatre lectures par destinataire.

Mais la constante portait le nom et l'adresse de l'éventail `new_message`, et
son doc-comment raconte l'histoire d'un incident sur CE site : lue depuis le lot
de mentions, elle ressemble à un réglage interne du voisin. La borne et sa mesure
vivent désormais dans `services/notifications/notificationFanOutBudget.ts`, que
les deux éventails importent — **rangée chez le COÛT, pas chez le symptôme.**

### La seconde moitié, qui ne se mesure pas en requêtes

`Promise.all` REJETTE au premier échec : un seul destinataire en défaut
emportait le lot entier, et avec lui le compte rendu de ceux qui avaient abouti.
`settleWithConcurrency` est `allSettled` par construction, donc le même
remplacement règle les deux. **Quand on remplace une primitive de concurrence,
énumérer ce que l'ancienne décidait d'autre** — on ne vient en général que pour
le débit.

### Le témoin a besoin de cinquante personnes

Une borne de seize ne mord qu'au-delà : un témoin à deux ou trois mentionnés ne
peut PAS tomber, les deux implémentations rendant le même verdict en dessous. Le
témoin NÉGATIF qui l'accompagne (« trois mentionnés partent ensemble ») interdit
qu'on paie la borne en sérialisant les petits lots.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** |
| rouge, lot K | 5 des 7 témoins du nouveau fichier tombent ; les 2 verts sont le témoin négatif et le cliquet d'écriture, qui disent tous deux pourquoi |
| rouge, lot L | les 2 témoins qui MESURENT tombent sous `Promise.all` ; la fenêtre de la borne et le témoin négatif restent verts |
| zone d'impact | 150 suites / 3 394 témoins verts (notifications + messaging + statistiques + pont de conversation) |
| cliquets | `unbounded-findmany-guard`, `gateway-test-file-size-budget`, `detached-promise-catch-sweep`, `tsc-never-loaded-tests-ratchet`, `journal-one-file-per-entry-guard` — verts |
| suite gateway COMPLÈTE | voir le commentaire de clôture de la PR |

## Ce que ce cycle laisse ouvert

- **#17080** — la bannière de réponse / mention d'une conversation E2EE reste
  bloquée sur `🔒💬` : `encryptedContent` ne voyage que sur l'éventail `regular`.
  Pas pris ici : le lot touche la charge push de trois éventails et le décodage
  NSE, donc il demande son propre tour et un audit adversarial.
- **#17075** — « supprimer pour moi » écrit `isActive: false` et n'annonce à
  personne. Étiquetée `décision-produit`, assignée au porteur : ce n'est pas un
  défaut tant que le produit n'a pas dit ce qu'un départ silencieux doit faire
  voir aux autres.
- **Le cliquet `unbounded-findmany-guard` ne balaie que `src/routes`.**
  `aggregateMessageStatsUnderFloor` et `recompute()` lisent tous deux sans
  `take`, bornés par la conversation (et, pour le premier, par le plancher du
  lecteur) — hors de portée du balayage par construction. Constat, pas lot :
  l'élargir est un chantier à soi, avec son propre inventaire gelé.

## Second tour — ce que l'audit adversarial a rendu, et les trois cliquets

Le lot K est passé par `auditeur-adversarial` (lot de contrôle d'accès, directive
2026-10-03) **avant** fusion. Verdict : **BLOQUANT**, en une observation, plus
six constats secondaires. En parallèle, la suite complète a fait rougir **trois**
cliquets que la zone d'impact n'avait pas atteints.

### Le constat bloquant — la PORTE manquait, pas le plancher

Le lien de partage répond à DEUX questions sur la même ligne `Participant` :
**depuis quand** ce lecteur peut lire (`historyFloor.ts`) et **s'il** peut encore
lire (`shareLinkReadGate.ts`). J'ai posé la première. Les quatre surfaces que mon
propre message de commit citait en référence posent les DEUX ; `stats.ts` ne
portait aucune occurrence de `ShareLink`.

Ce qui rend l'écart exploitable est écrit dans `shareLinkGuestsWhere` : la
révocation d'un lien ne touche que les participations ANONYMES. Un INSCRIT admis
par lien n'est jamais révoqué — sa ligne reste active, `canAccessConversation`
l'accepte, et seule la porte par route l'arrête. **Cette surface était donc la
seule que l'expiration ne fermait pas** : elle servait l'activité des jours
POSTÉRIEURS à l'expiration, indéfiniment, à quelqu'un à qui le fil rendait 403.

Et la justification que j'avais écrite pour refuser un refus — « la fenêtre d'un
lecteur à plancher EST celle que `GET …/messages` lui sert déjà » — était fausse
pour exactement cette population.

### Le témoin ne mesurait pas ce qu'il disait

Sa fixture portait `historyVisibleFrom: FLOOR`, le rang (iii) de
`settleBeforeLink`, qui tranche AVANT toute lecture de lien. La branche
`link-decides` — `shareLinkId` + `allowViewHistory: false`, **exactement la
population de l'issue** — n'était exercée par aucun des sept témoins, et le
double de `conversationShareLink.findUnique` était du code inatteignable.

Sept témoins deviennent **quatorze** : lien échu, octroi par date, bypass de
plateforme (#3892/#11217), droit figé dans les deux sens, masquage personnel,
recollement de pages, fenêtre vide.

### Le pli n'était pas borné, et ma comparaison de coût était fausse

Le doc-comment adossait le coût à `GET …/messages`. Vrai du DROIT, **faux du
COÛT** : la liste est paginée (`maxLimit = 50`), elle ne matérialise jamais la
fenêtre. Un lecteur entré il y a deux ans faisait charger le `content` et les
pièces jointes de tout ce qui a été écrit depuis. Le pli avance désormais par
curseur d'`id` — pas de `createdAt`, qui n'est pas unique — et ne retient que les
compteurs ; `mergeFoldedStats` dit champ par champ comment il recolle, parce
qu'un recollement faux rend un nombre PLAUSIBLE.

### Les trois cliquets, et ce qu'ils ont trouvé que l'audit n'avait pas dit

| cliquet | ce qu'il a exigé |
|---|---|
| `orphaned-sender-repair-surface-guard` | déclarer la nouvelle lecture de `Message` : `applies 2/1`, parce que réparer est une ÉCRITURE et que la fenêtre d'un lecteur n'écrit rien |
| `personal-history-hiding-surface-guard` | la même, et son exemption d'avant (« une valeur stockée une fois et lue par tout le monde ») est devenue à moitié fausse : une des deux lectures est désormais PAR LECTEUR |
| `gateway-test-file-size-budget` | deux fichiers déjà hors budget ou au plafond — et c'est lui qui a pointé un défaut de COHÉSION que je n'avais pas vu |

Le dernier mérite d'être raconté : ne pouvant pas grossir le fichier du cliquet
voisin pour y écrire ma déclaration, j'ai cherché où elle devait vraiment aller.
La réponse était que la **LECTURE** n'était pas au bon endroit — j'avais mis un
`findMany` dans un module dont le doc-comment déclare qu'il ne connaît « ni
prisma, ni cache, ni horloge ». Elle vit maintenant chez le service, qui possède
déjà les lectures et le cache ; le module du pli est pur de nouveau.

### Les deux autres corrections du tour

- **Le masquage PERSONNEL s'applique à la fenêtre par lecteur**, et il entre dans
  la CLÉ de cache : deux lecteurs au même plancher masquent des choses
  différentes, et une clé qui ne nommait que le plancher leur aurait servi
  l'agrégat l'un de l'autre.
- **Le seau planchéisé est borné (32 fenêtres) et `recompute()` le vide.** Sans
  plafond, une conversation sans nouveau message gardait une entrée par fenêtre
  pour la vie du processus ; sans l'invalidation, un recalcul de maintenance
  laissait compter cinq minutes de plus des messages qu'il venait de retirer. Le
  doc-comment affirmait l'inverse.

### Ce que l'audit a trouvé et que ce lot NE prend PAS

- **#17139** — deux listes (`loadMostActiveParticipants`, les suggestions de
  mention) CLASSENT leurs membres sur l'agrégat non planchéisé. Un ordre révèle
  autant que le champ, le dépôt l'a déjà tranché pour la présence. Hors des
  fichiers de ce lot, et un correctif d'ORDRE est une décision par surface.
- **#17140** — un `shareLinkId` dont la ligne de lien a DISPARU rend « aucun
  plancher », et la purge d'un compte en fabrique (elle supprime le lien et ne
  révoque que les anonymes). Fail-OPEN **décisionnel**, cohérent avec les cinq
  autres surfaces, mais présenté comme fail-closed : la décision touche six
  lectures à la fois, plus la révocation.

### Preuve du second tour

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** |
| rouge, la porte | sans elle, « un lien ÉCHU ferme la route » tombe **seul** — les 13 autres restent verts, ce qui montre que la porte est la seule chose qui manquait |
| zone d'impact | 134 suites / 3 302 témoins verts |
| trois cliquets | verts, par DÉCLARATION raisonnée (deux) et par correction de cohésion (un) |
| suite gateway COMPLÈTE, arbre fusionné `aeb9a0c4c` | **2 583 suites / 40 310 témoins, 6 rouges** — les six suites de codecs d'image déjà rouges sur `dev`, hors du diff |

> **Un inventaire gelé est un auditeur qui ne dort pas.** Il ne sait pas ce que
> le lot voulait faire — il sait qu'une lecture de plus est apparue, et il exige
> qu'on dise quelle règle de la maison elle applique, ou pourquoi elle en est
> exemptée. C'est la forme la moins chère d'une revue adversariale, et elle
> tourne à chaque suite.
