## Leçon 294 — Un indice de connectivité n'est pas un verdict, et une relation REQUISE fait échouer la requête entière (2026-08-26, « bandeau hors ligne permanent »)

**Contexte.** « Les appels ne passent plus, les sockets temps réel du web non plus,
la pastille est rouge tout le temps et le bandeau hors ligne est permanent. » Le
serveur était SAIN — prouvé par une sonde Socket.IO depuis la même IP publique
(377 ms, `authenticated`) puis par une reproduction Playwright du build déployé
(session fraîche verte). Traefik montrait pourtant **deux sockets de ce même
compte authentifiés depuis 40 minutes** pendant que l'onglet affichait « Vous
êtes hors ligne ». Le bandeau et la puce lisaient `navigator.onLine` comme un
VERDICT ; le socket vivant ne pesait rien.

> **Un signal heuristique du navigateur (`navigator.onLine`) ne peut pas
> contredire une preuve directe (un socket authentifié qui reçoit des
> événements).** `isOnline = navigator.onLine || socketConnected` : l'indice ne
> compte que tant que la preuve manque. Et un événement `online`/`offline`
> RESYNCHRONISE l'état depuis les diagnostics au lieu de le forcer — forcer
> `isSocketConnected=false` sur `offline` puis ne rien relire sur `online`
> laissait un socket survivant annoncé mort, ce qui armait les boucles de
> `reconnect()` (qui commence par DÉCONNECTER).

Second défaut, trouvé par la même chaîne de logs : à CHAQUE reconnexion de ce
compte, `_emitUnreadCountsSnapshot` levait `Inconsistent query result: Field
conversation is required` — une seule ligne `Participant` de 2025 pointait vers
une conversation supprimée, et le `select` imbriqué sur la relation REQUISE
faisait tomber les 118 compteurs vivants avec elle.

> **Une relation requise dans un `select`/`include` Prisma transforme UNE ligne
> orpheline en échec de TOUTE la requête.** Lire la table cible À PART (`findMany
> where id in`) exclut naturellement l'orpheline, la rend visible (log) et ne
> demande aucun `try/catch` de repli. Corollaire de diagnostic : un `WARN` répété
> à chaque reconnexion d'un seul compte est une donnée corrompue, pas un flake.

Méthode qui a tranché, dans l'ordre : logs serveur du compte (le symptôme est-il
côté serveur ?) → sonde protocolaire depuis la machine du plaignant (le réseau ?)
→ reproduction du build déployé en session fraîche (le code ?) → historique
Traefik de l'IP (l'état de CET onglet). Chaque étape a éliminé une couche avant
de lire le code du client — et c'est la dernière qui a désigné `navigator.onLine`.

Sites : `apps/web/hooks/use-connection-status.ts` (`deriveStatus`),
`services/gateway/src/socketio/MeeshySocketIOManager.ts` (`_emitUnreadCountsSnapshot`).
