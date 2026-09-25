## Leçon 179 — Un événement dont le CONTRAT décrit une portée est une assertion sur l'écriture, pas une étiquette (2026-08-15, routine temps réel, cycle 30)

`DELETE /conversations/:id/delete-for-me` émettait `conversation:deleted`, dont
le contrat écrit dans `socketio-events.ts` dit : « the conversation **stays
active for every other participant** ». Deux de ses branches faisaient
exactement le contraire — `Conversation.isActive = false`, la clôture GLOBALE,
celle que `conversation:closed` existe pour annoncer. La route disait « pour
moi » en faisant « pour tout le monde ».

**La règle.** Quand deux événements voisins se distinguent par leur PORTÉE
(`:deleted` personnel vs `:closed` global, `hidden-for-me` vs `deleted`,
`leave` vs `ban`), leur documentation n'est pas descriptive : c'est une
**assertion vérifiable sur l'écriture qui les précède**. Avant d'émettre l'un
des deux, relire la phrase qu'il promet et la confronter au `data:` du `update`
qu'on vient de faire. Ici la confrontation tient en une ligne — « stays active
for every other participant » contre `{ isActive: false }` — et elle échoue à
la lecture, sans instrumentation, sans reproduction.

**Le corollaire de branchement, qui est le vrai piège.** La route ÉTAIT correcte
sur son chemin nominal : un membre ordinaire, ou un créateur qui transfère,
supprime bien pour lui seul. Le mauvais événement n'apparaît que sur deux
branches minoritaires du même handler, qui changent la portée de l'opération
**sans changer l'annonce**. Un handler qui se ramifie vers des portées
différentes doit ramifier son vocabulaire d'événements avec elles ; sinon la
branche rare hérite du mot de la branche fréquente. Le prédicat d'audit :
**« ce handler a-t-il un chemin où il écrit plus large que ce qu'il annonce ? »**

**Corollaire de durabilité — un champ peut être le CANAL, pas une décoration.**
La clôture n'écrivait que `isActive: false`, jamais `closedAt`. Or
`loadConversationTombstones` reconstitue les disparitions par `closedAt > since`
— une clôture sans horodatage n'est portée par AUCUN delta, à aucune date. Le
membre restant ne l'apprenait donc ni en direct (aucune émission ne le visait),
ni plus tard (aucun tombstone) : les deux canaux muets pour la même omission.
**Avant de conclure « le client rattrapera à la prochaine synchro », ouvrir la
requête de rattrapage et vérifier sur quel CHAMP elle porte.** Un champ nullable
qu'on n'écrit pas ne dégrade pas la précision d'un stream : il l'éteint. Ici le
schéma le disait déjà — le commentaire de `@@index([closedAt])` nomme ce stream
et son unicité — et personne ne l'avait relié au site d'écriture.

**Corollaire d'audience — la ramener PAR l'écriture, pas par une requête de
plus.** `core.ts` le justifiait déjà par la fraîcheur (« une seconde requête …
pourrait tomber sur un état déjà modifié ») ; ce cycle en ajoute une seconde
raison, découverte par un test rouge. La première version du correctif lisait
l'audience via un `findMany` APRÈS les écritures : un double de test sans ce
mock a rendu `500` sur une opération dont TOUTES les écritures avaient été
committées. Une requête ajoutée après le point de non-retour n'est pas neutre —
elle transforme un succès durable en erreur rendue à l'appelant. Le `include`
sur l'`update` supprime la requête ET le mode d'échec.

**Corollaire de test (suite des leçons 175/177).** Le scénario « DM vide » de la
suite n'instanciait AUCUN autre participant. Aucune assertion ne pouvait donc
distinguer « annonce correcte » de « aucune annonce » : la suite était verte
parce qu'elle ne construisait pas le monde où la propriété existe. Un témoin
d'audience exige qu'il Y AIT quelqu'un d'autre — sinon on teste le silence dans
une pièce vide. Et deux assertions préexistantes épinglaient `data: { isActive:
false }` à l'exact, figeant la forme INCOMPLÈTE de l'écriture : une assertion
exacte sur un payload transforme toute omission en spécification.

---
