# Cycle 140 — le rejeu hors ligne ne remet que ce qui est VIVANT, et l'audience de diffusion sait enfin ce qu'est un membre

**Issues livrées** : #16685 (lot A) et #16690 (lot B).
**Branche** : `claude/exciting-planck-6fgpu8`. **Milestones** : #242, #243.
**Issue ouverte en chemin** : #16706 (la moitié STOCKAGE de #16685, milestone #242).

Ce cycle REPREND l'audit du cycle 139, qui avait déposé six défauts vérifiés
ligne à ligne et n'en avait livré aucun. Les deux lots d'aujourd'hui sont les
deux plus graves de cette liste ; les quatre autres (#16687, #16688, #16689,
#16691) restent ouverts et intacts.

## Lot A — un message DÉTRUIT remettait son texte en clair (#16685)

`enqueueForOfflineParticipants` écrit `payload: body` **verbatim**, et le drain
ne rejouait qu'un gate d'**appartenance** (`_dropEndedMemberships`, dont le
`select` ne lit que `{ conversationId, bannedAt }`). **Rien ne relisait l'état du
MESSAGE.**

`ExpiredMessagesCleanupService._burn` détruit la ligne — `content: ''`,
`encryptedContent: null`, `translations: null`, `deletedAt`, fichiers supprimés —
en revendiquant dans son propre commentaire : « Le contenu est détruit — c'est
l'invariant qui compte ». L'invariant ne tenait pas : une copie LISIBLE restait
dans `delivery_queue:<userId>` pour le reste des 48 h de TTL, et le prochain
drain l'émettait. Idem pour un message RAPPELÉ et pour un message à VUE UNIQUE.

**La garde existait, et le chemin le plus exposé ne l'avait pas.**
`NotificationService.messageLiveness` a été écrite pour exactement cette raison
(« we MUST NOT leak the original content via the banner ») — sur un chemin qui
remet une BANNIÈRE. Celui-ci remet le message entier. C'est la forme documentée
« une garde d'admission se pose sur CHAQUE chemin, pas sur le plus fréquenté »,
et la réponse est l'EXTRACTION (`services/messages/message-liveness.ts`), jamais
une seconde boucle.

### Le cadrage était la moitié difficile, et il décidait du lot

Une garde de vivacité posée sur TOUTES les entrées de la file aurait été un
défaut **pire** que celui qu'elle corrige : `'deleted'` et `'expired'` ont pour
UNIQUE objet d'annoncer la mort du message. Les refuser *parce que* le message
est mort laisserait le client afficher indéfiniment un message détruit — et la
première moitié du lot aurait eu l'air de marcher.

**La loi qui sépare les deux ensembles existait déjà, déclarée** :
`TextBearingQueuedEvent` (#12822), « les familles dont la charge porte le TEXTE
d'un message, ou ce qui voyage avec lui ». Elle avait été écrite pour décider qui
doit SCELLER sa charge avant Redis. Les deux questions sont distinctes — « faut-il
chiffrer au repos ? », « faut-il revérifier que le message existe encore ? » — et
ont la même réponse pour une raison qui n'est pas une coïncidence : **toutes deux
portent sur la présence d'un secret dans la charge.**

| famille | la charge porte | la garde |
|---|---|---|
| `new` `edited` `translation` `link-message` `attachment-updated` | le TEXTE | **s'applique** |
| `deleted` `expired` | la MORT du message | **doit passer** |
| `pinned` `unpinned` + 4 réactions | des identifiants, un emoji | rien à garder |

C'est le même fait que le cycle 139 : *la loi existait, et le site fautif était le
seul à ne pas l'appeler.* Deux cycles de suite, le travail utile a été de
CHERCHER la règle avant de l'écrire.

### Trois décisions de forme

- **Le refus est DÉLIBÉRÉ, donc il ne passe pas par `dropEntry`.** Celui-ci
  journalise en ERROR une perte à rattraper et NOMME sa conversation dans
  `pending-messages:delivered`, pour y envoyer le client relire. Ici il n'y a
  rien à relire : le serveur a détruit le contenu et le client n'en a jamais rien
  reçu — la convergence est déjà atteinte. C'est la forme du gate
  d'appartenance, pas celle d'un échec d'émission.
- **Les `messageId` sont filtrés sur la forme ObjectId AVANT l'agrégation**
  `id: { in: [...] }` — la leçon du cycle 112 portée à une lecture NEUVE. Un id
  illisible ferait lever la requête pour tout le lot, et le `catch` fail-open
  transformerait une entrée corrompue en désactivation de la garde pour les
  autres : c'est-à-dire en fuite du secret qu'on vient de fermer.
- **UN instant pour tout le lot**, pour que deux entrées d'une même rafale ne
  tombent pas de part et d'autre d'une échéance.

### Le témoin en DEUX moitiés

`drain-message-liveness.test.ts`, 12 témoins. **5 rouges avant correction** (le
contenu détruit, l'échéance passée, l'édition, la traduction, le compte de
remise) et **7 verts d'emblée, qui devaient le rester** (l'annonce d'expiration
et de suppression du MÊME message mort, l'épingle, la réaction, la ligne absente,
la lecture en échec, et l'absence de toute lecture quand rien ne porte de texte).

C'est la répartition qui compte : les 7 sont la garde contre le correctif trop
large, et sans eux rien n'aurait signalé que la « réparation » venait de rendre
un message détruit éternel à l'écran.

## Lot B — la porte et la diffusion n'avaient pas la même définition de « membre » (#16690)

Toute PORTE D'ACCÈS exigeait `PARTICIPATION_VIVANTE` (actif **et** `bannedAt`
nul ou absent). Les DIFFUSEURS lisaient `isActive` NU. Une ligne
`isActive: true, bannedAt ≠ null` existe en base — bannir pendant l'inactivité
n'écrit que `bannedAt`, puis `restore-for-me` rallumait `isActive` avant #10436,
qui a fermé le producteur sans reprendre les lignes existantes. Une telle ligne
n'est pas dans `conversation:<id>`, **mais sa room `user:<id>` est rejointe
inconditionnellement** : c'est par là qu'elle recevait les accusés, la pastille,
et le rejeu hors ligne du contenu entier.

### L'issue nommait TROIS sites. Le balayage en a trouvé QUINZE.

Leçon 261, vérifiée une fois de plus : *une énumération de sites porte deux
affirmations — « ces sites appliquent la règle » (vérifiable) et « ce sont les
sites où elle s'applique » (presque jamais vérifiée).* **Douze resserrées** :
aperçu de liste, rejeu hors ligne (ses DEUX requêtes), pastille, accusés de
lecture, pièce jointe mise à jour, aperçu de conversation, activité, remise auto
aux connectés, accusés du drain, effectif restant d'une révocation, appel manqué,
pont d'agent, sonnerie d'un appel de groupe.

### Et DEUX ne le sont pas, parce que les resserrer OUVRIRAIT une fuite

C'est la découverte qui a décidé du lot, et elle vaut au-delà de lui.
`translationReaders` porte les deux requêtes dans un **seul `Promise.all`** : la
lawful construit `rooms` (qui REÇOIT), la nue construit `excludedQueueKeys` (qui
ne doit RIEN recevoir, pas même en file). Un membre actif-et-banni est dans la
nue, pas dans les autorisés, **donc il atterrit dans l'exclusion**. Resserrer
l'aurait fait disparaître de la liste de REFUS, et la file lui aurait servi la
traduction.

> **Une audience se construit sur le sous-ensemble le plus ÉTROIT, une liste de
> refus sur le plus LARGE** : c'est le même raisonnement fail-closed, et il rend
> des verdicts OPPOSÉS. Un ensemble ne se resserre pas parce qu'une loi existe,
> mais si le resserrement est le sens où il échoue fermé.

Même forme pour `_getBlockedSocketIdsInRoom`, qui rend les sockets à exclure
d'une diffusion de frappe **et** décide `typerIsRegistered`, donc laquelle des
deux lois de confidentialité s'applique. Détail et comment on attrape la
distinction (par le nom de la variable et son consommateur, jamais par le
`where`, identique des deux côtés) :
`tasks/lessons/2026-11-07-une-audience-se-resserre-une-liste-de-refus-s-elargit.md`.

**Conséquence sur le cliquet** : son inventaire est NON vide par construction, à
l'inverse de l'usage du dépôt. Ses deux entrées ne sont pas de la dette, ce sont
des décisions motivées — un cliquet qui exigerait le vide pousserait le prochain
lot à « réparer » les deux sites corrects.

### La jumelle était un NOM

`ADMITTED_FILE_READER_WHERE` valait `{ isActive: true, ...unsetOrNull('bannedAt') }`,
byte pour byte `PARTICIPATION_VIVANTE`. Deux définitions d'une seule règle, et
c'est son NOM qui la rendait invisible : on ne cherche pas
`PARTICIPATION_VIVANTE` en lisant `fileReaderAdmission`. Elle DÉRIVE désormais,
le nom survivant parce qu'il dit l'usage — et le cliquet ne l'accepte comme
épellation de la loi que parce qu'un témoin voisin prouve l'identité.

### Le remède était plus dangereux que le mal

`{ bannedAt: null }` est une **égalité** et n'apparie PAS une colonne ABSENTE —
l'état de toute ligne jamais bannie, donc de l'immense majorité. Écrite
naïvement, cette loi aurait **vidé toutes les audiences de diffusion de la
passerelle** (le dépôt a payé ce piège quatre fois en production).

Le témoin le plus important du lot n'est donc pas celui qui prouve qu'un banni ne
reçoit plus, c'est celui qui prouve qu'un membre **jamais banni reçoit
toujours**. Et il n'a eu de valeur qu'une fois rendu capable de TOMBER : ma
première version de l'évaluateur de `where` n'évaluait `bannedAt` que dans une
clé `OR`, si bien que la forme naïve passait au VERT. **Un évaluateur incomplet
est un double qui ment par ce qu'il ne REGARDE pas.**

### Le cliquet a corrigé deux de mes erreurs, dans les deux sens

- **sur-signaler** : un `[^}]*` pour capturer un `where` s'arrête dans le premier
  objet imbriqué (`conversationId: { in: [...] }`) — un site conforme signalé, que
  j'ai failli « re-réparer » ;
- **omettre** : un discriminant d'identité écrit `/\buserId\b/` écartait en
  silence **trois audiences réelles** dont le `where` porte `userId: { not: null }`,
  un filtre de NULLITÉ qui ne nomme personne. Le troisième site ainsi retrouvé
  (`CallEventsHandler`, la sonnerie d'un appel de groupe) n'est apparu qu'après
  cette correction.

> Un balayage qui tronque se trompe dans les deux sens, **et seul le sens
> rassurant est silencieux.**

### Trois doubles repointés

`unsetOrNull` rend une clé `OR`. Trois doubles de `revokeShareLinkGuests`
rangeaient leurs requêtes par `if (where?.OR)` — la marque, jusqu'ici, des
requêtes d'invités. La loi en a donné une à la requête d'effectif, qui s'est mise
à répondre la liste des invités ; l'un des trois faisait alors passer un témoin de
chemin d'**erreur** par le chemin **nominal**. Ils discriminent désormais sur
`type: 'anonymous'`, ce que la requête DÉCLARE.

## Migration

`packages/shared/prisma/migrations/2026-11-07-participant-active-and-banned.mongodb.js`
— **à blanc par défaut**, lots bornés, idempotente. Elle aligne les lignes
existantes sur ce que `resolveBanWrite` écrit aujourd'hui (`isActive: false`,
`leftAt` daté seulement s'il manque) et **ne lève PAS le bannissement** : une
réparation ne décide pas à la place d'une décision de modération.

**Son application en production attend le feu vert du porteur** (#9223), après
sauvegarde vérifiée et passage sur staging. Elle n'a été exécutée nulle part.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** (lu hors pipe — le code de retour d'un pipeline est celui de `head`) |
| suite gateway complète | **2 515 suites vertes / 2 521 ; 39 549 témoins verts** |
| rouges restants | **17, dans les 6 suites de codecs d'image** (HEIF, AVIF 10 bits, carte de gain HDR, orientation EXIF) |
| mutations jouées | `isActive` nu ⇒ les gardes tombent · `bannedAt: null` ⇒ la non-régression tombe · gate de vivacité retiré ⇒ 5 des 12 tombent |

**Les 17 rouges sont étrangers à ces lots, et le compte le prouve** : ce sont
exactement les 6 suites et les 17 témoins que le cycle 139 avait mesurés et
documentés le matin même (capacité libvips du conteneur, verts en CI). La
première passe du jour en rendait 23 — les 6 de plus étaient les miens
(inventaire des lecteurs de `Message`, assertion de requête de la pastille,
doubles de révocation), tous réparés.

## Dimensions

**Mûres** : 1 (Sécurité — un contenu détruit ne se remet plus, un banni ne reçoit
plus rien), 11 (Maintenabilité — deux lois extraites en site unique, une jumelle
de nom retirée, deux cliquets), 13 (Complétude — les cinq familles porteuses de
texte, les quinze audiences relevées, les deux exclusions motivées).

**Restantes, avec leur issue** : #16706 (la moitié STOCKAGE — le clair d'un
message détruit survit dans Redis jusqu'au TTL de 48 h, et `peek` est un second
lecteur sans garde).

## Ce que le cycle 139 a déposé et que ce cycle n'a PAS pris

Intacts, vérifiés toujours ouverts : **#16687** (une socket dont la jonction aux
rooms a échoué est inscrite quand même, ce qui DÉSARME la file), **#16688** (la
file est par UTILISATEUR : un appareil hors ligne ne converge pas si un autre
était connecté), **#16689** (`message:edited` transporte le `clientMessageId` de
l'auteur vers toute la room), **#16691** (la pastille se vide pour un message
sans expéditeur).
