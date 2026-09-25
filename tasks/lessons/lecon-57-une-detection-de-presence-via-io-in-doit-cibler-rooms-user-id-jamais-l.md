## Leçon 57 — une détection de présence via `io.in()` DOIT cibler `ROOMS.user(id)`, jamais l'id brut (2026-08-05, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). `NotificationService.createNotification`
testait la présence pour l'e-mail immédiat haute priorité via `io.in(params.userId).fetchSockets()` —
l'**id brut**. Aucun socket ne rejoint un room à id brut : tous rejoignent `ROOMS.user(id)` (`user:${id}`,
`AuthHandler.ts`). Le room brut est **toujours vide** → `length === 0` toujours vrai → le garde
« hors ligne » est mort, les utilisateurs EN LIGNE reçoivent l'e-mail (mentions, appels manqués, alertes
sécurité). C'était le **seul** des ~18 `io.in(...).fetchSockets()` du gateway à omettre `ROOMS.user(...)`.

**Leçons :**
1. **Un room Socket.IO nommé par id brut est un faux-ami silencieux : il « existe » (aucune erreur) mais
   est toujours vide.** Un garde `sockets.length === 0` construit dessus ne throw jamais et ne loggue rien —
   il se contente d'inverser la logique métier. Toute présence via `io.in(x)` doit passer par le SSOT de
   nommage (`ROOMS.user`), jamais une string ad hoc.
2. **Grep TOUS les call sites d'un pattern avant de conclure (récidive des leçons 2026-07-31 #2 / 2026-08-03 #4).**
   Ici l'audit a comparé les ~18 sites `io.in(...).fetchSockets()` : 17 corrects, 1 divergent. La divergence
   d'un seul site face à N siblings identiques est le signal le plus fiable d'un bug — le chercher activement.
3. **Un mock qui ignore son argument masque exactement ce type de bug.** Le test existant stubbait
   `in: jest.fn(() => ({ fetchSockets: () => [] }))` — insensible au nom du room, donc incapable de distinguer
   `io.in("u1")` de `io.in("user:u1")`, et ne simulant que le cas hors ligne. Un mock de présence DOIT clé sur
   l'argument room (`room === ROOMS.user(id) ? [socket] : []`) pour couvrir en ligne ET hors ligne.
