# Cycle 143 — le clair d'un message détruit restait 48 h dans Redis, et « Réessayer » doublait un téléversement en cours

**Issues livrées** : #16706 (lot A, passerelle) et #16749 (lot B, iOS/SDK).
**Branche** : `claude/exciting-planck-xdp7ig`. **PR** : #16769 vers `dev`.

## Ce que ce cycle a repris, et pourquoi

Le cycle 142 a déposé huit issues et en a vérifié deux ligne à ligne. Ce cycle a
pris **ces deux-là**, et la raison est une méthode : un rapport d'audit se reçoit
comme une piste, pas comme un constat (leçon du cycle 142, où le seul volet non
re-vérifié était aussi le seul faux). Les six autres restent déposées.

La PR #16720, à qui le cycle 142 avait cédé `offlineParticipantQueue.ts`, a
fusionné : le cœur socket était libre. Relevé d'occupation avant d'écrire une
ligne — aucune branche vivante des 48 h ne touchait les chemins visés.

## Lot A — le clair d'un message détruit quitte la file (#16706)

### La forme du défaut

#16685 (cycle 140) a fermé la **REMISE** : le drain interroge la vivacité du
message avant d'émettre. Il n'a rien changé au **STOCKAGE**, délibérément.
`enqueueForOfflineParticipants` écrit `payload: body` VERBATIM dans
`delivery:queue:<userId>` — Redis, persistance AOF, TTL 48 h. Quand
`ExpiredMessagesCleanupService._burn` détruit la ligne, la copie enfilée RESTE.

L'invariant que `_burn` revendique dans son propre commentaire — « le contenu est
détruit, c'est l'invariant qui compte » — tenait dans Mongo et pas là. Une
sauvegarde AOF prise dans la fenêtre porte le clair.

### L'index inverse, et la mesure qui a renversé son coût

La file est une LISTE PAR UTILISATEUR : rien ne permettait d'aller d'un
`messageId` vers les files qui en gardent une copie. Le tableau de coûts de
#16706 chiffrait cette piste à « une écriture Redis de plus par destinataire hors
ligne, **sur le chemin le plus chaud** », et c'est ce chiffrage qui la rendait
discutable.

Il est vrai d'une **COMMANDE** et faux d'un **ALLER-RETOUR**. L'index s'écrit
comme deux `redis.call` de plus dans `ENQUEUE_DEDUP_LUA`, un script déjà en vol :
zéro latence réseau supplémentaire. Un `sadd` séparé, lui, aurait DOUBLÉ le
nombre d'allers-retours du chemin d'enfilage.

> **Avant d'écarter une piste sur son coût, demander dans quelle UNITÉ le coût a
> été compté.** « Une écriture de plus » et « un aller-retour de plus » se
> ressemblent dans une phrase et diffèrent d'un ordre de grandeur.

### Trois décisions de forme, dont une qui a failli casser le nettoyage

- **L'index n'indexe que `TextBearingQueuedEvent`**, le MÊME cadrage que la garde
  de vivacité. Ce qui doit être revérifié avant d'être REMIS est exactement ce
  qui doit pouvoir être retrouvé pour être PURGÉ — et un second prédicat aurait
  divergé au premier cas de mort de plus.
- **Son préfixe est hors de `delivery:queue:`.** Le premier nom essayé,
  `delivery:queue:msg:`, appariait le `SCAN MATCH delivery:queue:*` de
  `cleanup()`, qui fait un `LRANGE` sur chaque clé trouvée. Un `SET` y répond
  `WRONGTYPE`, l'exception tombe dans le `catch` du balayage, et **le nettoyage
  de TOUTES les files s'arrête**. Un index posé pour empêcher le clair de
  survivre 48 h aurait désarmé la seule unité qui le fait expirer. Attrapé par la
  sonde contre un vrai Redis, pas par la lecture.
