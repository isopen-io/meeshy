# Cycle 143 — une langue perdue pour toujours, une population sans reconnexion, et deux portes muettes

**Issues livrées** : #16751 (lot A, passerelle) · #16750 (lot B, SDK iOS) ·
#16830 (lot C, passerelle) · #16837 (lot D, passerelle).
**Branche** : `claude/exciting-planck-zigx42`. **PR** : #16829.
**Milestones** : #250, #251, #252 (et celui de #16750, préexistant).
**Issues ouvertes en chemin** : #16838 (`décision-produit`).

## Ce que ce cycle a cédé, et pourquoi c'est encore la première décision

Le cycle 142 a déposé huit défauts. Trois ont été fermés par des sessions
sœurs avant ce cycle (#16745, #16749, #16752) ; **#16688 est cédée pour la
seconde fois** — ses deux fichiers (`offlineParticipantQueue.ts`,
`MeeshySocketIOManager.ts`) sont écrits par `claude/exciting-planck-xdp7ig` et
`claude/exciting-planck-4nctmx`. Le corollaire d'asymétrie tranche sans
négociation : celui qui n'a rien écrit cède.

Le relevé a été fait par la commande, pas par intuition — un `git diff
--name-only origin/dev...<branche>` sur les 45 branches touchées dans les douze
dernières heures, filtré sur les chemins visés. Il a rendu **zéro contention**
sur les fichiers des quatre lots retenus, et la réservation a été poussée avant
la première ligne de logique.

## La contrainte qui a décidé de la forme du cycle, à nouveau

**Aucune chaîne Swift dans ce conteneur.** Un lot iOS n'est prouvable que par
`sdk-tests.yml` (~40 min, `workflow_dispatch` avec `only_testing`) ; un lot
passerelle se prouve sur place en quelques secondes. Trois des quatre lots sont
donc côté passerelle, et le lot Swift est celui dont la preuve se construit
PAR LECTURE : des gardes de source dont chaque prédicat a été **rejoué en
Python sur les deux révisions**.

## Lot A — un doublon du bus faisait perdre une langue DÉFINITIVEMENT (#16751)

`triggerStoryTextTranslation` retirait son écouteur sur un COMPTEUR
d'événements. Le bus relaie les doublons par conception : les deux `emit` de
`ZmqTranslationClient.setupEventForwarding` sont INCONDITIONNELS (`settled ===
null` ne gouverne que `retryCount.delete`), et le deadman de
`sendTranslationRequest` redemande les langues manquantes **sous le même
taskId**.

Audience `[fr, es, de]`, une langue lente-mais-vivante au passage du deadman
de 30 s : `es` revient deux fois, le compteur atteint 3, l'écouteur part, et
`de` arrive **sans écouteur**. `Post.translations.de` n'est jamais écrit. Aucune
relance : le Prisme sert l'original, et aucun client ne refetche une traduction
absente de la base. **Un lecteur germanophone voit la story dans la langue de
l'auteur pour toujours.**

Le suivi porte désormais sur l'ENSEMBLE des langues ATTENDUES, dont on retire
la langue servie. Insensible au doublon — et insensible de même à un événement
portant une langue que cette story n'a pas demandée, qui retirait l'écouteur
aussi sûrement qu'un doublon. C'est le second témoin qui l'a montré, et il
n'était pas dans l'énoncé de l'issue.

> Le consommateur FRÈRE du même événement scopé faisait déjà correct
> (`call-transcription-relay.ts` monte un écouteur par langue). **Deux
> consommateurs du même événement, un seul correct** — et le journal du site
> fautif disait « all languages received » alors qu'il avait compté des
> ÉVÉNEMENTS.

### Le cliquet de taille a eu raison, et il a changé le lot

`PostService.ts` mesurait 2 225 lignes — hors budget, donc interdit d'ajout.
La traduction du contenu d'une story est partie vers
`services/posts/storyContentTranslation.ts` (195 lignes), où elle porte seule
sa doctrine ; le fichier descend à 2 118. **Et son gel passe de 2 628 à 2 118** :
les 403 lignes de marge que le gel portait sont rendues au dépôt, sans quoi un
correctif pouvait grossir un fichier hors budget sans qu'aucun cliquet ne le
voie. Un cliquet qui porte quatre cents lignes de marge ne garde rien.

## Lot B — « pas de JWT » n'est pas « pas de session » (#16750)

Les trois portes de reconnexion automatique de `MessageSocketManager` testaient
`APIClient.shared.authToken != nil`. Un invité de lien partagé n'a pas de JWT :
son identifiant VALIDE vit dans un champ distinct, et son transport est bâti
par une autre porte.

La passerelle coupe les sockets invité PAR CONCEPTION et sans code d'erreur
(`guestLinkWatch` fail-close à la revérification), ce qu'une erreur Mongo
transitoire suffit à déclencher sur un lien parfaitement valide. Le lecteur
`.error` ne trouve rien de terminal, `SocketDisconnectPolicy.retries` rend
`true` — donc Socket.IO ne réessaie PAS lui-même — et l'échelle rendait la
main. **« Reconnexion… » définitif, plus rien en temps réel, pour seule
échappatoire de mettre l'app en arrière-plan.**

**Élargir le seul GARDE aurait été PIRE que le défaut.** `forceReconnect()`
exécute `suspendTransport()` puis `establishTransport()`, qui ne savait bâtir
qu'un transport d'INSCRIT : une échelle armée tuait une socket vivante sans
rien rebâtir. C'est la RECONSTRUCTION qui apprend le credential —
`APIClient.requestCredential`, dont le doc-comment décrit ce défaut d'avance :
« un `String` nu oblige chaque appelant à SUPPOSER le protocole ».

### Deux constats de l'audit ne tenaient PAS, et c'est le résultat le plus utile

L'agent d'audit a rendu cinq sous-constats ; **deux sont faux**, et les avoir
re-vérifiés a changé le lot :

| constat | verdict |
|---|---|
| `resumeFromBackground()` exclut les invités | **faux en FAIT** — l'app route une entrée sans compte vers `resumeWithoutSession()`. Le garde est élargi parce qu'il l'excluait en DROIT. |
| les « jumeaux identiques » de `SocialSocketManager` sont le même défaut | **faux** — cette socket n'a AUCUN `connectAnonymous` (mesuré : zéro site), donc un invité n'en a aucune. Ses gardes `authToken` sont JUSTES. |

Le second aurait été une correction sans objet sur un sous-système entier. Une
garde de source fige désormais l'asymétrie, pour qu'une prochaine passe ne la
« corrige » pas par symétrie.

> **Une symétrie LEXICALE n'est pas une symétrie de propriété.** C'est la faute
> du cycle 107 (« le miroir client→serveur ») rejouée par un autre, et elle se
> rattrape de la même façon : en ouvrant les deux côtés plutôt qu'en transposant
> la conclusion.

### La cohésion a imposé une extraction, et l'extraction a fermé un défaut

Le correctif portait le type de 1 928 à 1 959 lignes en unité : EN HAUSSE,
refusé par le cliquet. La configuration de transport est donc partie vers
`SocketTransportFactory` — et pas pour gagner des lignes : le gestionnaire en
portait **DEUX copies**, celle d'un inscrit et celle d'un invité, qui ne
différaient que par leurs EN-TÊTES. Une option ajoutée à une copie manquait
silencieusement à l'autre. Le type descend à 1 909.

**Deux gardes de source ont dû suivre, et la seconde est une leçon.**
`SocketCompressionSourceGuardTests` passe de 2 blocs à 1 (plus un test qui
interdit au gestionnaire d'en reconstruire un chez lui — sans quoi une
troisième copie reviendrait sans faire rougir le premier, qui ne lit plus ce
fichier). Et `SocketTransportReplacementRetirementGuardTests` cherchait un nom
de FABRIQUE (`manager = makeTransport(`) : il aurait cessé de voir ses sites
**en silence**. Il cherche l'AFFECTATION (`manager = `), qui est ce qui relâche
vraiment le transport.

> **Chercher une forme fautive par le NOM de son helper, c'est manquer tous les
> sites qui l'obtiennent autrement** — et, quand le helper est renommé, c'est
> perdre les sites qu'on avait. Le discriminant juste est l'EFFET
> (`manager = `), pas l'appelé. L'exclusion de `manager = nil` a été **mesurée**,
> pas supposée : l'inclure portait le compte de 2 à 3 et faisait rougir la garde
> sur la porte qui APPLIQUE la loi.

## Lot C — une garde de confidentialité ANNONCÉE à tous, APPLIQUÉE aux inscrits (#16830)

`announceSwitch` promettait, dans son propre doc-comment, « la room personnelle
de CHAQUE membre actif ». Son code posait un `flatMap` qui JETTE tout
participant sans compte. La loi est `userId ?? id`, et c'est l'un des endroits
où le `CLAUDE.md` dit de ne jamais la réécrire.

**Et la projection était la seconde moitié du défaut — que le rapport d'audit
n'avait pas relevée** : `REGIME_SELECT.participants.select` ne chargeait pas
`id`. La room d'un invité n'était donc pas seulement non adressée, elle était
**INADRESSABLE**. C'est la forme des dix-sept sites du cycle 124.

Pire que silencieux : l'avis système part bien à la room de conversation, si
bien que l'invité assis dans le fil **lisait « X a activé le chiffrement »
pendant que son cache disait l'inverse**.

> **Un témoin de comportement ne peut pas voir un `select`.** Le double Prisma
> rend ses participants quel que soit la projection : les deux témoins de
> comportement de ce lot passeraient au VERT sur une requête qui oublie `id`.
> D'où un troisième, de PROJECTION, qui assert sur la REQUÊTE.

## Lot D — deux portes d'arrivée sur trois n'annonçaient rien (#16837)

| porte | annonçait l'arrivée ? |
|---|---|
| `POST …/participants` (ajout par un hôte) | **oui** |
| `POST …/invite` | **non** |
| jointure par LIEN (`performLinkJoin`, 3 routes) | **non** |

Le web n'invalide la feuille des membres QUE sur cet événement ; iOS invalide
son cache PERSISTÉ sur `conversation:joined` et écrit l'effectif ABSOLU de
`conversation:participant-joined`. **L'effectif ne pouvait DÉRIVER QUE VERS LE
BAS** : départ −1, bannissement −1, arrivée par lien rien.

La forme du défaut est celle que le `CLAUDE.md` nomme : `sharing-invite.ts`
**CITAIT sa jumelle** — « mirrors POST /conversations/:id/participants » — sur
la ligne de l'auto-join. La jumelle avait été ouverte, lue, et à MOITIÉ
reprise : la question posée était « comment rattacher les sockets ? », et la
réponse trouvée y répondait exactement.

Honnêteté de gravité : `…/invite` est un **piège armé, pas une panne mesurée**
(le web appelle `…/participants`, et le point d'entrée iOS n'a aucun appelant).
**La porte de LIEN est vivante**, et c'est là qu'est l'impact.

### Trois choses mesurées qui ont changé le lot

1. **Un invité ne peut pas être le SUJET de l'événement.** Le contrat déclare
   `userId` et `displayName` NON optionnels et les décodeurs clients sont
   stricts : une charge au `userId` nul ferait échouer le décodage de
   l'événement ENTIER plutôt que d'annoncer un invité. Le contrat a été RELU,
   pas supposé. Déposé en #16838 avec ses trois options — le précédent
   `USER_PREFERENCES_COMMUNITY_REORDERED` dit qu'un nom NEUF coûte moins cher
   qu'un élargissement. L'invité reste un DESTINATAIRE, et c'est
   `differsOrUnset` qui le garde dedans.
2. **Les 21 témoins de la porte conforme ont REFUSÉ ma clé d'exclusion**, et ils
   avaient raison sur le fond : l'extraction employait `id: { not: … }`, quand
   `differsOrUnset` existe précisément parce qu'un `NOT` nu perd les lignes sans
   compte sous MongoDB. La clé TESTÉE est la bonne, et ces 21 verts sont la
   preuve de non-régression de l'extraction.
3. **`getManager()?.getIO()` faisait rendre 500 à trois suites de route.**
   `getIO?.()` : l'éventail est ACCESSOIRE, et une adhésion déjà persistée ne
   doit pas échouer pour lui.

### Le balayage, et l'erreur qui l'a rendu bon

Un témoin par porte ne dit rien de la QUATRIÈME — celle qu'un lot futur
ajoutera sans savoir que cette loi existe ; le voisin
`conversation-new-member-rights-parity.test.ts` écrit déjà pourquoi. D'où
`member-arrival-door-sweep.test.ts`, qui gèle les cinq sites créant une ligne
`Participant` sans être une porte d'arrivée, chacun avec sa raison, et vérifie
d'abord qu'il TROUVE quelque chose : une sonde vide resterait verte sans rien
garder.

> **Sa première version ne cherchait que `participant.create(` et manquait
> `InitService`, qui emploie `createMany`.** Un balayage qui cherche UN idiome
> mesure sa popularité, pas une propriété — cycle 107, retrouvé en écrivant le
> cliquet. L'erreur commise en l'écrivant est le meilleur cas de test qu'il aura.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0**, 0 ligne (lu HORS pipe) |
| périmètre Post/story | **311 suites / 4 656 témoins verts** |
| périmètre encryption/conversation | **243 suites / 3 675 témoins verts** |
| périmètre participant/sharing/link/invite | **414 suites / 6 053 témoins verts** |
| cliquet de taille gateway | vert ; `PostService.ts` 2 225 → 2 118, gel 2 628 → 2 118 |
| cliquet de cohésion iOS | vert ; `MessageSocketManager` 1 928 → 1 909 |
| rouge, lot A | 2 des 3 témoins tombent ; le 3e (non-régression) vert des deux côtés |
| rouge, lot B | prédicats des gardes rejoués en Python sur les deux révisions : `authToken` lu 4 fois (attendu 0), 0 porte sur le credential (attendu 3), branche et signature absentes |
| rouge, lot C | les 3 témoins tombent |
| rouge, lot D | aucune des 3 portes ne contient `announceMemberArrival(` avant le lot |
| preuve Swift | `workflow_dispatch` de `sdk-tests.yml` |

Les rouges du dépôt qui subsistent sont les **6 suites de codecs d'image**
(HEIF, AVIF 10 bits, carte de gain HDR, orientation EXIF) — capacité libvips du
conteneur, mesurée et documentée aux cycles 139 et 142, vertes en CI, étrangères
aux quatre lots.

## Dimensions

**Mûres** : 13 (Complétude — une langue ne disparaît plus ; une population
entière n'est plus exclue de la reconnexion ; deux portes d'arrivée sur trois
étaient muettes) · 11 (Maintenabilité — trois extractions, une configuration de
transport au lieu de deux, un éventail d'arrivée au lieu d'un et deux silences,
deux cliquets qui rendent leur marge) · 9 (Compatibilité — les invités de lien,
deux fois) · 2 et 8 (plus de « Reconnexion… » définitif).

**Restantes, avec leur issue** : #16838 porte la décision produit de l'arrivée
d'un invité ; `conversation:new` pour un inscrit entrant par lien reste à
ouvrir ; et la recette sur appareil réel de #16750 revient au porteur (ouvrir un
lien invité, couper la socket côté serveur, vérifier le retour du temps réel
sans mise en arrière-plan).

