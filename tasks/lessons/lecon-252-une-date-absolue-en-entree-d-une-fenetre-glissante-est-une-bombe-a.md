## Leçon 252 — une date ABSOLUE en entrée d'une fenêtre glissante est une bombe à retardement

Cycle 108. `main` était ROUGE, sur deux témoins qui passaient la veille et que
personne n'avait touchés depuis le cycle 101.

`MessageHandlerEditDelete.test.ts` fabriquait son message avec
`createdAt: new Date('2026-08-22T10:00:00Z')`. `admitMessageEdit` refuse toute
édition d'auteur au-delà de `MESSAGE_EDIT_WINDOW_MS` (24 h) comptées depuis
`Date.now()`. La CI du 2026-08-23 a tourné à 10:15Z — **24 h 15 min** après le
littéral. La porte a refusé l'édition, plus rien n'a été diffusé, et les deux
`expect` sont tombés.

> **Un littéral de date comparé à `Date.now()` n'est pas une donnée de test :
> c'est un compte à rebours.** Il passe le jour où on l'écrit, et il tombe une
> fenêtre plus tard — sans commit, sans revue, sans coupable. Une entrée destinée
> à une règle temporelle s'écrit TOUJOURS relativement à l'horloge :
> `new Date(Date.now() - 10 * 60 * 1000)`.

Le fichier connaissait déjà l'idiome : cinq témoins de fenêtre y utilisent
`twentyFiveHoursAgo` / `tenMinutesAgo`. Les deux fautifs étaient les seuls à
écrire une date absolue — et ce n'était pas un oubli, c'était une CONSÉQUENCE.

### Le vrai défaut était dans la fabrique, pas dans le littéral

`makeMessageRecord` ne portait NI `createdAt` NI `messageType`. Or la règle est
écrite pour ne bloquer personne sur une date illisible : `NaN > w` est faux, donc
un `createdAt` absent **ADMET**. Presque tous les témoins du fichier franchissaient
donc la fenêtre par ABSENCE de date — la porte était traversée sans être exercée.
Le seul témoin qui vérifie les sept champs requis par `SocketIOMessage` avait
besoin d'un vrai `createdAt` : n'en trouvant pas au socle, il s'en est écrit un,
en absolu. La bombe a été armée par le TROU de la fabrique.

> **Quand un seul témoin doit se fabriquer une donnée que la fabrique aurait dû
> fournir, ce n'est pas ce témoin qui est bizarre : c'est la fabrique qui est
> incomplète.** Corriger le littéral (le repousser d'un jour) aurait réarmé la
> bombe pour le lendemain. Compléter le socle la désarme structurellement.

### Un refus muet ressemble à une régression de contrat

Le témoin tombé est le GARDIEN du défaut du cycle 101 (`message:edited` servi
sans `senderId`/`messageType`/`createdAt`, décodage iOS du message entier rejeté).
Sa chute affichait `Received array: []` : aucune émission. Le message d'échec
accuse donc la DIFFUSION, alors que la panne est dans l'ADMISSION, deux étages
plus haut. Vérifié par mutation dans les deux sens avant de conclure — et la
charge utile, elle, était intacte (`buildMessageEditedCore` replie
`message.createdAt || new Date()`).

> **Un témoin qui tombe pour un motif étranger à ce qu'il garde est pire qu'un
> témoin absent** : il fait croire que la propriété gardée a régressé, et il
> pousse au correctif qui la rendrait vraiment fausse.
