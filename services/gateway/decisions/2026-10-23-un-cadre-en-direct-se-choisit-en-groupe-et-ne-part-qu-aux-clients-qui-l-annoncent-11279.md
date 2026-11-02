## Un cadre en direct se choisit dans un appel de groupe (3 à 6), et il ne part qu'aux sockets qui annoncent savoir le tenir (2026-10-23, #11279)

### Contexte

`call:frame-select` (#9214, #9287) refusait tout appel de plus de deux participants (`PERMISSION_DENIED`) : à trois, le cadre en direct n'existait pas. Le lot ouvre le groupe côté serveur, contrat et relais.

**Ce que fait un ancien iOS en groupe**, lu dans le code (`CallLiveFrameSession.receive`, `CallView+LiveFrame.swift`). Recevoir `call:frame-selected` ne le fait pas planter, car le décodage est tolérant. Mais il pose une PROPOSITION, et la carte du haut d'écran (`liveFrameStatus`) l'affiche sans regarder `isGroupStage`. L'utilisateur pourrait donc l'accepter, alors que `liveFrameDisplay` rend `.none` en groupe : le cadre ne s'afficherait jamais. Le nom partagé (`remoteSharedName`) écraserait en outre celui de toutes les autres personnes. Émettre à toute la room de l'appel aurait donc dégradé les anciens clients.

### Décision

1. **Le relais accepte de 2 à `CALL_MAX_PARTICIPANTS` (6).** Au-delà, il rend toujours `PERMISSION_DENIED`, par défense, car un appel ne peut pas dépasser 6.
2. **À deux, rien ne change** : `socket.to(ROOMS.call(callId))`, comme depuis #9214. Un ancien client à deux reçoit exactement ce qu'il recevait.
3. **En groupe, l'événement ne part qu'aux sockets qui annoncent la capacité `call-live-frame-group`.**
   - L'annonce se fait dans `handshake.auth.capabilities`, une liste de noms. Le contrat unique est `packages/shared/utils/client-capabilities.ts` (`readClientCapabilities`) : un nom inconnu est ignoré, une forme inattendue ne vaut rien, la liste est lue jusqu'à 32 noms.
   - Les destinataires se lisent par `io.in(ROOMS.call(callId)).fetchSockets()`, sur tous les nœuds de l'adaptateur. L'émetteur en est exclu.
   - Le choix, sa réponse (`reply`) et son retrait (`frameId: null`) voyagent à tout le groupe capable.
4. **Une capacité plutôt qu'une version d'application** : elle dit ce que le client sait faire, ne dépend d'aucune numérotation par plateforme, et un client qui n'annonce rien garde le comportement d'avant (#9223).

### Ce qui reste aux clients

Aucun client n'annonce encore `call-live-frame-group` : tant qu'iOS, le web et Android ne l'annoncent pas, un cadre choisi en groupe ne part à personne. Le serveur n'impose rien. Chaque client l'annonce le jour où il sait afficher un cadre de groupe (iOS : `CallLiveFrameRule.people` passe d'un duo à 2…6).
