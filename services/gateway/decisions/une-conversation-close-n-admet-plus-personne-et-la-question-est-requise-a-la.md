## Une conversation close n'admet plus PERSONNE, et la question est REQUISE à la porte (2026-08-18, cycle 70)

**Contexte** : le schéma documente `Conversation.closedAt` par « closed for all —
**no one can write**, messages stay readable ». Le cycle 31 a fait respecter la
moitié « écrire » (`conversationWriteAdmission`). La question voisine — *peut-on
encore y ENTRER ?* — n'était posée par aucune des quatre portes, et sa réponse par
défaut était **oui**, indéfiniment.

Deux propriétés du schéma faisaient tenir le défaut :

1. **Une clôture n'éteint aucun lien de partage.** Les quatre écrivains de clôture
   n'écrivent que sur `Conversation` ; `ConversationShareLink.isActive` leur
   survit. Un lien qui circule reste joignable après la mort du fil, et la porte
   anonyme vérifie NEUF propriétés du LIEN et zéro de la conversation.
2. **Fermer n'écrit sur AUCUNE ligne `Participant`.** Les deux portes d'ajout
   autorisent sur le RANG de l'appelant — donc sur `Participant` — et le rang
   survit intact. Aucune relecture de leur logique d'autorisation ne pouvait le
   montrer : cette logique est correcte, elle regarde un autre modèle.

Ce qu'obtenait l'arrivant : un 200, une ligne active dans un fil mort, une
conversation absente de `GET /conversations` et purgée des caches clients sur
`conversation:closed`, un premier message refusé sans explication, et un
`conversation:participant-joined` diffusé à un fil terminé. Pour un anonyme c'est
terminal — ce participant EST son identité.

**Décision** : `resolveConversationEntry` gagne le dénouement `closed`, évalué
AVANT toute lecture de `Participant`, sur `isConversationClosed` — prédicat qui
existait déjà, exporté, lisant les deux colonnes, et dont l'en-tête désignait
nommément les routes de lien de partage. Il n'était appelé que sur le chemin
d'ÉCRITURE.

Le paramètre `conversation` est **REQUIS**, jamais optionnel :
- **passé** plutôt que lu, parce que deux portes sur trois tiennent déjà la ligne
  (`shareLink.conversation`, le `findUnique` de l'invitation) ; seule la porte
  d'ajout paie une lecture, et elle n'en avait aucune ;
- **requis**, parce qu'optionnel il aurait laissé la question sans réponse à la
  porte qui l'oublie, en silence. Requis, il fait échouer la COMPILATION de toute
  porte future qui n'y répond pas (`TS2345`, vérifié). `null` reste recevable :
  c'est la réponse d'un appelant qui n'a pas trouvé la conversation, et qui a
  déjà son propre 404 à rendre.

La porte anonyme n'appelle pas l'unité — elle est keyée sur `(conversationId,
userId)` et un anonyme n'a pas de `User.id`. Elle appelle `isConversationClosed`
directement, sur la ligne qu'elle charge déjà. Seul site que le typage ne
contraint pas ; il a ses propres témoins.

**Alternatives rejetées** :
- **Éteindre les liens de partage à la clôture.** Ne couvre ni l'ajout par un
  admin ni l'invitation, ne dit rien des conversations DÉJÀ closes, et fait
  dépendre la fermeture de la porte de la discipline de quatre écrivains — celle
  qui a divergé trente-sept cycles. `conversationWriteAdmission` énonce
  l'argument : lire l'état réel de la base plutôt que la discipline de ses
  écrivains est ce qui rend une garde indépendante de leurs oublis.
- **Lire la conversation DANS l'unité.** Ferait payer une lecture aux deux portes
  qui tiennent déjà la ligne, pour reposer une question dont elles ont la réponse.
- **Un paramètre optionnel.** Rend le correctif dépendant de la vigilance du
  prochain auteur de porte, c'est-à-dire de la même chose qui a produit le défaut.
- **Ne lire que `closedAt`.** Les lignes fermées par l'ancien `leave.ts` (avant
  cycle 67) existent en base sans `closedAt`, et rien ne les rétro-remplit.
- **Marquer les participants inactifs à la clôture.** Ferait mentir `leftAt` et
  effacerait la distinction entre partir et voir son fil fermé. Le sujet « un
  membre actif d'une conversation close » reste ouvert, à instruire lecteur par
  lecteur.

**Tests** : 20 neufs sur quatre fichiers. Les gardes qui comptent nomment la
CONSÉQUENCE — `participant.create`/`update` NON appelés — et non le dénouement,
qu'un refactor peut satisfaire en perdant la propriété. ROUGE prouvé en deux
temps : stash des quatre fichiers de production → 9 rouges de route ; puis, le
stash ne produisant sur l'unité qu'un rouge de COMPILATION (le type partant avec
le comportement), mutation au scalpel de la seule ligne de court-circuit → 5
rouges de comportement. Les deux contre-épreuves restent vertes des deux côtés.
Deux doubles de test gagnent une méthode absente et réellement manquante
(`participant.update` côté sharing, `conversation.findUnique` côté participants).
Gate : `tsc --noEmit` 0 erreur, 208/208 sur les quatre suites touchées.
