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
