## Leçon 63 — « aucun appelant » ne se conclut jamais d'une recherche sur un seul client (2026-08-09, routine messaging, cycle 36)

Le cycle 35 a laissé au cycle suivant une consigne explicite : retirer `PATCH /messages/:messageId`,
« qui n'a aucun appelant de production ». Il avait vérifié — mais uniquement côté **web**
(`grep` sur `.ts`/`.tsx`), où le client était effectivement mort. Côté **Android**,
`OutboxFlushWorker.kt:161` appelle `messageApi.edit(...)` → `@PATCH("messages/{id}")` : c'est le
chemin par lequel Android **rejoue les éditions faites hors ligne**. Exécuter la consigne aurait
transformé chaque flush d'édition offline en 404, silencieusement — un rejeu de file n'a pas d'écran
pour se plaindre.

**Leçons :**

1. **Ce dépôt a quatre clients — web (`.ts`/`.tsx`), iOS (`.swift`), Android (`.kt`), SDK Swift —
   et un `grep` par défaut n'en voit qu'un.** Avant d'écrire « aucun appelant » sur une route HTTP,
   la recherche doit couvrir les quatre langages ET les deux formes d'appel : l'URL littérale
   (`/messages/${id}`, `"/messages/\(id)"`) et la **déclaration déclarative** (`@PATCH("messages/{id}")`
   de Retrofit), qui ne contient ni slash initial ni interpolation et échappe donc à la plupart des
   motifs qu'on écrit spontanément. Chercher le **chemin sans slash initial** (`messages/{`,
   `messages/`) autant que le chemin complet.

2. **Une consigne héritée d'un cycle précédent se re-vérifie avant de s'exécuter, pas après.**
   Le coût de la vérification était de deux `grep` ; le coût de la confiance aurait été une
   régression silencieuse sur un chemin offline. Une routine qui se reprend elle-même de cycle en
   cycle accumule ses propres erreurs à la vitesse où elle accumule ses réussites : **le reste
   ouvert d'un cycle est une hypothèse, pas un ordre de travail.**

3. **Corollaire de portée : une consigne fausse à moitié se coupe en deux, elle ne se jette pas.**
   Le client web de cette route était bien mort — il a été retiré. La route, elle, reste. Rejeter la
   consigne en bloc aurait perdu la moitié qui était juste.

4. **Symptôme à reconnaître : un transport « sans appelant » qui porte quand même des correctifs de
   parité.** Le cycle 35 a payé la parité de cette route sur trois lots tout en la déclarant morte.
   Quand on soigne quelque chose qu'on croit mort, c'est en général qu'on se trompe sur l'un des
   deux.
