# Audit de synchronisation temps réel — cycle 147 (2026-11-08)

Branche `claude/exciting-planck-qj0mxr`, partie de `origin/dev` à `3fc6ed3bd`
(cycle 146 entièrement fusionné).

Le cycle a pris **les cinq suivis déclarés du cycle 146** plutôt que de rouvrir
une recherche, puis **cinq constats d'audit adversarial** sur les deux
périmètres qui restaient à balayer. Deux rouges de `dev` ont été réparés en
chemin.

## Ce qui a été livré

| lot | issue | ce qui changeait de comportement |
|---|---|---|
| A | #16961 | l'accusé de REMISE décrit le message acquitté, pas le dernier du fil |
| B | #16964 | `restore-for-me` d'une conversation rebranche les sockets du compte |
| C | #16965 | une lecture de plan signé qui tombe ne fait plus disparaître l'édition des pairs EN LIGNE |
| D | audit | une socket qui ne sait pas quelles rooms elle a manquées le DIT |
| F | audit | une entrée de file dont la date est illisible expire enfin |
| G | audit | le texte d'une édition ne part qu'à ceux qui ont le droit de LIRE le message |

Les lots sont nommés A à G sans E : le constat qui aurait été E — l'accusé de
remise du DRAIN, cinquième émetteur de `read-status:updated` — vit dans
`MeeshySocketIOManager.ts`, 3 688 lignes, hors budget. Il part en issue
(#17027) parce qu'il faut extraire avant d'ajouter, et que l'extraction d'un
fichier de cette taille est un lot à elle seule.

## La leçon de forme du cycle : un cliquet qui rougit sur un lot juste

Elle était déjà écrite au cycle 146 (« un cliquet qui rougit sur un lot JUSTE
n'est pas un faux positif : c'est une question qu'il pose »). Le cycle 147 l'a
vécue **quatre fois**, et chaque réponse a ajouté au dépôt ce qu'aucun des lots
n'aurait écrit de lui-même.

1. **Le lot A a fait rougir `delivery-receipt.test.ts`** — zéro émission là où il
   en attendait une. La question qu'il posait : *et si le moteur par message ne
   répond pas ?* Réponse : `getConversationReadStatuses` journalise et RELÈVE, la
   levée remonte au `try` best-effort de l'appelant qui la journalise et passe,
   donc **aucun** `read-status:updated` ne part. Le défaut PRÉEXISTAIT au lot,
   sur `read`, depuis G-5 (#7347) — il n'avait simplement aucun témoin. Fermé
   pour les deux, avec la table des trois issues.

2. **Les deux balayages de réintégration ont rougi sur une EXTRACTION.** Ils
   énumèrent leurs sites par CHEMIN de fichier, et le noyau du geste venait de
   déménager. C'est leur rôle : ils ont forcé la déclaration du nouveau chemin
   et, pour celui de #16964, de sa DÉLÉGATION — plus la vérification que l'unité
   déléguée appelle bien le verbe, sans quoi une délégation déclarée vers un
   module qui ne rebranche rien serait une exemption déguisée.

3. **Les deux cliquets de budget de taille ont rougi sur mes doc-comments.**
   Trois fichiers étaient à 999, 999 et 995 lignes — le dépôt les y avait tenus
   délibérément. La réponse n'était pas de raccourcir la prose jusqu'à ce que ça
   passe : c'était d'EXTRAIRE, ce que la règle ordonne (« ajouter à un fichier
   déjà hors budget est interdit : on extrait d'abord, on ajoute ensuite »).
   Trois modules en sont sortis, chacun portant une responsabilité qui n'avait
   pas de maison : le noyau du geste de restauration (jumeau de
   `performConversationDeleteForMe`), les deux fonctions de jonction de rooms, et
   l'unité de rebranchement avec ses deux règles d'emploi.

4. **Le lot G a fait rougir HUIT témoins préexistants**, tous sur le même motif :
   leur double Prisma rendait une liste FIXE de participants au lieu d'évaluer le
   `where`. La réparation est de COMPLÉTER le double — jamais d'affaiblir la
   production — et c'est le troisième exemplaire documenté de « un double partiel
   ne se signale qu'au moment où le module grandit ».

> **Corollaire qui n'était pas écrit : un cliquet de BUDGET ne pose pas la même
> question qu'un cliquet de comportement.** Les trois autres demandaient « ton
> lot est-il juste ? ». Celui-là demande « ton lot est-il à sa PLACE ? », et la
> bonne réponse n'est presque jamais dans le lot — elle est dans le fichier
> d'à côté qui n'existe pas encore.

## Lot A — l'accusé de remise nomme le message acquitté (#16961)

`broadcastReadStatus` sait servir un résumé EXACT par message depuis G-5, et ne
le faisait que pour `read` : `receipts.ts` ne lui passait `messageIds` que dans
ce cas, et son repli agrégé décrit alors le dernier message non supprimé de la
conversation. **L'ÉCRITURE était pourtant déjà par message** — `markFor` boucle
sur le lot vetté pour `delivered`. Seule la DIFFUSION nommait autre chose que ce
qu'on venait d'acquitter.

Le ✓✓ de l'expéditeur ne bougeait donc JAMAIS en direct dès que le message
acquitté n'était pas le dernier du fil — c'est-à-dire chaque fois que plusieurs
messages arrivent pendant que le destinataire est hors ligne, le cas même que
l'extension de notification iOS produit, un reçu par push reçu.

**Le champ ne regarde plus le `type`, et c'est le déplacement d'un étage.** Ce
qu'il veut dire est « le lot exact que cette écriture a figé », et le site qui a
COMPOSÉ l'écriture est le seul à le savoir. `received` garde donc son repli
agrégé — son écriture avance un curseur sur TOUT le préfixe du fil — et c'est
écrit comme une décision, avec sa table, là où le report d'avant vivait dans un
doc-comment incapable de rougir.

Un témoin existant gelait ce report (« la forme par message reste réservée à
`read` »). Il n'est pas supprimé mais RE-POINTÉ sur la propriété de l'unité, et
la décision est gardée là où elle vit désormais, au site d'appel.

## Lot B — restaurer une conversation rebranche ses sockets (#16964)

La moitié qui RETIRE les sockets est explicite : `delete-for-me` appelle
`endConversationMembership`, qui sort toutes les sockets du compte de
`conversation:<id>`. Celle qui les remet n'existait pas. L'appareil restait dans
l'état que `participant-ban-core.ts` décrit déjà pour sa jumelle le
débannissement : `connectedUsers` le rapporte EN LIGNE, donc tout expéditeur
saute la file de remise hors ligne pour lui, pendant qu'aucun événement de room
ne l'atteint. Rien ne rejoue.

PIÈGE ARMÉ, traité comme tel (règle du cycle 84) : aucun client n'appelle encore
cette route, iOS écoute pourtant déjà `conversation:restored`.

**Et le défaut avait une FORME, donc un cliquet.** Quatre des cinq portes qui
rallument une participation rebranchaient ; `restore-for-me` était la cinquième.
Le nouveau balayage reprend l'inventaire de sites du balayage frère (#10436)
pour une AUTRE propriété — « l'appareil réintégré reçoit-il encore les
événements du fil ? » — inventaire d'exemptions VIDE.

> La raison pour laquelle la question ne se répond pas au site : **l'éviction
> est partagée et explicite, la réintégration ne l'est pas.** Quatre portes
> rebranchent chacune chez elle ; une cinquième pouvait l'oublier sans qu'aucun
> témoin ne tombe, parce que le symptôme est une ABSENCE d'événement.

## Lot C — une lecture qui tombe et les pairs EN LIGNE (#16965)

Le lot ne choisit AUCUNE des deux branches que l'issue proposait, et c'est le
résultat le plus utile : la question « silence ou adresses nues ? » confondait
DEUX lectures sous un seul `try`, dont une seule a besoin d'être arbitrée.

- **La PROTECTION** (`message.findUnique`) est RÉCUPÉRABLE, et le module porte
  déjà sa valeur fail-closed : `protection: row ?? {}`, sous « une ligne
  introuvable ne prouve pas l'ordinaire — la loi ferme, la pièce est signée ».
  **Une lecture qui LÈVE prouve encore MOINS qu'une ligne absente** : elle
  mérite au moins le même traitement.
- **Les DESTINATAIRES** n'ont aucun repli : sans eux on n'adresse personne, et
  `carriesReaderBoundAttachment` a DÉJÀ répondu que la pièce est liée au
  lecteur. Retomber sur la room servirait l'adresse nue d'une pièce établie
  comme protégée.

Le correctif vit dans `readerSignedPlanForMessageId`, donc il sert ses QUATRE
appelants, pas le seul site du constat.

## Lot D — `[]` affirme, `undefined` avoue

#16687 avait fermé l'échec d'une JONCTION de room et laissé ouvert, juste à
côté, l'échec de la LECTURE qui la précède — le seul `throw` que le `try` de
`_joinUserConversations` puisse attraper, `Promise.allSettled` ne rejetant pas.
Son `catch` rendait `[]`, qui AFFIRME « aucune room n'a échoué » quand la vérité
est « je n'ai rejoint AUCUNE room, et je ne sais même pas lesquelles ».

La socket entrait dans `connectedUsers` sans marqueur, dans zéro room : la file
la tenait pour joignable et n'enfilait RIEN, pendant qu'aucune diffusion de room
ne l'atteignait. **Pour toute la vie de cette socket, et sans recours** — ce qui
n'est pas enfilé n'existe nulle part à la reconnexion suivante.

**La jumelle portait déjà la leçon, mot pour mot** (`participant-superset.ts`) :
« Elle rend `undefined` — jamais `[]` — quand elle tombe. » Elle n'avait pas été
portée ici. La porte était refermée pour l'échec d'une room et rouverte en grand
pour l'échec de la lecture.

Un ensemble de rooms ne peut pas exprimer « toutes, dont j'ignore la liste » :
c'est un drapeau qui le dit. Et la porte INVITÉE n'a pas de branche `undefined`
— elle n'a aucune lecture à faire tomber — ce qui est écrit sur place, parce
qu'une asymétrie non expliquée se relit comme un oubli.

## Lot F — une date illisible n'expirait jamais

`cleanup()` lisait `new Date(parsed.enqueuedAt).getTime() <= cutoff`. Sur une
date informe, `NaN <= cutoff` est FALSE : l'entrée était jugée FRAÎCHE, et le
restait à chaque passage. Aucun des trois filets ne la rattrapait — le TTL de la
clé est rejoué à chaque enfilage, le drain exige une reconnexion, la purge par
message exige un index qui expire lui aussi. **`cleanup()` est le seul qui
tourne tout seul, et c'est lui qui fail-OPEN.**

Ce que ça coûtait : le CLAIR d'un message pouvait rester dans Redis, et dans ses
sauvegardes AOF, au-delà des 48 h que le doc-comment d'`isTextBearingCopyOf`
revendique comme borne.

> **L'incohérence était INTERNE au module, et c'est ce qui la rend
> actionnable.** Ses deux autres lecteurs de la même valeur traitent le cas
> explicitement, et à l'OPPOSÉ l'un de l'autre — `enqueuedAtMillis` RANGE,
> `isStillLive` FERME. Les deux ont raison : le tri décide d'un ORDRE dans un
> drain qui a lieu maintenant, l'échéance décide d'une BORNE. Une entrée dont on
> ne peut pas montrer qu'elle est dans la fenêtre ne peut pas servir d'appui à
> une affirmation de borne.

Et une ligne non-JSON était DÉJÀ jetée : garder une ligne JSON dont la date ne
se lit pas traitait **la plus lisible des deux avec plus d'indulgence.**

Les deux jumelles ont été cherchées dans le même lot, et trouvées : le repli
mémoire (qui rendait le bon verdict **par accident de la négation**) et
l'éviction par capacité (dont le comparateur rendait `NaN`, donc un ordre
INDÉFINI — on évinçait une entrée arbitraire, dont la plus fraîche). Le
commentaire de production nommait DÉJÀ cette seconde divergence comme celle que
`byEnqueuedAt` avait fermée pour le drain, sans jamais partager son helper.

## Lot G — le texte d'une édition et le plancher d'historique

Le constat le plus grave du cycle. `message:edited` partait à la room entière
avec le texte APRÈS édition, sans regarder le plancher de personne : un invité
entré par un lien `allowViewHistory: false` recevait le texte intégral d'un
message que cinq routes lui refusent toutes. Permanent, et persisté 48 h dans
Redis sous sa clé.

**La loi existait, et gouvernait trois autres sorties.** Le plus net :
`broadcastMessageMutation` appelle `emitConversationPreviewUpdate` quinze lignes
plus bas — elle retenait l'APERÇU du message pour ce lecteur juste après lui
avoir donné le message.

> C'est la leçon 275 **inversée**. Elle dit « la charge que ce site remet
> contient-elle autre chose que ce que je viens de garder ? ». Ici la garde
> était sur l'objet VOISIN (l'aperçu) et la fuite sur l'objet PRINCIPAL. La
> question se pose donc dans les deux sens : *qu'est-ce qui part à côté de ce
> que je garde ?* et *qu'est-ce que je garde à côté de ce qui part ?*

Les trois chemins d'émission sont gardés, pas le plus fréquenté — y compris la
boucle du plan signé, qui s'autorise sur l'admission de LECTURE DE FICHIER
(actif, non banni, lien non échu) et ne regarde **ni `joinedAt` ni
`historyVisibleFrom`** : une admission n'en vaut pas une autre.

Et la discipline du lot C a resservi : la DATE du message est récupérable
(`null` est une valeur que la loi traite), la LOI elle-même ne l'est pas — d'où
un troisième état où l'on se tait sur les DEUX canaux. Entre une remise perdue
et un contenu persisté 48 h chez qui n'y a pas droit, le lot choisit la
première, et l'écrit.

## Un défaut introduit et corrigé dans le cycle

Au lot D, j'ai hissé `connectedUsers.get(queueKey)` **au-dessus** du
court-circuit `connectedUsers.has(queueKey)`, pour éviter deux appels. L'ordre
faisait partie du contrat : un appelant peut passer une carte dont `get` n'est
pas appelable pour une clé absente, et **le scellement au repos de toute la file
est tombé** le temps d'une révision. Deux suites l'ont attrapé.

> **Une micro-optimisation qui déplace un appel déplace aussi la garde que son
> ordre portait.** Le court-circuit d'un `&&` n'est pas une commodité de style :
> c'est une précondition, et elle est invisible parce qu'elle n'a pas de nom.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0**, 0 ligne (lu hors pipe) |
| suite gateway COMPLÈTE | voir le commentaire de clôture — seules les 6 suites de codecs d'image restent rouges |
| rouges à l'arrivée | **8** : les 6 de codecs + les 2 cliquets de surface laissés rouges par #16574 |
| rouges au départ | **6** : les 2 cliquets de surface sont réparés |
| rouge, lot A | 2 des 4 témoins tombent ; les 2 autres verts des deux côtés |
| rouge, lot B | 1 des 4 tombe ; les 3 négatifs verts des deux côtés |
| rouge, cliquet de B | 2 des 4 tombent ; les 2 qui prouvent le non-vide restent verts |
| rouge, lot C | 2 des 5 tombent ; les 3 autres verts des deux côtés |
| rouge, lot D | 1 des 6 témoins d'`AuthHandler` tombe, **et** le témoin de la file côté CONSOMMATEUR |
| rouge, lot F | 2 des 3 tombent ; le troisième garde une non-régression accidentelle, et le dit |
| rouge, lot G | 3 des 6 tombent ; les 3 autres (nominal, lien ouvert, l'auteur) verts des deux côtés |
| budgets | sources ET suites verts, après trois extractions |

Le cycle rend donc `dev` **moins rouge qu'il ne l'a trouvé**, comme le 146.

## Trois extractions, et pourquoi elles comptent

Elles n'étaient pas au programme : les cliquets de budget les ont exigées. Mais
chacune a donné une maison à une responsabilité qui n'en avait pas, et deux ont
retiré un inventaire tenu à la main :

- `routes/conversations/restore-for-me.ts` — le noyau du geste, jumeau de
  `performConversationDeleteForMe` ; `user-deletions.ts` passe de 999 à 895 ;
- `socketio/handlers/join-user-conversations.ts` — les deux fonctions de
  jonction ; `AuthHandler.ts` de 999 à 950 ;
- `routes/conversations/utils/rejoin-restored-membership.ts` — l'unité de
  rebranchement et ses DEUX règles d'emploi (n'appeler qu'après une
  restauration EFFECTIVE, et AVANT la diffusion du fait).

Et `MessageMutationQueueParams`, qui remplace deux signatures recopiées à la
main — celle du transport et celle du manager. C'est la forme du cycle 126 : un
relais qui recopie champ par champ retient en silence chaque champ ajouté en
amont, et c'est exactement ce qui aurait avalé `excludedQueueKeys`.

## Dimensions

**Mûres** : 1 (Sécurité — le texte d'une édition respecte le plancher
d'historique ; le clair d'une file expire ; un plan signé qui tombe ne sert plus
d'adresse nue) · 13 (Complétude — l'accusé de remise nomme son message ; une
conversation restaurée redevient vivante ; une socket avoue son ignorance) ·
11 (Maintenabilité — trois modules extraits, deux inventaires recopiés
supprimés, deux cliquets neufs) · 9 (Compatibilité — le hors-ligne, qui est la
garantie que chacun de ces défauts perdait).

**Restantes, avec leur issue** : #17024 (le dédup par contenu avale le second de
deux messages identiques au drain d'outbox — le plus grave du cycle, et il
demande une décision de protocole) · #17025 (la loi du plancher manque à
`message:attachment-updated`) · #17026 (quatre sites où une émission vivante nue
précède l'enfilage durable — une FAMILLE, trouvée indépendamment par les deux
auditeurs) · #17027 (l'accusé de remise du drain, cinquième émetteur) · #17028
(le rejeu hors ligne porte les adresses nues) · #17031 (épingler deux fois
remonte la conversation de tous) · #17032 (l'invitation n'annonce pas l'arrivée).

