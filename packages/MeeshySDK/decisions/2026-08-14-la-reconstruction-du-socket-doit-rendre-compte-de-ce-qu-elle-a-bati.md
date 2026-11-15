## 2026-08-14 — La reconstruction du socket doit rendre compte de ce qu'elle a bâti

**Contexte**: `forceReconnect()` est le point de passage de toutes les reprises temps réel
(retour de réseau, reprise au premier plan, rotation de jeton). Il démolit le transport
**inconditionnellement** — et `suspendTransport()` emporte avec lui la boucle de retry interne de
Socket.IO (`reconnectAttempts(-1)`), qui était jusque-là la seule chose qui reconnectait. La
reconstruction, elle, est **conditionnelle** : `connect()` sort sans rien bâtir sur trois chemins
(jeton absent, jeton expiré, `baseURL` nul). Un `Void` ne pouvait pas dire lequel des deux mondes
on venait de laisser derrière soi.

**Decision**: `connect()` devient une façade au-dessus de `establishTransport() ->
SocketConnectOutcome`. `.armed` signifie qu'un socket existe et que la boucle interne de Socket.IO
possède la reprise ; `.notArmed` signifie qu'il n'y a **ni transport ni boucle**, et que l'appelant
doit armer l'échelle de backoff. `forceReconnect()` est le seul appelant tenu à cette obligation,
parce qu'il est le seul à démolir avant de reconstruire.

Le backoff quitte les variables d'instance pour `SocketReconnectBackoff`, type valeur pur :
`nextDelay(jitter:)` reçoit sa gigue en paramètre (déterminisme sous test — même idiome que
`handleConnectionEstablished` et `isTokenRotation`), le plafond s'applique **après** la gigue, et
`reset()` matérialise « un signal positif est arrivé ». L'échelle grimpe par **tentative
infructueuse** et se réinitialise sur connexion établie **ou** retour de réseau.

Deux gardes délimitent l'échelle. Elle ne s'arme jamais sans session (`authToken == nil` = session
invalidée par le serveur, seule une reconnexion aide — retenter ferait tourner à vide) mais s'arme
toujours sur jeton **expiré**, qui est précisément le cas post-coupure. Et la suppression pendant
un appel (`isCallActiveGuard`) n'est plus terminale : elle n'a de sens que pour préserver un socket
de signalisation **vivant** ; quand il est déjà tombé, ne rien faire abandonnait le socket dont
l'appel dépend.

**Alternatives rejetées**: laisser `connect()` armer lui-même son retry — il est aussi le chemin du
démarrage à froid, où l'absence de jeton est l'état normal d'un utilisateur déconnecté et non une
panne à retenter ; seul `forceReconnect()` sait qu'une démolition vient d'avoir lieu. Faire de la
gigue un tirage interne avec une graine injectable — plus de machinerie pour la même propriété.
Surveiller les `heartbeat:ack` manquants pour détecter un socket zombie — **vérifié inutile** :
`SocketEngine.checkPings()` (socket.io-client-swift 16.1.1) réarme un contrôle toutes les
`pingInterval + pingTimeout` (25 s + 20 s) et appelle `closeOutEngine(reason: "Ping timeout")`, donc
la bibliothèque couvre déjà le transport mort en silence ; le `heartbeat` applicatif reste ce qu'il
est, une balise de mesure de RTT, et n'a pas à devenir un chien de garde redondant.

**Cons**: `hasPendingReconnect` est un point d'observation ouvert pour les tests — la reprise due
après une reconstruction stérile est invisible de l'extérieur autrement (pas de socket, aucun état
publié qui change). Et les deux gestionnaires portent maintenant deux copies de
`scheduleReconnectWithBackoff` : la politique est partagée par `SocketReconnectBackoff`, le câblage
ne l'est pas, comme pour `suspendTransport` et `handleConnectionEstablished` avant eux.
