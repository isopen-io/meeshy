## Leçon 207 — un fanout groupé PAR VARIANTE qui cible la room entière fuite une variante par destinataire (2026-08-16, routine calling, cycle 135)

**Le constat.** `translateAndEmitSegment` calculait `targetLanguages` comme un `Set` PLAT — l'union
des langues demandées par tous les auditeurs d'un appel de groupe — puis diffusait CHAQUE langue à
`socket.to(ROOMS.call(callId))`, la room entière. Avec 2 langues distinctes en vol, chaque auditeur
recevait les DEUX traductions, pas seulement la sienne. *Aplatir un ensemble de variantes avant de
les émettre efface l'information qui aurait permis de les adresser correctement : le `Set` savait
qu'il fallait traduire en anglais ET en espagnol, mais plus lequel des deux auditeurs voulait
lequel.* La correction n'est pas d'ajouter un filtre en aval — c'est de ne jamais perdre
l'association pendant la collecte : `Map<variante, destinataires[]>` au lieu de `Set<variante>`.

**Le silence contient une seconde bogue amplifiée par la première.** Les hooks web consommateurs
(`use-call-captions`, `use-call-transcript-journal`) ne filtraient PAS non plus par
`targetLanguage` — une omission qui ne fait aucun dégât tant que le serveur route déjà juste, et
qui se révèle nuisible seulement une fois combinée au bug de fanout. *Deux défauts qui s'annulent
en apparence (le serveur sur-diffuse, le client ne filtre pas, donc "ça marche" en apparence pour
un appel à 2 langues où il n'y a qu'un seul auditeur) ne sont pas un système sûr — ils sont deux
absences de garde qui attendent un troisième participant pour se révéler.* Le fix root-cause côté
serveur suffit ici parce qu'il restaure l'invariant que les deux clients supposaient déjà vrai
(« je ne reçois que ma langue ») — mais l'absence de filtre défensif côté client reste une dette,
pas une preuve d'absence de risque.

**Le double qui rend le bug invisible en test.** Toutes les suites existantes (`makeSocket()`
standard) ne modélisaient qu'UN SEUL auditeur — `socket.to()` mocké pour retourner le même
`{emit: roomEmit}` quel que soit l'argument, donc rien ne distingue `ROOMS.call(id)` de
`ROOMS.user(id)` dans les assertions. *Un double qui ignore l'argument d'une méthode de ciblage ne
peut jamais révéler un bug DANS le ciblage — il faut un scénario à 2+ destinataires distincts avec
un double qui ENREGISTRE l'argument (`makeRoomAwareSocket` : accumule les rooms adressées, une
émission par appel chaîné `.to().to()...emit()`) pour que l'assertion ait quelque chose à
distinguer.* Le premier réflexe (« les tests existants passent, donc le fanout est sûrement bon »)
aurait laissé le bug entier derrière une suite verte.
