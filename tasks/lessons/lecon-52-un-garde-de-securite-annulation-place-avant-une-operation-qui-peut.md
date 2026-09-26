## Leçon 52 — un garde de sécurité/annulation placé AVANT une opération qui peut encore throw protège moins que prévu ; le placer une fois le succès confirmé (routine calling-feature, Vague 33, 2026-07-09)

`CallEventsHandler.ts`'s `call:join` handler appelait `cancelDisconnectGrace(callId, userId)` juste après
la validation Zod du payload, mais AVANT `resolveParticipantIdFromCall` et `callService.joinCall(...)` —
deux opérations qui peuvent encore throw (DB transitoire, race). Le commentaire au-dessus de l'appel
("a (re)join cancels any pending disconnect grace timer... the participant's signaling socket is back")
décrivait l'intention correcte, mais le PLACEMENT trahissait cette intention : le code annulait la grâce
sur la base de "une tentative de join a été REÇUE", pas "le join a RÉUSSI". Si le join échouait ensuite
pour une raison sans rapport avec l'état réel de l'appel, le participant perdait à la fois son socket actif
(le join a échoué) ET son timer de grâce (déjà annulé) — exactement le double filet que ce mécanisme
existe pour fournir. Le `catch` du handler n'avait aucune ré-armement compensatoire.

**Règle réutilisable** : quand un commentaire dit "X annule/confirme Y parce que l'opération a réussi",
vérifier que l'annulation/confirmation est physiquement placée APRÈS le `await` qui peut encore échouer,
pas avant par convenance de lisibilité (ex. grouper toute la logique "post-validation" en haut du handler).
Un signal d'alarme : l'annulation est suivie d'AUTRES opérations asynchrones qui peuvent throw avant la
fin du handler — si l'une d'elles échoue, l'annulation a déjà eu lieu sans jamais être compensée dans le
`catch`. Le fix est presque toujours un simple déplacement de ligne (pas une réécriture), mais il faut
ensuite auditer les tests existants qui pourraient avoir été écrits pour caractériser l'ANCIEN comportement
plutôt que l'intention réelle — ici, un test nommé "re-join... cancels the pending end" mockait en réalité
un join qui échoue TOUJOURS (config par défaut du test harness), avec un commentaire inline documentant
explicitement "bails after cancel, but the cancel already ran" comme si c'était le comportement voulu. Le
titre du test décrivait l'intention (rejoin réussi → annulation) mais le corps testait l'accident (rejoin
échoué → annulation quand même) — un signe qu'un test a dérivé pour suivre l'implémentation plutôt que la
spec. Toujours relire le TITRE du test contre son CORPS quand on modifie le comportement qu'il pin.

---