- **L'index est écrit sur les TROIS issues du script**, dédoublonnage (`return 0`)
  compris, où rien d'autre n'est écrit. `return 0` prouve que l'entrée EST en
  file ; un index expiré pendant que son entrée survit est l'état exact où le
  clair redevient introuvable.

### La purge n'a pas de prédicat à elle

`announcesMessageDeath` (`deleted` / `expired`) est la ligne du milieu du tableau
de `carriesMessageText`, lue dans l'autre sens. `messageLivenessOf` rend `gone`
sur exactement ces deux causes : **la purge applique au STOCKAGE le verdict que le
drain applique déjà à la REMISE.**

Et la condition est DOUBLE — `messageId` ET porteur de texte. `messageId` seul
emporterait l'annonce de mort du même message, c'est-à-dire **le seul événement
qui dit au client de retirer la bulle** : l'absent garderait un message détruit
affiché pour toujours. C'est le défaut symétrique, et le plus cher des deux.

### Le chokepoint n'était pas celui qu'on croit

`broadcastMessageMutation` a l'air d'être l'unité partagée de toutes les
mutations de message. Mesuré : **4 de ses 8 appels** portent une mort, et **six
sites de destruction ne l'atteignent pas** — dont `MessageHandler`, le transport
socket `message:delete`, qui open-code ses quatre audiences.

