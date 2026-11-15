## Leçon 60 — un contrat à deux moitiés se vérifie sur TOUS ses écrivains, et une moitié sans l'autre est un no-op silencieux (2026-08-08, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). `UserConversationPreferences`
est une ligne **par utilisateur** : chaque écriture doit incrémenter `version` (le schema la
déclare monotone, les clients jettent `incoming.version <= local`) ET diffuser l'instantané
sur `user:<id>`. Cinq écrivains existent ; les trois de `routes/user-deletions.ts`
(`delete-for-me`, `restore-for-me`, `clear-history`) n'honoraient **aucune** des deux moitiés.
Une conversation supprimée sur l'iPhone restait dans la liste de l'iPad, un historique vidé
restait affiché ailleurs — et comme on n'épingle pas une conversation qu'on vient de
supprimer, le ricochet par une autre préférence (le payload étant un instantané complet)
n'arrivait jamais : divergence permanente, pas différée.

**Leçons :**
1. **Deux obligations qui ne valent que conjointes doivent vivre dans UNE fonction, et le
   type d'entrée doit rendre la moitié oubliable inatteignable.** Diffuser sans incrémenter
   émet un événement que tous les appareils jettent ; incrémenter sans diffuser avance un
   compteur que personne ne reçoit — deux no-op silencieux, aucun log, aucune exception.
   `writeConversationPreferences` porte les trois obligations (persister, incrémenter,
   diffuser) et **exclut `version` de son type d'écriture** : le compteur appartient au
   module, jamais à un appelant. Un helper qu'on peut appeler à moitié ne ferme pas le trou.
2. **Le champ qu'un payload partagé déclare mais qu'aucun écrivain n'émet est un chemin
   manquant, exactement comme un membre d'union sans appelant (leçon 2026-08-07 (3) #3).**
   `ConversationPreferencesPayload` déclarait `deletedForUserAt`/`clearHistoryBefore`, iOS les
   mappait déjà sur `userState` et le web écoutait l'événement : les DEUX clients étaient
   câblés, seul le serveur se taisait. Règle : partir du type d'événement partagé et remonter
   à tous ses producteurs, pas l'inverse.
3. **Un commentaire qui ÉNUMÈRE les émetteurs d'un événement est une liste à vérifier, pas
   une description.** « émis par `PUT/DELETE /user-preferences/conversations/:id` » nommait
   deux écrivains sur cinq — vrai et incomplet, même signal que « les trois transports » pour
   cinq sites REST. Une grep des écrivains du modèle Prisma (`.upsert|.update|.updateMany`)
   coûte dix secondes et tranche.
4. **Changer la méthode Prisma d'une route déplace le levier de ses mocks.** Passer
   `restore-for-me` de `update` à l'`upsert` du helper a fait virer au rouge un test existant
   dont le knob injectait l'erreur sur `update` : le test n'échouait plus parce que le chemin
   testé n'existait plus. Un knob de mock nomme une méthode, pas une intention — après tout
   changement de méthode, re-vérifier que le levier atteint encore le chemin réel (et
   supprimer le knob devenu mort).