**Décisions produit ouvertes** : #17029 (les familles qui ne portent que des ids
révèlent-elles l'existence d'un message ?) · #17030 (par quel canal un pair EN
LIGNE apprend-il une édition qu'aucune diffusion n'a pu lui servir ?).

## Méthode

Deux auditeurs adversariaux sur deux périmètres disjoints ont rendu **onze
constats**. Aucun n'était faux. Six sont partis en issues, cinq sont devenus des
lots — et **les deux ont trouvé la même FAMILLE indépendamment** (une émission
vivante non gardée en amont d'un enfilage durable), ce qui est le signal le plus
fort du cycle : une règle écrite, motivée, et non propagée vaut là où quelqu'un
l'a récitée. C'est #17026, et elle demande un cliquet, pas quatre correctifs.

Un troisième auditeur a relu le lot G avant sa fusion, comme le dépôt l'exige
pour tout lot de contrôle d'accès.

> Et la mesure qui vaut d'être retenue : **sur les sept lots du cycle, quatre ont
> été déclenchés par un cliquet qui rougissait, et un par un défaut que j'avais
> introduit moi-même.** Le dépôt se corrige davantage par ses gardes que par ses
> audits — à condition qu'on lise ce qu'elles demandent au lieu de les faire
> taire.

---

## Second tour — l'audit a refusé le lot G, et il avait raison sur cinq points

Le dépôt exige le passage de `auditeur-adversarial` avant la fusion de tout lot
de contrôle d'accès. Il a rendu **« à ne pas fusionner en l'état »**, et c'est le
résultat le plus utile du cycle — plus utile que n'importe lequel des six lots.

**La garde ne tenait pas sa phrase.** Le lot disait « le texte d'une édition ne
part qu'à ceux qui ont le droit de LIRE ce message ». Il était juste là où il
était posé, invoquait les bonnes leçons du dépôt dans ses doc-comments, et en
manquait **deux à la fois** :

1. **un SECOND transport** — `message:edited` part aussi de
   `MessageHandler.handleMessageEdit`, que deux doc-comments du dépôt nomment
   « le transport d'édition PRIMAIRE », et qui n'appelle pas
   `broadcastMessageMutation`. Aucune lecture de plancher, aucun `except`, un
   enfilage sans exclusion. L'auditeur l'a prouvé ROUGE.
2. **un objet VOISIN** — `mention:created` porte `content`, le texte APRÈS
   édition, et il est émis **à quatre lignes** de chaque appel que la garde
   venait de poser.

> **Le lot CITAIT la leçon 275 en en-tête et la manquait d'un objet voisin.**
> C'est la forme la plus coûteuse d'une leçon apprise : elle était écrite, elle
> était au bon endroit, et elle n'a pas empêché le défaut qu'elle décrit. Une
> leçon ne protège pas parce qu'on la connaît — elle protège quand quelqu'un
> pose la question qu'elle contient AU MOMENT du correctif, sur l'objet qu'on
> remet, ligne à ligne.

### Et les trois autres constats disent chacun quelque chose de différent

**Le type nommé n'avait pas été appliqué.** Le lot créait
`MessageMutationQueueParams` *en écrivant qu'il remplaçait deux recopies* ; il
n'en avait remplacé qu'une. La signature du relais de production gardait son
littéral inline sans `excludedQueueKeys`, et marchait par deux accidents (l'objet
relayé en bloc, `strictFunctionTypes: false`). Elle MENTAIT donc sur un champ de
confidentialité.

> **Un doc-comment qui annonce ce que le lot a fait est une AFFIRMATION, comme un
> compte ou un tri.** Celui-ci décrivait un travail à moitié fait, et c'est le
> doc-comment lui-même qui rendait l'autre moitié invisible : on ne cherche pas
> une recopie dont on vient de lire qu'elle a été supprimée.

**Les trois gardes par lecteur ne pouvaient pas tomber.** Mesuré par mutation :
neutralisées en `if (false && …)`, 139 suites et 2 392 témoins restaient VERTS.
Les témoins du lot n'atteignaient que la diffusion de room — pas d'`attachments`
dans la charge (donc aucun plan signé), un harnais qui expose toujours `except`,
aucun cas avec `sealedQuoteAudience`. **Le chemin que la production désigne
elle-même comme le plus dangereux était le seul sans témoin.**

> La règle « prouver le ROUGE » avait été suivie — sur le chemin le plus facile à
> atteindre. **Prouver le rouge d'UN chemin ne prouve rien des autres**, et la
> mesure qui le dit n'est pas la relecture de l'assertion : c'est la MUTATION de
> chaque garde, une par une.

**Un double d'`io` qui AVALAIT les `except`.** Il enregistrait une diffusion de
room comme si elle atteignait tout le monde, y compris les lecteurs qu'elle
venait d'exclure. Aucun témoin d'exclusion ne pouvait s'y écrire — et je l'ai
découvert en écrivant un témoin qui échouait pour la mauvaise raison.

> C'est « un double mente aussi par ce qu'il ACCEPTE » appliqué à ce qu'il
> OBSERVE : un double d'émission qui perd l'exclusion ne décrit pas une
> diffusion plus simple, il décrit une diffusion DIFFÉRENTE — celle qu'on est en
> train d'essayer d'interdire.

### Ce que le second tour a produit

`socketio/editedAudience.ts` : la loi, le verdict à trois états et les trois
sorties de l'édition, écrits UNE fois et partagés par les deux transports. **Le
lot précédent avait dupliqué la règle ; celui-ci la déduplique** — et c'est la
réponse structurelle au constat, pas un correctif par site.

Plus : la garde du plancher dans `emitMentionCreated` (à côté de celle
d'auto-mention, pour la raison que son doc-comment donne déjà), le type nommé
appliqué au relais, quatre témoins qui tombent sous la mutation de l'auditeur, et
quatre doubles complétés.

### La leçon de forme du second tour

Le cycle s'était clos sur « le dépôt se corrige davantage par ses gardes que par
ses audits ». C'est vrai des cliquets, et c'est **faux de ce lot-ci** : aucun
cliquet ne pouvait voir qu'une garde manquait à un second transport, ni qu'un
objet voisin emportait le texte. Il a fallu quelqu'un qui cherche à CASSER.

> **Un cliquet garde ce que quelqu'un a déjà pensé à garder.** C'est beaucoup, et
> ce n'est pas la même chose qu'un adversaire. Les deux ne se remplacent pas : le
> cliquet empêche la régression d'une règle connue, l'audit trouve la règle qu'on
> croyait appliquée. Ce cycle a eu besoin des deux, et le compte final le dit —
> quatre lots déclenchés par un cliquet, deux constats bloquants trouvés par un
> audit, et un défaut que j'avais introduit moi-même.

---

## Troisième tour — la moitié PUSH, prise au lieu d'être différée

Le second tour avait fermé l'ÉVÉNEMENT `mention:created` et renvoyé la BANNIÈRE
en issue. C'était la mauvaise décision, et elle se voit en une phrase : laisser
une garde posée sur l'événement et absente de la bannière, c'est **exactement**
le défaut que le second tour venait de corriger — une garde posée sur un chemin
qui se lit comme posée sur le sujet.

`notifyNewlyMentioned` relit `loadMessageProtection`, qui couvre la vue unique,
le flou, l'éphémère et le chiffré — **jamais le plancher**. Un inscrit entré par
un lien sans historique recevait donc sur son écran verrouillé le texte intégral
d'un message écrit avant son arrivée, dès qu'une édition l'y nommait. Le message
n'a même pas besoin d'être protégé : c'est sa DATE qui le met hors de portée.

Deux choses que ce tour a trouvées en se faisant, et qui valent plus que le
correctif :

**La garde devait se relire SUR PLACE, et le fichier le disait déjà.** Son
doc-comment voisin porte, mot pour mot : « une garde de confidentialité qui
dépend du câblage de l'appelant échoue en montrant PLUS ». Le correctif n'a donc
pas eu à décider où poser la lecture — il a eu à LIRE la décision déjà écrite
pour la dimension voisine.

**Une projection trop ÉTROITE bloque une loi en aval sans qu'aucun témoin ne
rougisse.** `MentionPrisma` ne déclarait pas `conversationShareLink`, que la loi
lit pour savoir si un lien d'entrée autorise l'historique. C'est la leçon du
cycle 124 — dix-sept sites avaient alors sauté la forme du `select` plutôt que
l'appel — et ici c'est le COMPILATEUR qui l'a dite, parce que la loi déclare le
client dont elle a besoin au lieu de l'accepter large.

> **Le type d'un client Prisma est l'endroit où une loi déclare ce qu'elle a
> besoin de lire.** `EditAudiencePrisma` nomme ses trois tables ; un appelant
> dont la projection n'en couvre que deux ne compile pas. C'est la seule des
> quatre familles de défaut de schéma (§ CLAUDE.md) qu'un cliquet ne peut pas
> voir, et un type bien posé la rend visible gratuitement.

## Une erreur de méthode, mesurée, à ne pas refaire

Un des quatre passages de la suite complète a rendu **deux rouges qui n'en
étaient pas** (`core-auth-refusal-status`, `me-export`), tous deux verts en
isolation. La cause n'est pas une flakiness : **j'éditais des fichiers pendant
que la suite tournait.** Jest lit chaque fichier au démarrage de sa suite, donc
une édition en vol produit des échecs qui n'appartiennent à aucune révision.

> **Une mesure prise sur un arbre qu'on modifie ne mesure rien**, et elle coûte
> deux fois : le temps de la passe, et le temps de disculper les faux rouges.
> La suite complète se lance sur un arbre GELÉ — après le dernier commit, pas
> pendant le prochain.

---

## Cinquième tour — lot H : une émission vivante NUE en amont d'un enfilage DURABLE (#17026)

Lot pris après la fusion de #17048. L'issue venait du même audit : **les deux
auditeurs l'avaient trouvée indépendamment, par deux périmètres disjoints** —
le signal le plus fort du cycle.

### Le défaut, et pourquoi la règle écrite ne l'a pas couvert

`io.to(room).emit(...)` LÈVE quand l'adaptateur ou l'encodeur est en défaut.
C'est une affirmation du dépôt, écrite là où il s'en garde
(`socketio/utils/emitWithSeq.ts` : « la cause est réelle et pas hypothétique »).
Sept unités plaçaient cet appel — ou une lecture non gardée — en amont d'une
mise en file hors ligne, **dans le même `try`**, sous un `catch` de fin de
méthode. Une diffusion tombée annulait donc le rejeu de TOUS les absents, sur
un contenu déjà persisté et déjà acquitté « envoyé ».

La règle était écrite, **deux fois, aux deux meilleurs endroits** : le
§ « Sa PLACE fait partie de la garantie » de `MessageHandler.broadcastNewMessage`
et son jumeau de `postMessageSyncFanOut`. Les deux citent `emitWithSeq`. Les
deux nomment ce qui vient **après** l'enfilage (les synchros cosmétiques), et
aucun ne tire la conséquence sur ce qui vient **avant** — l'émission vivante,
trois lignes au-dessus, dans le même bloc.

L'angle mort est mécanique : le cycle 116 a formulé la règle comme un ORDRE
(*charger → enfiler → diffuser la cosmétique*), et un ordre se vérifie vers le
BAS. L'émission vivante est plus haut, et elle n'est pas « cosmétique ».

### Les sept sites, et par quoi chacun a été trouvé

| # | site | ce que l'absent perdait | trouvé par |
|---|---|---|---|
| 1 | `deliverTextTranslation` (émission) | la traduction, définitivement — le `message:new` enfilé à l'envoi porte `translations: []` | l'issue |
| 2 | `emitAttachmentUpdated` (deux branches) | la pièce ENRICHIE : transcription, piste TTS — la raison d'être du module | l'issue |
| 3 | `MessageHandler.broadcastNewMessage` (`readerSignedPlan`) | le message ENTIER | l'issue |
| 4 | `MeeshySocketIOManager._broadcastNewMessage` (idem) | le message ENTIER | l'issue |
| 5 | `MessageHandler.handleMessageEdit` (plan + émission) | l'édition, **et** l'éditeur lisait « échec » sur un geste réussi | relecture de l'import partagé |
| 6 | `MeeshySocketIOManager` — résumé d'appel édité | l'édition | **le cliquet** |
| 7 | `MessageHandler.handleMessageDelete` | la suppression (la bulle reste visible) | **le cliquet** |

Les deux derniers vivaient dans des fichiers que l'issue NOMMAIT, à quelques
dizaines de lignes de sites qu'elle énumérait. Ni l'issue, ni ma relecture ne
les a vus. **4 annoncés, 7 réels** — la leçon 261 avec son chiffre.

Les sites 3 et 4 étaient des **pièges armés devenant panne dès qu'une clé de
signature existe** : `readerSignedPlan` ne fait aucune requête sans signeur ni
pièce liée au lecteur. `ATTACHMENT_URL_SIGNING_KEY` est vide dans
`.env.example` mais le gabarit de staging la pose — la précondition est donc
clé posée + message portant une pièce à vue unique / éphémère / floutée /
scellée, soit exactement la population dont la perte coûte le plus cher.

### Les quatre pièces du correctif

1. **`socketio/emitLiveBestEffort.ts`** — site unique, `onError` REQUIS (une
   panne d'adaptateur sans trace est la même panne, simplement
   indiagnosticable). `emitMessageNewBestEffort` y délègue.
2. **`ReaderSignedPlanOutcome`** (`readerSignedDelivery.ts`) — un verdict à
   TROIS valeurs, parce qu'il y a trois choses à dire : un plan (« voici les
   destinataires »), `null` (« la question ne se pose pas » ⇒ room), et
   `'unavailable'` (« je ne sais pas adresser » ⇒ RIEN en direct, et la suite a
   lieu). `'unavailable'` n'est pas `null` : collapser les deux rendrait la
   diffusion de room sur une pièce établie comme liée au lecteur. C'est la
   leçon `[]`-vs-`undefined` du cycle 116 portée au plan signé.
   `emitMessageNew` et `emitEditedToReaders` acceptent la troisième valeur ; la
   copie privée du wrapper qui vivait dans `emitAttachmentUpdated` est
   consolidée ici, avec sa jumelle.
3. **`deliverTextTranslation`** — la loi du plancher rend sa troisième réponse
   (`translationReadersOrUnknown`), et l'émission vivante est enrobée.
4. **Le cliquet** — `__tests__/live-emission-before-enqueue-sweep.ts`,
   inventaire VIDE.

### Ce que le cliquet a appris de lui-même

| version | constats | verdict |
|---|---|---|
| 1 | 4 | **2 faux positifs** : la DÉCLARATION `private async _enqueueOfflineEventForParticipants(params: {` matchait comme un appel, et l'unité calculée depuis elle enjambait la méthode précédente |
| 2 | 2 | les deux réels — sites 6 et 7 |
| 2, relancée après correction | **2** | les mêmes : l'émission vivait désormais dans une fermeture passée à `emitLiveBestEffort`, qui n'est pas un `try` textuel |
| 3 | **0** | l'enrobage est reconnu comme ce qu'il est — la réparation |

> Un cliquet qui ne connaît pas la forme du correctif **désigne le correctif
> comme le défaut**, et enseigne l'inverse de sa règle. Le relancer sur l'arbre
> RÉPARÉ, pas seulement sur l'arbre fautif : son vert est une assertion autant
> que son rouge.

Et il prouve d'abord qu'il BALAIE (≥ 10 unités d'enfilage atteintes) : une garde
négative dont le balayage rend `[]` reste verte.

### Deux honnêtetés, écrites parce qu'elles coûtent

**Le guard d'audience de `deliverTextTranslation` ne sauve AUCUN enfilage.** Sur
`'unknown'` on retient les deux canaux à dessein (`excludedQueueKeys` nomme les
lecteurs SOUS le plancher ; enfiler sans cette liste déposerait le texte traduit
48 h dans Redis sous la clé d'un invité qu'aucune route n'autorise à le lire), et
c'est déjà ce que la panne produisait par le `catch`. Ce qui change est le
DIAGNOSTIC : une décision nommée au lieu d'une exception anonyme, et pas de
`stats.errors++`. La première version de mon commentaire de site se lisait comme
un correctif de durabilité ; elle a été réécrite. Le témoin pré-existant
(« une lecture des participants qui tombe n'émet RIEN ») était vert des deux
côtés — il ne pouvait pas distinguer « retenu à dessein » de « la méthode a
explosé », et il ne faut pas lui faire dire la première chose.

**Une mutation de preuve RED peut être fausse.** Ma première mutation du site du
plan signé a produit `await (async () => {…})()(this.prisma, …)` — un appel sur
une Promise, donc un `TypeError` SYNCHRONE inconditionnel. Les cinq témoins sont
tombés, et aucune de ces chutes ne prouvait quoi que ce soit. La mutation juste
porte sur la GARDE elle-même (le wrapper relaisse remonter), et elle fait tomber
exactement les trois témoins du plan. **Une preuve de rouge se lit comme un
résultat de mesure : vérifier que le rouge vient du mécanisme nommé.**

Elle a aussi révélé qu'un de mes témoins (« rien ne part en direct ») passait au
VERT sous l'explosion — donc sous la régression même qu'il prétendait garder. Il
assert désormais les deux moitiés ensemble (rien en direct ET l'absent servi).

### Preuve

- `tsc --noEmit` gateway : **EXIT=0**, 0 ligne
- rouge prouvé, quatre mutations distinctes :
  - l'enrobage de `message:new` retiré ⇒ les 2 témoins de producteur tombent
  - `readerSignedPlanBestEffort` relaisse remonter ⇒ les 3 témoins de plan tombent
  - le guard d'audience + l'enrobage de `deliverTextTranslation` retirés ⇒ ses 2 témoins neufs tombent, les 8 pré-existants verts des deux côtés
  - le `try` d'`emitAttachmentUpdated` retiré ⇒ ses 2 témoins tombent, les 13 pré-existants verts
  - le `try` du 5e site retiré ⇒ ses 2 témoins tombent, les 9 pré-existants verts
  - l'enrobage du site 6 ou 7 retiré ⇒ **le cliquet tombe en NOMMANT le fichier et l'expression**
- un témoin de coverage INVERSÉ avec sa raison (`stats.errors` sur une émission
  tombée), et la couverture du `catch` extérieur reprise sur un chemin qui y mène
  vraiment

### Post-scriptum du lot H — la leçon du cliquet de budget s'est rejouée sur son auteur

Deux lots plus tôt, ce cycle a écrit `tasks/lessons/2026-11-08-un-cliquet-de-budget-demande-ou-pas-si.md` :
*un cliquet de budget ne demande pas « ton lot est-il juste ? » mais « est-il à
sa PLACE ? », et la réponse n'est presque jamais dans le lot.*

Le lot H l'a rejouée, à l'identique, sur le cliquet des SUITES cette fois :

```
socketio/__tests__/MeeshySocketIOManager.test.ts : 8158 → 8192
```

Et le premier réflexe a de nouveau été de raboter — compter les lignes de
commentaire du témoin inversé pour repasser sous la barre. La réponse juste
était la même que la première fois, et elle était écrite : **un fichier déjà
hors budget est interdit d'ajout, on extrait d'abord.** Les deux témoins vivent
désormais dans `deliverTextTranslation-outer-catch.test.ts`, sur le harnais
PARTAGÉ — et le fichier d'origine a PERDU 51 lignes au lieu d'en gagner 34.

Ce qui vaut d'être noté n'est pas la récidive, c'est **ce qui l'a produite** :
l'extraction n'était pas visible depuis le lot. Elle demandait de savoir qu'un
harnais partagé existe (`helpers/message-new-parity-mocks`), c'est-à-dire une
information qui vit dans un AUTRE fichier que celui qu'on édite. La leçon
disait déjà « la réponse est dans le fichier d'à côté qui n'existe pas encore » ;
ici il existait, et ça n'a pas suffi à le voir.

Corollaire opérationnel, à essayer au prochain lot qui ajoute des témoins :
**lancer les deux cliquets de budget AVANT d'écrire le témoin, pas après.** Ils
coûtent quelques secondes et répondent à la question « ce fichier a-t-il le
droit de grossir ? » — laquelle ne se pose jamais spontanément quand on a un
témoin à écrire.