`applyMessageRemovalEffects` en couvre cinq, et c'est la bonne adresse pour une
raison plus forte que son taux de couverture : **elle balayait DÉJÀ trois copies
résiduelles du texte** — le cache du traducteur (#16557), les traductions
partagées (#9899), `Message.translations`. La file est leur JUMELLE.

> **La question du cycle 85 — *cette entité a-t-elle une jumelle ?* — se pose
> aussi à un SUBSTRAT, pas seulement à une table voisine.** Les trois balayages
> existants nettoient Mongo et le tas du processus. Aucun ne regardait Redis,
> parce qu'aucun n'y avait de chemin — et l'absence de chemin se lit comme
> l'absence de problème.

D'où le registre (`services/delivery-queue-registry.ts`) : les dix écrivains de
`deletedAt` n'ont, pour la plupart, que `prisma`. Faire descendre l'instance
jusqu'à chacun voudrait dire élargir six signatures et trois interfaces pour un
canal best-effort — et surtout rendre la purge un PARAMÈTRE, donc une garde que
son absence désactive. Le registre met la résolution DANS l'unité qui purge.

### La vue unique : le seul site où la purge du stockage EST la protection

`purgeViewOnceContent` efface le contenu **sans écrire `deletedAt`** — la bulle
reste, c'est sa raison d'être, et le module le dit lui-même. Or
`messageLivenessOf` ne connaît que `deletedAt` et `expiresAt`, et
`viewOnceBurnedAt` n'est lu par aucune garde de remise.

Un absent dont la file portait l'entrée `new` recevait donc **le texte entier
d'une vue unique purgée**, et le drain, qui interroge bien la base, la trouvait
VIVANTE. La garde ne pouvait pas le voir : elle n'a rien à lire.

> C'est l'inverse du cycle 124. Là, un champ **DÉCLARAIT** une restriction que
> rien n'appliquait ; ici un module **APPLIQUE** une destruction qu'aucun champ ne
> déclare — donc qu'aucune garde en aval ne peut interroger. **Devant une
> destruction, demander ce qu'elle LAISSE DERRIÈRE comme preuve, et qui peut la
> lire.** Une destruction muette ne protège que ce qu'elle touche elle-même.

### `peek` est RETIRÉ, pas gardé

L'issue demandait de le gater. Il n'avait **aucun appelant de production** et
servait les charges **en les DÉSCELLANT** sans la garde du drain.

Le gater demandait un collaborateur `prisma` qu'une seule des 95 constructions
câble : une garde que son absence désactive, exactement la forme que le dépôt
condamne. On ne fuit pas par un lecteur qui n'existe pas. Son retrait rend
**246 lignes** à un fichier de témoins hors budget, et retire une voie de
déchiffrement sans appelant. `size()` reste — il ne porte aucun secret.

> **Entre garder une porte et retirer la porte, la seconde option ne se discute
> que si la porte sert à quelqu'un.** Un gate sur une méthode que personne
> n'appelle est lui-même une loi sans appelant — le défaut que les cycles 139,
> 140 et 142 ont trouvé trois fois.

### Un double de test ment aussi par ce qu'il ACCEPTE

Les quatre doubles Redis du dépôt lisaient la clé en 3e position et tout le reste
comme des ARGV, en ignorant `numkeys`. L'enfilage déclarant désormais DEUX clés,
ils rangeaient **la clé d'index DANS la file**, comme si c'était une entrée —
21 témoins rouges, tous pour la bonne raison. Forme du cycle 112, et le correctif
est un double qui respecte le contrat du vrai client.

## Lot B — une relance manuelle ne réarme pas un envoi en vol (#16749)

La règle existait, NOMMÉE et motivée (`StuckPublicationRetry.retryableOutboxId`),
et `OutboxFlusher` ne reréclame jamais un claim frais, avec son témoin. Le point
d'entrée GÉNÉRIQUE — celui que « Publications non envoyées » et la bulle média en
échec appellent — ne posait pas la question : son doc-comment DÉCLARAIT la
restriction et l'`UPDATE` était inconditionnelle.

> **Forme du cycle 124 posée sur une phrase de DOCUMENTATION.** « Manually
> retries an outbox row that has previously failed or exhausted its retry
> budget » est une affirmation, pas une garde — et elle se relit comme une
> propriété du code qu'elle surplombe.

### Ce qui a décidé du correctif : ne pas refuser trop

Copier le prédicat du flusher serait une RÉGRESSION. Un `.inflight` PÉRIMÉ est un
orphelin que `flush()` reprend déjà ; un `.pending` différé est l'utilisateur qui
dit « maintenant ». Les refuser rendrait « Publications non envoyées » **inerte
sur une ligne coincée** — exactement le piège que cet écran existe pour défaire.

La décision est donc prise par SQLite DANS la transaction
(`… WHERE id = ? AND (status <> ? OR updatedAt < ?)`), jamais sur l'instantané
que l'appelant a lu — le motif de `claimPending`. Et la borne vient de
`OutboxFlusher.staleInflightReclaimSeconds` **par RÉFÉRENCE** : deux bornes
divergentes ouvriraient une plage où l'un reprend ce que l'autre refuse.

### Une garde qui refuse doit refuser TOUT ce que le chemin nominal fait

`forgetOutcome` passait AVANT l'écriture. Sous la garde, un refus aurait donc
effacé le tombstone d'une mutation **encore en vol** : le dispatch aboutissait, et
l'abonné qui attendait son `.applied` avait perdu le repère sur lequel il se
recalait. Elle est passée après.

Et la bulle restait « en échec » au-dessus d'un téléversement en cours, invitant à
retaper — **le geste même qui doublait l'envoi**. Elle passe `.retrying` sur
`itemInFlight`, un cas distinct d'`itemNotFound` parce que la suite est
différente : il n'y a rien à redemander, ça part.

### Le cliquet de cohésion a décidé de la STRUCTURE, deux fois

Rouge n°1 : `retryItem` à **95 lignes** (plafond 80). Rouge n°2, après extraction
d'une sous-fonction : l'unité `OfflineQueue` **en hausse** (2 957 → 2 980, pour un
plafond d'unité de 1 500 — dette antérieure).

La réponse n'est pas de relever la référence. `OutboxRetryAdmission` porte
l'admission **et la traduction d'erreur** — ce second déplacement est ce qui
retire le `do/catch` de sept lignes de l'unité hors budget et la ramène à sa
référence. Et c'est le bon découpage de toute façon : « cette ligne peut-elle
repartir ? » est UNE question, et ses trois appelants d'instantané
(`OutboxUIItem`, `UnsentPublication`, le `deliveryStatus` de la bulle) ne peuvent
aucun y répondre.

> **Un cliquet de cohésion n'est pas une taxe à payer : c'est une question sur le
> découpage, et deux fois sur ce lot elle a eu raison.** La seconde fois en
> désignant un déplacement — la traduction d'erreur — que rien d'autre n'aurait
> suggéré.

### Un témoin écrit naïvement ne pouvait pas tomber

La garde de source cherche `OutboxFlusher.staleInflightReclaimSeconds` dans le
fichier. **Mon propre doc-comment le NOMME sur deux lignes**, pour expliquer la
décision : le `contains` passait au vert sur une recopie littérale de 1800. Elle
ne lit donc que des lignes de CODE — même précaution, et pour la même raison, que
`WireDateSourceGuardTests`.

> **Un lot qui documente richement sa décision ARME ce piège.** Plus un
> doc-comment nomme précisément ce qu'il justifie, plus il ressemble au code que
> la garde cherche. La question à poser à toute garde de source : *mon propre
> commentaire la satisfait-il ?*

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** (lu HORS pipe) |
| suite gateway COMPLÈTE | **2 529 / 2 535 suites, 39 752 témoins verts** |
| sémantique Lua, vrai `redis-server` | **17 assertions, ALL PASS** |
| la même sonde sur la révision d'AVANT | **4 tombent**, toutes sur l'index |
| rouge lot A, crochets retirés | 3 témoins sur 5 |
| rouge lot A, mutation du prédicat | « garde l'annonce de mort » tombe |
| rouge lot A, mutation de l'ordre mémoire/Redis | les 2 témoins de la tranche mémoire tombent |
| rouge lot B, prédicat rejoué sur les deux révisions | avant : les 2 formes absentes du CODE ; après : présentes |
| `check_cohesion_budget.sh` | `OfflineQueue` n'est plus en hausse |
| suites iOS/SDK | `workflow_dispatch` de `sdk-tests.yml` — pas de chaîne Swift dans ce conteneur |

Les 6 rouges de la suite gateway sont les suites de **codecs d'image** (HEIF,
AVIF 10 bits, carte de gain HDR, orientation EXIF) : capacité libvips du
conteneur, mesurée et documentée au cycle 139, vertes en CI. Étrangères aux deux
lots, et les mêmes qu'au cycle 142.

**Un vrai `redis-server` est disponible dans ce conteneur** (`/usr/bin/redis-server`),
ce qu'aucun cycle précédent n'avait relevé. La CI, elle, n'a pas de service Redis :
les témoins commités restent donc sur des doubles qui attestent la DÉCISION, et la
sémantique du script Lua se prouve localement. C'est la combinaison la plus forte
disponible — vrai moteur pour le script, double pour le câblage.

## Dimensions

**Mûres** : 1 (Sécurité — suppression sûre : le clair ne survit plus à la
destruction, et une relance ne détruit plus une ligne sous son dispatcher),
11 (Maintenabilité — un prédicat de mort partagé avec la garde de remise, un
registre au lieu de six signatures, `OutboxRetryAdmission` extrait, 246 lignes de
dette de témoins rendues), 13 (Complétude — la vue unique, que nulle garde de
remise ne pouvait voir, est couverte).

**Restantes, déposées en issues** : quatre sites de destruction hors de
`applyMessageRemovalEffects` (stockage) ; les deux instances de
`RedisDeliveryQueue` aux tranches mémoire divergentes ; `ConversationViewModel`
à +3 lignes sur une unité à 2,6× son plafond.

## Ce que ce cycle n'a pas pris

Intacts du cycle 142 : **#16745**, **#16752**, **#16747** (lot sensible),
**#16748**, **#16750**, **#16751**, **#16753**. Et **#16688**, désormais libre de
la PR #16720.
