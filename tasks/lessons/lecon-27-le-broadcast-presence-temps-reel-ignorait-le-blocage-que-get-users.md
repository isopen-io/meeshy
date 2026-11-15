## Leçon 27 — Le broadcast présence temps réel ignorait le blocage que `GET /users/presence` enforce (2026-07-05, itération 99)

Sibling drift entre le chemin REST et le chemin socket de la présence. `GET /users/presence`
(`routes/users/presence.ts:111`) résout la visibilité via `PresenceVisibilityService.resolveForTargets`,
qui masque `isOnline`/`lastActiveAt` (retourne `HIDDEN`) dès que l'un des deux users a bloqué l'autre
(`isBlockedEitherWay`, doc `2026-06-30-profile-last-seen-visibility-design.md`). Les DEUX chemins temps
réel jumeaux ne connaissaient QUE `showOnlineStatus`/`showLastSeen` (préférences globales) et n'appelaient
jamais cette vérification de blocage : `_applyPresencePrefs`/`_emitPresenceSnapshot`
(`MeeshySocketIOManager.ts:563-640`, snapshot initial envoyé au socket à la connexion) et
`_broadcastUserStatus` (`:1587-1667`, fan-out à chaque connexion/déconnexion vers toutes les rooms de
conversation de l'utilisateur). Concrètement : A bloque B, les deux restent co-participants d'un groupe
(bloquer ne retire jamais des conversations partagées) ; quand B se connecte, A reçoit quand même son
`isOnline`/`lastActiveAt` réels par socket — alors que `GET /users/presence` pour la même paire les
aurait masqués. Fuite de vie privée silencieuse sur le canal qui reste ouvert en permanence.

**Fix** : nouveau helper batché `getBlockedUserIdsAmong(prisma, userId, candidateIds)` dans
`utils/blocking.ts` (2 requêtes groupées, miroir de `PresenceVisibilityService.resolveForTargets`'s
calcul de blocage, réutilisable). (1) `_applyPresencePrefs` prend maintenant `viewerId` et masque
`isOnline`/`lastActiveAt` (mêmes valeurs que `HIDDEN`) pour tout contact bloqué avec le viewer — les
deux call-sites dans `_emitPresenceSnapshot` passent le `userId` du socket qui se connecte. (2)
`_broadcastUserStatus` calcule l'ensemble des viewers actuellement connectés (`this.connectedUsers`)
en relation de blocage avec le broadcaster, résout leurs socket ids via `this.userSockets`, et utilise
`io.to(rooms).except(blockedSocketIds)` — un `socket.id` est aussi une room Socket.IO auto-join, donc
`.except(socketId)` exclut précisément ce viewer du fan-out sans affecter les autres participants de la
même room. Pas de query DB supplémentaire quand personne d'autre n'est connecté (fast-path `[].length
=== 0`). RED→GREEN : `utils/__tests__/blocking.test.ts` (+7 cas sur le nouveau helper) +
`MeeshySocketIOManager.test.ts` (+3 cas : snapshot masque un contact bloqué, broadcast exclut le socket
d'un viewer bloqué, broadcast n'appelle PAS `.except()` en l'absence de blocage). Suite gateway complète
(workaround `client_default` transitoire Leçon 20, schema restauré immédiatement après, `git diff` vide) :
506/506 suites, 13707/13708 tests (1 skip pré-existant).

**Règle réutilisable** : quand une règle de visibilité/privacy (blocage, visibilité de post, etc.) est
enforced sur un endpoint de lecture ponctuelle (REST), auditer SYSTÉMATIQUEMENT le canal temps réel
jumeau (snapshot de connexion + broadcast incrémental) — un canal qui reste ouvert en permanence est
un vecteur de fuite plus grave qu'un endpoint interrogé à la demande, et c'est précisément le genre de
sibling que ce backlog a déjà trouvé divergent à plusieurs reprises (mentions, postType, casse de
langue, cursor read/delivered).