## Ce que ce cycle a déposé et n'a pas pris

| issue | sujet | vérifié par la session ? |
|---|---|---|
| #16838 | l'arrivée d'un INVITÉ ne peut pas être annoncée sous le contrat actuel | **oui** — contrat relu |
| — | les communautés n'ont AUCUNE surface temps réel (rename, avatar, membres, rôles : invisible chez les autres membres ; aucun nom `community:*` au contrat) | partiellement — c'est un LOT, pas un correctif |
| — | iOS jette la portée COMMUNAUTÉ de `user:preferences-updated` (`category` non optionnel au décodeur) | piège armé : aucun consommateur iOS aujourd'hui |
| — | `PUT /user-preferences/communities/:id` upserte sans le filtre d'appartenance que son propre fichier exige vingt lignes plus bas | **oui** |

Et, intacte du cycle 140 : **#16688**, cédée pour la seconde fois.

## Méthode, confirmée une fois de plus

Les deux agents d'audit de ce cycle ont rendu **onze constats**. Les sept
re-vérifiés ligne à ligne ont tous tenu **sauf deux** (les deux du lot B), et la
re-vérification a par ailleurs TROUVÉ ce que les rapports n'avaient pas vu : la
projection manquante du lot C, et la limite de contrat du lot D. **Un rapport
d'audit se reçoit comme une piste, pas comme un constat** — et la relecture ne
sert pas seulement à écarter le faux, elle sert à trouver le reste.
