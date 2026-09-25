## 2026-08-13 (3) : La garde `deletedAt` va sur l'ÉCRITURE de l'épingle, pas seulement sur ses lectures

**Statut** : Accepté

**Contexte** : `PUT` et `DELETE /conversations/:id/messages/:messageId/pin` localisaient leur cible
par `{ id, conversationId }` seuls. Toutes les LECTURES de messages du service portent pourtant
déjà `deletedAt: null` — la liste (`GET /conversations/:id/messages`), la recherche, et la liste des
messages épinglés cent lignes sous les routes fautives (`{ pinnedAt: { not: null }, deletedAt: null }`).
Un message supprimé pour tout le monde n'est donc plus un objet épinglable : les deux ÉCRITURES de
l'épingle étaient les seules à ne pas le dire.

L'appel répondait `200`, écrivait `pinnedAt`/`pinnedBy` sur un tombstone, et diffusait
`message:pinned` dans la room de conversation **et** dans la file de rattrapage hors-ligne
(`enqueueOfflineMessageMutation`). Les clients appliquent cet événement à leur état local — web
`use-socket-cache-sync.handleMessagePinned`, iOS `ConversationSocketHandler` → `updatePinned` — et
rien ne les détrompe ensuite : la liste des épinglés filtre ce message, donc aucun rechargement ne
corrige l'état, et l'identité de dédup de la file étant `(messageId, 'pinned')`, l'entrée fantôme se
rejoue à chaque reconnexion jusqu'au TTL de 48 h.

L'unanimité des lectures est ce qui rendait le trou invisible : la donnée fausse est écrite, elle
est diffusée, et aucune lecture ne la rend jamais — donc rien ne la contredit non plus. Le seul
endroit où le défaut existe est **le fil temps réel**.

**Décision** : `deletedAt: null` dans le `where` des deux routes, dans les deux sens du geste.
N'en garder qu'un rouvrirait le trou par l'autre ; la mutation-proof le vérifie séparément (retirer
la garde du `PUT` fait rougir exactement ses 2 témoins, celle du `DELETE` exactement les 2 autres,
sans recouvrement).

**Ce qui a été délibérément écarté** : nettoyer `pinnedAt`/`pinnedBy` au moment de la SUPPRESSION,
de sorte qu'une épingle ne survive jamais à son message. Cela aurait demandé la même ligne dans les
**quatre** chemins qui écrivent `deletedAt` sur un message (`MessageHandler`,
`conversations/messages-advanced.ts`, `messages.ts`, `ExpiredMessagesCleanupService`) — la
duplication en N exemplaires dont un finit par manquer, motif que ce service a documenté trois fois.
La ligne survivante n'est visible nulle part (toutes les lectures filtrent `deletedAt: null`) et le
tombstone lui-même part au balayage : pas de défaut observable, donc pas de geste.

**Conséquence annexe, tranchée dans le même diff** : les deux diffusions composaient leur nom de
room et leur nom d'événement à la main (`` `conversation:${id}` ``, `'message:pinned'`) — les seules
du service à le faire. Le balayage d'audience du dépôt grepe `to(ROOMS.conversation(` (voir la note
de `participants.ts` § `PARTICIPANT_ROLE_UPDATED`, qui le nomme explicitement) : ces deux lignes lui
étaient donc invisibles, ce qui explique qu'un audit d'audience ait pu passer sans les voir. Elles
passent par `ROOMS.conversation()` / `SERVER_EVENTS`, à valeur identique — les tests existants
assertent les chaînes littérales et restent verts sans modification, ce qui est la preuve
d'équivalence. Écrire par la constante rend un site VISIBLE au prochain audit ; le recomposer à la
main l'en exclut, silencieusement et pour toujours.

**Non résolu, relevé ici** : l'épingle sert deux des trois audiences que `broadcastMessageMutation`
documente pour une mutation de message (room + file hors-ligne), jamais la troisième (`user:<id>`,
pour qui est sur la liste de conversations). Instruit et laissé en l'état : aucun client ne rend
aujourd'hui d'état d'épingle sur une ligne de liste, donc pas de défaut observable — même
raisonnement que celui déjà tenu pour `PARTICIPANT_ROLE_UPDATED`. À rouvrir dès qu'une ligne de
liste affiche une épingle.
