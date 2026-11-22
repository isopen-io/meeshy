# Cycle 212 — une réservation ne s'auto-atteste pas (#20295)

*Routine « amélioration continue du temps réel ». Lot mesuré pendant l'attente de
la file de runners, sur la tête `d2a401787` (cycles 210 et 211).*

## Le fait

`RESERVED_SERVER_EVENTS` (`packages/shared/types/socketio-events/event-names.ts`)
réserve trois noms du pipeline de traduction EN APPEL — `call:translation-requested`,
`call:translation-enabled`, `call:transcription-result` — et la réservation
elle-même est une bonne pratique instruite par le dépôt : réserver un nom évite
que les trois clients l'inventent chacun de son côté. `message:countdown-started`
est le précédent d'une réservation honorée par le lot qui a posé l'émetteur.

Sa JUSTIFICATION, elle, était fausse :

> Les trois noms sont **décodés côté clients** et attendent le service qui les
> produira.

Mesuré (balayage de `services`, `packages`, `apps`, hors tests) : **aucune
occurrence** des trois hors de la déclaration et de sa copie dans
`packages/shared/dist`. Ni `apps/web`, ni `apps/ios` / `packages/MeeshySDK`, ni
`apps/android`. Et l'inventaire de `socket-event-orphan-gate` les portait pendant
ce temps sous « **ni émis ni lu — dette de contrat** » : deux affirmations
contradictoires sur la même donnée, dont une seule se mesurait.

## Pourquoi ça coûte

Le coût n'est pas l'inexactitude, c'est que la phrase **oriente**. Lue par qui
vient écrire le pipeline, elle dit « les clients sont prêts, il ne manque que
l'émetteur » — et ce lot-là livrerait un émetteur que personne n'affiche, soit
exactement le défaut du cycle 122 (« qui AFFICHE ce que ce résolveur élit ? »).

Et c'est une RECHUTE que le doc-comment raconte lui-même, deux paragraphes plus
haut : la prose qu'il a remplacée — « Call events RESERVED (no emitter yet) » —
« avait pourri sans que rien ne le signale », en énumérant six événements que la
passerelle émettait depuis. **Le remède appliqué alors (réécrire la prose) ne
pouvait pas tenir : il ne rend pas la phrase vérifiable.**

## Ce que le lot écrit

- **La mesure plutôt que l'espoir**, dans le doc-comment : aucun client ne cite
  ces noms, donc le lot qui posera le service devra écrire les lecteurs dans le
  même train.
- **Un témoin qui tient la phrase** (`socket-event-orphan-gate`, § « un nom
  RÉSERVÉ est mesuré sans lecteur ») : il vit là où la mesure vit déjà, et il
  porte DEUX assertions, chacune prouvée rouge :

| mutation | ce qui tombe |
|---|---|
| un nom LU entre dans la réservation (`message:new`) | « nom RÉSERVÉ que des clients citent — le service a-t-il atterri ? » |
| un nom réservé que RIEN ne mesure (`call:fantome`) | « nom RÉSERVÉ absent de l'inventaire mesuré — une réservation dit ce qu'elle a MESURÉ, jamais ce qu'elle espère » |

La seconde est celle qui ferme la porte pour de bon : elle exige que tout nom
réservé figure dans l'inventaire MESURÉ de l'orphan gate, lequel est déjà un
cliquet à deux sens. La réservation cesse donc d'affirmer quoi que ce soit
toute seule — elle renvoie à ce qui compte.

## Pourquoi aucune leçon neuve

La classe — « une affirmation se mesure » — a déjà ses leçons (261, et les quatre
variantes du 2026-11-21 sur les raisons d'inventaire, les portées et les
exclusions). Ce qui est neuf ici n'est pas le diagnostic mais le REMÈDE : devant
une prose qui décrit l'état d'AUTRES composants, la réécrire ne suffit jamais —
il faut la faire POINTER vers la mesure, ou la supprimer. Consigné ici plutôt
qu'en leçon de plus.

## Gates

| gate | résultat |
|---|---|
| `vitest socket-event-orphan-gate` | 4 verts / 0 rouge (et rouge sur les deux mutations) |
| `vitest socket-event-platform-parity-gate` | 5 verts |
| `tsc --noEmit` (`packages/shared`) | **0** |
