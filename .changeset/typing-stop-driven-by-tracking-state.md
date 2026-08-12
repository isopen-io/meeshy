---
"@meeshy/gateway": patch
---

Un `typing:stop` retracte ce que ce socket a réellement diffusé — et ne coûte plus rien quand il n'a rien à retracter

`handleTypingStop` reconstruisait depuis zéro tout ce que `handleTypingStart` avait déjà établi :
`resolveParticipant` (participation), `shouldShowTypingIndicator` (préférence), puis
`_resolveTypingIdentity` (identité), avant de consulter enfin l'état de suivi `activeTypers`. Or
`activeTypers` EST l'enregistrement exact de ce qui a été diffusé — `_trackTyping` ne s'exécute que
sur un start ayant franchi ces mêmes portes. Le commentaire du fichier énonçait déjà la règle (« A
stop must retract exactly what a prior start broadcast, so the handler proceeds on tracking state —
NOT the live preference ») ; il ne l'appliquait qu'à moitié. L'entrée de suivi est désormais à la
fois l'autorisation, l'audience et la charge utile de la retraction, et rien ne la surcharge.

Trois conséquences, chacune verrouillée par un test.

**Amplification.** `typing:start` est limité en débit (`SOCKET_RATE_LIMITS.TYPING_INDICATOR`),
`typing:stop` ne l'est pas. Un stop sans start correspondant dépensait pourtant `resolveParticipant`
+ la lecture de préférence + la requête des viewers bloqués (`participant.findMany` puis la requête
de blocage), puis diffusait une retraction fantôme à **tous** les sockets de la conversation : un
paquet client non throttlé achetait trois allers-retours base + un fan-out N-way. Le socket qui n'a
rien diffusé n'a rien à reprendre : on sort avant toute I/O. La borne de débit manquante devient
sans objet plutôt que d'être ajoutée — un limiteur sur `typing:stop` aurait jeté de vraies
retractions, ce qui est précisément le défaut qu'on ne veut pas.

**Indicateur fantôme.** Re-vérifier la participation sur le chemin du stop ne pouvait que REFUSER de
reprendre ce que les pairs voyaient déjà. Un participant désactivé en cours de frappe (retrait par
un admin) voyait donc son stop rejeté, son entrée `activeTypers` fuir, et ses pairs garder « X est
en train d'écrire… » jusqu'à la déconnexion du socket. Même classe de défaut que celui déjà corrigé
pour la préférence qui bascule en cours de rafale — la même cause, l'autre porte.

**Identité de la retraction.** Le stop ré-interrogeait l'identité au lieu de reprendre celle sous
laquelle le start était parti. Le cache masquait le coût jusqu'à son invalidation (une édition de
profil) : après renommage en cours de rafale, le start partait sous « Alice S » et le stop sous
« Alice Renamed » — une retraction désignant quelqu'un que les pairs n'ont jamais vu. L'entrée de
suivi porte déjà `username`/`displayName` ; elle les rend, sans lookup.

Les tests qui appelaient `handleTypingStop` sans start préalable ont été corrigés plutôt que
contournés : un stop sans start n'est pas une scène de fond, c'est un cas distinct — désormais
couvert explicitement, dans les deux fichiers de suite.
