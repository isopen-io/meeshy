# Cycle 217 — la fabrique de participant servait trois droits APLATIS depuis l'instantané du join (#20292)

*Routine « amélioration continue du temps réel », sur la tête de `dev`
`c460a066d` (qui porte les cycles 215 et 216).*

## Le défaut, et pourquoi cinq énumérations l'avaient manqué

`serializeConversationParticipant` (`packages/shared/utils/participant-helpers.ts`)
— la fabrique que le dépôt impose à TOUTE surface servant un participant —
servait trois droits d'émission **aplatis**, directement depuis l'instantané du
join :

```ts
canSendMessages: participant.permissions?.canSendMessages ?? true,
```

`Participant.permissions` est l'INSTANTANÉ figé à l'entrée ;
`anonymousSession.rights` est le DELTA que l'hôte pose, et il passe DEVANT. Les
deux DIVERGENT dès le premier `PATCH …/participants/:id/rights`, **par
décision** : la surcharge retirée fait retomber le droit sur sa valeur d'origine,
donc il n'y a aucune écriture à aligner — la seule lecture juste est la lecture
RÉSOLUE.

#20277 avait compté les lecteurs de cette loi en demandant « qui sert
`permissions` ? » et en avait trouvé cinq. **La question juste est « qui dit à un
client ce qu'il a le droit d'envoyer ? », et elle en rend six.** Cette famille a
échappé aux cinq énumérations précédentes parce que son VOCABULAIRE diffère :
trois booléens aplatis, pas un objet `permissions`.

> **Une énumération de lecteurs d'une loi se fait sur ce que la loi DÉCIDE, pas
> sur le nom du champ qui la porte.** Même forme que la leçon 261.

## Ce que le lot écrit, et le choix qui le structure

L'issue posait l'alternative : « soit un cliquet de projection sur les cinq
`select`, soit une signature qui rende l'omission impossible ». **C'est la
seconde**, parce que la première ne garde que les sites qu'elle énumère.

- **La loi déménage dans `packages/shared/utils/participant-rights.ts`.** Elle
  vivait dans la passerelle, qui en était le seul porteur — et la fabrique, qui
  vit dans `packages/shared`, **ne peut rien importer de la passerelle**. C'est
  la cause STRUCTURELLE du défaut, pas un oubli. Même déménagement et même
  raison que `participation-vivante` (#20111) ; la passerelle RÉ-EXPORTE sous les
  mêmes noms, ses dix-sept importateurs sont inchangés.
- **`resolvedSendRight` est l'unique descente du dépôt.** La table complète
  (`resolveParticipantRights`) en est une PROJECTION, droit par droit, au lieu de
  retaper sept fois la même chaîne `??` — c'est précisément la réécriture qui
  avait laissé la fabrique diverger sans que rien ne rougisse.
- **`anonymousSession` devient REQUIS** sur `SerializableParticipantRow`. Une
  fabrique ne peut pas résoudre ce qu'on ne lui donne pas : optionnel, un
  appelant dont le `select` ne le projette pas servirait l'instantané **en
  silence**. Requis, l'omission est une erreur de COMPILATION — la seule garde
  qu'un `select` ne peut pas contourner, et que **nul témoin de valeur ne peut
  voir** (un double Prisma rend ce qu'on lui dit).

## Ce que le compilateur a mesuré, et qui corrige l'issue

L'issue annonçait cinq sites à reprendre, avec une colonne « la surcharge est-elle
chargée ? » portant `oui` pour trois d'entre eux et `à mesurer` pour un
quatrième. **Un `grep` préalable de ce lot a conclu l'inverse — qu'AUCUN des cinq
ne projetait `anonymousSession`.** Les deux étaient faux, et c'est le
compilateur qui a tranché : une fois le champ requis, **un seul site a rougi**,
`routes/sync/participants.ts`. Les quatre autres portent la surcharge
STRUCTURELLEMENT (leur ligne vient d'un `include`, qui garde le composite), et
leur correction est acquise par le seul changement de la fabrique.

> **Un `grep` mesure une orthographe ; un type mesure une propriété.** Les deux
> relevés en prose se sont trompés dans des sens opposés sur la même colonne, et
> aucun des deux n'aurait été démenti par un témoin de valeur.

Le site qui manquait est le plus coûteux des cinq : la collection de
SYNCHRONISATION **hydrate le cache hors-ligne des clients**, donc la valeur
fausse y survit à la fermeture de l'app. Sa projection est ÉTROITE —
`{ select: { rights: true } }` — parce que charger `anonymousSession` entier
rehydraterait `sessionTokenHash` et l'identité de l'invité, ce qu'iter 35 (F8)
avait retiré exprès.

## La préservation de sémantique qu'il ne fallait pas rater

`resolveParticipantRights` portait un retour anticipé : SANS surcharge, la table
part telle quelle — **`canViewHistory` COMPRIS** quand la ligne le porte. La
forme énumérée ne rend que les sept droits d'émission, donc l'écrire dans les
deux cas aurait DROPPÉ ce champ sur le chemin nominal. Le retour anticipé est
donc gardé, et son commentaire dit pourquoi : `resolveEntryRights` le recalcule
de son côté, mais il n'est pas le seul lecteur de cette table (dix-sept
importateurs).

> Déléguer une chaîne à un site unique ne dispense pas de relire ce que la forme
> d'avant disait **en dehors** de cette chaîne.

## Les DEUX témoins, et pourquoi aucun ne subsume l'autre

| témoin | ce qu'il garde | rouge sur |
|---|---|---|
| VALEUR (`serialize-participant-resolved-rights.test.ts`, shared) | la fabrique résout, dans les DEUX sens | la fabrique d'avant : **2 rouges / 4 verts** |
| PROJECTION (`sync-participant-rights-projection.test.ts`, passerelle) | le `select` nomme `anonymousSession.rights`, et RIEN d'autre | la projection retirée : **2 rouges / 1 vert** |

Les témoins de valeur vont dans les deux sens parce que la divergence ment dans
les deux : un droit RETIRÉ laissé à `true` offre une tuile pour un geste refusé
en 403 ; un droit ACCORDÉ laissé à `false` cache une tuile pour un geste que le
serveur accepte. Le second cas marchait par accident tant qu'aucun client ne
lisait la valeur résolue.

## Un rouge rendu par une garde du dépôt, et c'est son travail

La suite partagée a rougi sur `esm-relative-imports` : un import relatif de
VALEUR doit porter son extension `.js` explicite (sûreté d'exécution du `dist`
ESM). `'./participant-rights'` → `'./participant-rights.js'`. La garde a attrapé
exactement ce pour quoi elle existe, avant la CI.

## Gates

| gate | résultat |
|---|---|
| `vitest run` (packages/shared, COMPLET) | **459 fichiers, 10 847 verts / 0 rouge** |
| témoin de VALEUR, fabrique revertie | **2 rouges** |
| témoin de PROJECTION, projection retirée | **2 rouges** |
| `tsc --noEmit` (packages/shared) | **0** |
| `tsc --noEmit` (passerelle) | **0** |
| `jest participantRights participant-rights sync-participant participants-reads participant-role` | **5 suites, 91 verts** |
