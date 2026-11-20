## 2026-11-20 : Le cliquet d'audience balaie `src/` entier, et publie ce qu'il ne sait pas juger (#20091, à la suite de #16690)

### Contexte

#16690 a posé la loi « une audience de DIFFUSION lit la participation VIVANTE
(`PARTICIPATION_VIVANTE`), jamais `isActive` NU », et son cliquet
`socketio/__tests__/conversation-audience-living-participation.ts`. Le cliquet
balayait `src/socketio/` et était vert.

Mesuré avec son propre classifieur sur `src/` : 15 audiences dans `socketio/`
(13 conformes, 2 déclarées larges) et **51 au dehors, dont 50 nues**. Parmi
elles, l'annuaire des appareils qui reçoivent les enveloppes chiffrées.

### Décision

1. **La portée du balayage est `src/` entier.** Une audience de diffusion ne
   vit pas dans un répertoire ; une portée qui en nomme un mesure une propriété
   de ce répertoire et l'affirme du dépôt.
2. **Le discriminant lit `findMany`, `count`, `groupBy` et `aggregate`, et le
   `where` n'a plus à être la première clé.** 28 des 215 lectures de
   `Participant` lui échappaient par la seule forme de leur appel, dont deux
   dans son propre répertoire.
3. **La loi comptée comme ÉPELÉE inclut sa forme manuscrite** — `isActive: true`
   plus une garde de bannissement — et pas seulement ses deux constantes.
   Compter un site conforme parmi les nus envoie réparer ce qui est juste, et
   coûte la crédibilité des constats voisins.
4. **Ce que le balayage ne sait pas JUGER, il le PUBLIE**
   (`sweepUnjudgeableParticipantReads` : `variable`, `appel`, `ternaire`,
   `absent`), et un témoin exige que cette liste soit non vide et bornée. Un
   `where` qui est une VARIABLE déclarée par un `const` du même fichier est
   RÉSOLU ; un import, un paramètre ou un appel, non — l'étroitesse garde à
   l'instrument la capacité de dire « je n'ai pas conclu ».
5. **DEUX inventaires, disjoints.** `DELIBERATELY_WIDE` dit « ce site DOIT être
   large » et exige une raison instruite ; `MEASURED_NOT_INSTRUCTED` dit « on ne
   sait pas encore ce que ce site décide » et exige une famille et une issue.
   Trois témoins : disjonction, chaque clé désigne encore un site, la dette ne
   grossit pas.

### Alternatives rejetées

- **Verser les 51 sites dans `DELIBERATELY_WIDE`.** Le cliquet serait vert en
  affirmant 51 fois une décision que personne n'a prise. « Décidé large » et
  « pas encore instruit » ne sont pas la même phrase, et dans un inventaire
  unique on lira toujours la première.
- **Resserrer les 12 audiences du relevé dans ce lot.** Sept d'entre elles
  passeront par `scanLiveParticipants` avec le lot EFFECTIF de #20051 — qui
  ÉPELLE la loi — donc en sortiront par construction ; les resserrer ici
  doublerait ce lot et entrerait en conflit de chemin avec lui (#5243).
- **Résoudre tout `where` non littéral** (imports, paramètres, appels). Une
  résolution qui devine fabrique des verdicts au lieu d'en publier l'absence, et
  supprime le seul signal honnête que l'instrument possède.

### Conséquences

- Les clés d'inventaire portent leur chemin depuis `src/`
  (`socketio/handlers/StatusHandler.ts#0`). Une clé périmée fait tomber le
  témoin qui exige qu'elle désigne un site : un refus qui ne désigne plus rien
  autorise en silence le site futur qui reprendrait sa clé.
- **Un lot qui touche le DISCRIMINANT reclasse l'inventaire entier** : la clé
  par RANG est stable à l'édition et PAS à l'élargissement — résoudre les
  variables a fait désigner par `participants-reads.ts#0` une autre requête que
  celle qui avait été classée.
- Quatre audiences sont passées à la loi étroite dans le même lot, chacune avec
  un témoin qui tombe sur la mutation inverse : l'annuaire d'appareils E2EE, les
  autres HÔTES de `participant-rights-core`, les GESTIONNAIRES de
  `shareLinkArrivalAnnounce`, l'arrivée du salon GLOBAL.
