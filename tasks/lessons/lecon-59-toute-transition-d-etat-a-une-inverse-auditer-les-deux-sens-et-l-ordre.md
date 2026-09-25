## Leçon 59 — toute transition d'état a une inverse : auditer les DEUX sens, et l'ORDRE de chacun (2026-08-07, routine messaging)

Audit ciblé des 4 transitions d'appartenance à une conversation (env Linux, pas de Xcode).
`leave`, `kick` et `ban` évincent tous explicitement les sockets de la cible de
`ROOMS.conversation(id)` ; les 8 sites d'octroi d'appartenance appellent tous
`joinUserToConversationRoom`. L'`unban` — inverse exacte du `ban` — n'appelait NI l'un NI
l'autre : la ligne `Participant` repassait `isActive: true`, mais les sockets restaient hors
de la room. Or `connectedUsers` rapporte alors l'utilisateur EN LIGNE, donc les deux chemins
d'envoi le **sautent à l'enqueue de la file de livraison hors ligne** : ni émission live, ni
replay au reconnect. Les messages n'étaient pas différés, ils étaient **perdus**. Second
défaut de même racine : `conversation:participant-unbanned` n'étant diffusé qu'à la room dont
le ban l'avait évincé, le débanni était le seul participant à ne pas l'apprendre.

**Leçons :**
1. **Un site qui applique une transition doit être lu en paire avec son inverse, pas seul.**
   Le `ban` était irréprochable ; c'est précisément sa qualité qui rendait l'`unban` fautif
   (il défait un effet que rien ne recompose). Chercher les paires — ban/unban, join/leave,
   add/remove, subscribe/unsubscribe — et vérifier que la seconde annule TOUT ce que fait la
   première, effets mémoire (rooms, caches) compris, pas seulement l'écriture DB.
2. **« En ligne » n'est pas « joignable » : une garde d'enqueue basée sur la présence est un
   amplificateur de perte.** Dès qu'un utilisateur est présent SANS être dans la room, la file
   de livraison hors ligne le saute — la panne passe d'un retard d'affichage à une perte
   définitive. Tout code qui retire une socket d'une room doit être audité contre
   `connectedUsers.has(...)` côté envoi.
3. **L'ORDRE entre « muter l'appartenance » et « diffuser » porte le contrat.** Le `ban` émet
   AVANT d'évincer (sinon le banni n'apprend jamais son ban) ; l'`unban` doit donc joindre
   AVANT d'émettre (sinon le débanni n'apprend jamais le sien). Un mock socket qui ne
   consigne pas la SÉQUENCE (`mockReturnThis()`, assertions de comptage) ne peut exprimer
   aucun de ces deux contrats — et c'est très exactement ce qui a laissé le défaut vivre.
