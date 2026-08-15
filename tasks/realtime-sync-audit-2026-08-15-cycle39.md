# Audit synchro temps réel — cycle 39 (2026-08-15)

## Point de départ : la piste du cycle 38, et pourquoi elle n'est pas celle-ci

Le cycle 38 concluait que le cycle suivant devait porter **sur iOS** : donner au
SDK une notion d'« identité de l'acteur courant » couvrant les deux populations
(`User.id` ou `Participant.id` d'une session anonyme), puis aligner les trois
gardes dessus.

Cette piste reste juste et reste ouverte. Elle n'est pas livrable **depuis cet
environnement** : Linux, aucune toolchain Swift (`swift`, `swiftc`, `xcodebuild`
absents), donc ni compilation ni exécution des suites SDK/app. C'est la même
borne que celle énoncée en tête du cycle 36 — « gateway + `packages/shared`
testables, **pas de toolchain Swift** — aucune modification SDK/iOS livrée ce
cycle » —, et livrer une identité d'acteur non compilée serait un pari, pas un
correctif. Ce cycle prend donc une autre famille, testable de bout en bout ici,
et **rapporte en fin de document deux constats iOS mesurés au passage**, dont un
qui déborde largement le sujet du cycle 38.

## Constat : la règle du masquage personnel avait trois consommateurs et zéro déclencheur

Meeshy possède deux façons de retirer du contenu de sa PROPRE vue sans y toucher
pour les autres : « supprimer pour moi » (`UserMessageDeletion`) et « effacer
l'historique » (`UserConversationPreferences.clearHistoryBefore`). Les deux sont
prises en compte partout où on LIT :

| Surface | Ce qui applique le masquage |
|---|---|
| `GET /conversations` | `resolveVisibleLastMessages` |
| recherche de conversations | idem |
| `GET /sync` | `personalHistoryFilter` |
| fan-out temps réel de l'aperçu | `resolvePersonalPreviewOverrides` (dans `emitConversationPreviewUpdate`) |

La dernière ligne est la machinerie installée pour que la **ligne de liste** d'un
lecteur masquant ne lui repousse pas le message qu'il vient d'en retirer. Elle
est complète, testée, et son propre en-tête décrit le défaut qu'elle corrige :

> un lecteur qui a fait « supprimer pour moi » sur le dernier message voyait ce
> message REVENIR dans sa ligne de liste **à la mutation suivante** de la
> conversation — une édition d'un autre message, une suppression, une traduction
> qui atterrit.

Trois appelants la déclenchent : l'édition, la suppression pour tous, la
traduction qui atterrit. **Aucun d'eux n'est le geste qui crée le masquage.**

Conséquence, à la lettre : masquer le dernier message d'une conversation retire
la bulle du fil (`message:hidden-for-me` le dit, et les deux clients l'écoutent)
et **ne touche pas la ligne de liste**, qui continue d'afficher l'aperçu de ce
qu'on vient de masquer. La correction n'arrive qu'au prochain événement SANS
RAPPORT ; si rien d'autre ne bouge dans cette conversation, jamais.

Le point qui rend le défaut non contournable côté client : **le remplaçant n'est
pas calculable par le client.** Le nouvel aperçu est le dernier message encore
visible POUR CE LECTEUR — potentiellement hors de la page chargée, ou masqué lui
aussi. Seul le serveur peut le rendre, et il le sait déjà faire.

### Les quatre écrivains concernés

| Route | Table écrite | Rafraîchissait la ligne |
|---|---|---|
| `DELETE /api/messages/:id/delete-for-me` | `UserMessageDeletion` | non |
| `DELETE /api/messages/bulk/delete-for-me` | `UserMessageDeletion` (≤ 100) | non |
| `POST /api/messages/:id/restore-for-me` | `UserMessageDeletion` (suppression de ligne) | non |
| `POST /api/conversations/:id/clear-history` | `clearHistoryBefore` | non |

Les trois premières passent par `personalMessageVisibilitySync`, le module dont
l'en-tête énumère « three things that only work as a set ». Il en manquait une
quatrième, une couche plus loin : le fil savait, la ligne de liste non.

## Le correctif

**1. Une troisième borne au fan-out d'aperçu** — `PreviewUpdateScope.onlyForReaderUserId`.

Les deux bornes existantes tiennent l'INSTANT (`onlyIfLatestIs`) et la LANGUE
(`onlyIfPreviewCarriesLanguage`), toutes deux nées du même argument : ne pas
re-diffuser à tous une ligne qui n'a changé que pour certains. Un masquage
personnel est le cas extrême de cette famille — **le dernier message GLOBAL n'a
pas bougé d'un octet**, donc tous les autres participants recevraient un payload
identique à l'octet près, un événement chacun, par geste.

La borne se pose AVANT la sonde de masquage et avant la boucle d'émission, parce
qu'elle vaut pour les deux : demander à la base si CHAQUE participant a masqué
cet aperçu, alors qu'un seul vient de le faire et qu'on sait lequel, poserait la
question la plus large pour la réponse la plus étroite.

Elle sélectionne par `Participant.userId`, donc un lecteur INSCRIT — les quatre
routes sont montées `allowAnonymous: false` et les deux tables de masquage sont
elles-mêmes scopées `userId`. Un participant sans compte ne peut ni écrire dans
l'une ni figurer ici ; c'est une propriété du domaine, pas une omission.

**2. Un déclencheur unique** — `services/messaging/personalPreviewRefresh.ts`.

`refreshPersonalConversationPreview(fastify, { userId, conversationIds })` :
coalesce les conversations d'un lot, borne le fan-out au lecteur, et laisse
`emitConversationPreviewUpdate` faire le reste. UNE ligne par CONVERSATION,
jamais une par message — un lot va jusqu'à 100 ids et peut traverser plusieurs
conversations, mais une ligne de liste ne se recalcule qu'une fois.

Câblé aux quatre écrivains : les trois de `personalMessageVisibilitySync` (dont
la restauration, symétrique — rendre un message peut lui rendre la place de
dernier message visible) et la route `clear-history`.

**3. Posture d'échec, identique à celle du module qu'il complète.** Canal
best-effort : un rafraîchissement qu'on ne sait pas calculer ne doit jamais faire
échouer un masquage qui, lui, a bel et bien pris effet — l'utilisateur rejouerait
un geste déjà appliqué. `emitConversationPreviewUpdate` avale déjà ses propres
pannes ; le `onError` ne fait que les rendre corrélables à la requête d'origine.

## Ce qui a été VÉRIFIÉ chez les consommateurs

- **Web** — `use-socket-cache-sync.handleConversationUpdated` applique le patch
  **sans condition** sur la ligne de cache. Le correctif prend effet de bout en
  bout dès aujourd'hui.
- **iOS** — `ConversationStore.merging` applique le groupe d'aperçu **sous garde
  monotone** : `lastMessageAt >= conv.lastMessageAt`. Voir § Constats iOS.
- **Aucun changement de contrat** : le payload est celui que trois appelants
  émettent déjà, à la même forme, avec le même `updatedBy`.

## Les doubles de test qui rendaient le défaut invisible

Les deux suites qui couvraient ces routes déclaraient un prisma **incomplet** :
ni `participant.findMany`, ni `message.findFirst`, ni
`userConversationPreferences.findMany`. Or l'émetteur d'aperçu est un canal
best-effort qui **avale ses propres pannes** — un double incomplet le rend donc
silencieux, et un test écrit dessus reste vert sur une version qui n'appelle
rien. Les deux harnais sont complétés ici, avec le commentaire qui dit pourquoi :
*un double muet ne distingue pas « n'a pas été appelé » de « a échoué en
silence », et c'est exactement la distinction que ces témoins existent pour
faire.*

## Gates

- **11 RED discriminants vus rouges avant correctif** (vérifié en restaurant la
  version d'origine, puis restauré) : 3 sur la borne d'audience, 4 sur le
  contrat de service, 4 sur le câblage des routes.
- 5 non-régressions vertes d'emblée, dont les gardes anti-sur-correction : le
  fan-out complet reste complet en l'absence de borne, un lot sans message
  accessible ne rafraîchit rien, une panne du recalcul ne fait pas échouer le
  masquage.
- Suite gateway complète : **724 suites / 17748 tests verts** (321 s).
- `npx tsc --noEmit` (gateway) : **13 erreurs, identiques avec et sans ce diff**
  (`routes/auth/login.ts`, `routes/auth/magic-link.ts` — corps de requête typés
  `{}`). Pré-existantes, mesurées par `git stash` ; ce diff n'en ajoute aucune.
  Le cycle 38 notait « propre » — l'écart vient de la génération du client
  Prisma, pas du diff.

## Constats iOS — mesurés, NON livrés (pas de toolchain Swift ici)

**A. La garde monotone iOS refuse un aperçu qui recule dans le temps, et ce
n'est pas propre à ce cycle.**

`ConversationStore.merging` (`packages/MeeshySDK/.../Store/ConversationStore.swift`)
n'applique le groupe d'aperçu que si `event.lastMessageAt >= conv.lastMessageAt`.
Le commentaire explique le `>=` (une ÉDITION garde le même `createdAt`) et la
garde protège d'un événement périmé arrivé dans le désordre. Mais **un recalcul
d'aperçu autoritatif peut légitimement reculer**, et il le fait dans trois cas
déjà en production, avant ce cycle :

1. suppression POUR TOUS du dernier message → l'aperçu redevient le message
   précédent, donc plus ANCIEN ;
2. `resolvePersonalPreviewOverrides` servant à un lecteur masquant son propre
   dernier message visible — plus ancien par construction ;
3. (ajouté par ce cycle) le rafraîchissement au moment du masquage.

Dans les trois cas la garde jette le groupe entier. Le correctif de ce cycle est
donc **effectif sur web, inerte sur iOS**, comme l'était déjà la moitié
personnelle du fan-out d'aperçu. Le serveur, lui, doit dire la vérité dans les
trois cas : sans l'événement, même un client qui l'accepterait n'aurait rien à
appliquer.

Ce qu'il ne faut PAS faire : omettre `lastMessageAt` du payload pour passer sous
la garde. Le champ deviendrait faux et l'ordre de la liste avec lui — on
remplacerait un aperçu périmé par un tri périmé.

La bonne réponse est côté client et demande un discriminant : distinguer « cet
événement est périmé » (à jeter) de « le serveur a recalculé et l'aperçu recule »
(à appliquer). Le payload porte déjà de quoi le faire — `lastMessageId` DIFFÈRE,
et `updatedAt` date l'événement, pas le message. C'est le cycle à mener sur une
machine avec Swift, et il est plus large que ce cycle-ci : il débloque aussi la
suppression pour tous, qui est un chemin nominal.

**B. Le cycle 38 rappelé, inchangé.** `ConversationStoreSocketBridge` compare
`event.userId == me` avec `me = AuthManager.shared.currentUser?.id`, nil pour une
session anonyme ; `ConversationSyncEngine.handleReadStatusUpdated` compare
`event.userId ?? event.participantId` à la même valeur. Aucun des deux ne
reconnaît un invité de lien comme « moi ». Le gateway envoie désormais les deux
moitiés de l'information (cycle 38) ; il manque toujours l'identité d'acteur
côté SDK. À noter pour ce cycle-là : la forme tolérante `userId == k ||
participantId == k` est **interdite** par la leçon 271 — le lecteur se reconnaît
par `participantId` s'il est anonyme, par `userId` sinon, jamais par les deux.

## Surfaces balayées et trouvées CORRECTES (ne pas ré-instruire)

- **`conversation:participant-left` / `-banned` pour un anonyme.** Suspectés de
  porter la même conflation d'identités que le cycle 38 (`userId: string` non
  nullable). Faux positif : les deux émetteurs (`routes/conversations/leave.ts`,
  `routes/conversations/participants.ts`) apparient par
  `where: { conversationId, userId, isActive: true }` sur la relation, ce qu'une
  ligne `Participant` sans `User` ne peut pas satisfaire. Ces chemins sont
  inatteignables pour un invité de lien ; y ajouter une dérivation serait du
  bruit. (Le `PARTICIPANT_LEFT` d'`AuthHandler` est celui des APPELS, autre
  domaine.)
- **`typing:start` / `typing:stop`.** Participation vérifiée avant diffusion,
  privacy vérifiée, throttle par (user, conversation), retraction gardée par
  `activeTypers`, suppression multi-appareils des deux côtés (stop explicite et
  déconnexion), et amortissement de l'asymétrie start-limité/stop-non-limité.
  Rien à reprendre.
- **`personalMessageVisibilitySync` — les trois premières obligations.**
  Persistance, rétraction de la notification qui détient l'extrait, diffusion à
  `user:{id}` : les trois sont tenues et testées. Seule la quatrième manquait.
