## 2026-08-21 — Le NOM du canal est la seule chose qu'un test d'événement entrant ne peut pas prouver

Cycle 76-bis, le lendemain du cycle 75 et sa symétrie exacte.

| cycle | ce qui manquait | comment ça se taisait |
|---|---|---|
| 75 | un ÉMETTEUR pour un contrat écrit et un récepteur iOS complet | le récepteur n'est jamais appelé |
| 76-bis | un NOM juste pour deux récepteurs Android complets | le récepteur n'est jamais appelé |

Les deux produisent le même silence, par les deux bouts du fil. **Un abonnement
Socket.IO à un nom que personne ne prononce ne lève pas, ne journalise pas, ne
se plaint pas : il se tait pour toujours.**

Android s'abonnait à `message:updated` (la passerelle émet `message:edited`) et
à `transcription:ready` (elle émet `audio:transcription-ready`). Aucun des deux
noms n'existait ailleurs dans le dépôt. En aval, TOUT était juste — le flow, le
collecteur du ViewModel, le merge du dépôt, le type de charge utile. Seule la
chaîne de caractères était fausse. Une édition de message et une transcription
de note vocale ne sont jamais arrivées en direct sur Android.

### La leçon principale

Le seul test du gestionnaire injecte son événement ainsi :

```kotlin
handlers.getValue("notification:new").invoke(...)
```

Il cherche le gestionnaire **sous le nom que le gestionnaire a lui-même
enregistré**. Il est donc vert QUEL QUE SOIT ce nom. Il prouve le décodage ; il
ne peut structurellement rien prouver du nom. C'est le même angle mort qui
rendait verts les quatre tests iOS de `call:force-leave` au cycle 75.

> **Tout test qui injecte lui-même l'événement qu'il vérifie ne teste pas le
> canal, seulement la charge utile.** Le nom se prouve ailleurs : contre le
> contrat, par une garde qui LIT le code d'abonnement au lieu de l'exécuter.

### Le corollaire du symbole menteur

Le flow s'appelait `messageUpdated`. Tant que le symbole reprenait le nom
fantôme, rien dans le code ne contredisait la chaîne fautive — le mensonge était
cohérent avec lui-même de bout en bout. **Renommer le symbole d'après
l'événement RÉEL fait partie du correctif, pas de la cosmétique.**

### Et le défaut déjà corrigé sur la classe voisine

`TranscriptionReadyEvent` était plat là où le fil imbrique. Son jumeau
`AudioTranslationEvent`, dans le MÊME fichier, une classe plus haut, avait déjà
été corrigé pour exactement cette raison — son test s'ouvre sur « a flat model
silently drops every frame at decode time ». **Quand on corrige une forme de
charge utile, relire les classes voisines du même pipeline dans la foulée : la
trame qui les alimente vient du même émetteur et porte la même forme.**

### La garde déposée

`packages/shared/__tests__/ci/socket-event-name-gate.test.ts` — tout nom épelé
en clair par iOS ou Android doit être une valeur déclarée du contrat. Deux
détails qui font la différence entre une garde et un décor :

1. **Importer les objets du contrat, jamais les relire au motif d'expression
   régulière.** Une lecture textuelle ferait passer pour « déclaré » un nom
   présent seulement en PROSE — la garde bénirait le défaut qu'elle interdit.
2. **Poser le seuil de couverture PAR PLATEFORME.** iOS pèse ~110 littéraux,
   Android ~47 : un seuil global laisse un scan Android muet passer inaperçu
   derrière iOS. Une garde dont le scan peut devenir vide sans rougir rejoue
   dans son propre garde-fou l'échec silencieux qu'elle traque.
