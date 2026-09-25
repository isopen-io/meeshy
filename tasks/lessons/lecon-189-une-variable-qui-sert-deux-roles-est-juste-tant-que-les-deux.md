## Leçon 189 — une variable qui sert deux rôles est juste tant que les deux coïncident, et fausse exactement là où ils divergent (2026-08-15, routine temps réel, cycle 38)

**Le fait.** `broadcastReadStatusUpdate` recevait un `userId: string` et le
servait à deux endroits : `payload.userId` (le champ du contrat, « `User.id` de
l'acteur, `null` s'il est anonyme ») et `ROOMS.user(userId)` (la clé de la room
personnelle, qui vaut `userId ?? Participant.id`). Pour un acteur AVEC compte,
les deux rôles veulent la MÊME valeur. Pour un invité de lien, ils en veulent
deux différentes — `null` d'un côté, `Participant.id` de l'autre. Une seule
variable ne pouvait pas satisfaire les deux, et c'est la forme ROOM qui gagnait :
le champ du contrat partait en portant un `Participant.id`.

**Pourquoi c'est invisible.** La coïncidence couvre la population majoritaire.
Tout test écrit avec un acteur enregistré passe, quelle que soit la variable
choisie — les deux rôles rendent le même littéral. Le défaut n'a de témoin que
dans la population où les rôles divergent, et c'est précisément la population
qu'on pense à tester en dernier. *Une conflation ne se voit pas dans le cas
général : elle se voit dans le cas où les deux sens du mot cessent de désigner
la même chose.*

**Le signal à chercher.** Pas « ce champ a-t-il la bonne valeur ? » mais
**« combien de questions différentes cette variable répond-elle ? »**. Ici :
« qui est l'acteur ? » et « à quelle room dois-je écrire ? ». Deux questions,
un identifiant — et le nom `userId` ne trahissait rien parce qu'il est juste
pour l'une des deux. Le test de relecture : énumérer les usages d'un paramètre
et demander, pour chacun, quelle valeur il voudrait sur la population marginale.
Deux réponses différentes = deux paramètres.

**Le correctif structurel, pas cosmétique.** Renommer `userId` en
`actorUserId: string | null` n'est pas de l'habillage : le type interdit
désormais de fournir `authContext.userId` par recopie, et le nom dit lequel des
deux rôles il sert. La clé de room se dérive à l'INTÉRIEUR de l'unité
(`actorUserId ?? participantId`), là où la règle vit déjà pour tout le monde
(`participantUserRoomTargets`). Un correctif qui se serait contenté de nuller le
champ au site d'appel aurait laissé la signature capable de reproduire la faute.

**La garde qui doit s'écrire en même temps.** « Ce champ doit être nullable »
mène naturellement à nuller la variable — donc aussi la clé de room, donc à
émettre vers `user:null`, donc à coller le badge de tous les invités pour
toujours. *Quand un correctif consiste à nuller une valeur partagée, le témoin
qui interdit au `null` de se propager au SECOND rôle vaut autant que celui qui
l'exige sur le premier.* Il ne se déduit d'aucun autre, et il est vert avant
comme après — ce qui le rend facile à ne pas écrire.

**Le corollaire documentaire.** La ligne de `services/gateway/CLAUDE.md` qui
décrivait ce champ (« `user.id or sessionToken` ») était fausse sur les deux
moitiés, et c'est elle qu'aurait lue quiconque cherchait à savoir ce que
`authContext.userId` porte. *Une conflation d'identités survit dans le code
aussi longtemps que la doc qui la décrit reste approximative* — corriger l'une
sans l'autre garantit le retour de la faute au prochain appelant.

---
