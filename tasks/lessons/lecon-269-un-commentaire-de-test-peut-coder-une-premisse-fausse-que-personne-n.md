## Leçon 269 — un commentaire de test peut coder une prémisse FAUSSE que personne n'a re-vérifiée contre le comportement serveur actuel (2026-08-24, routine calling, Vague 176)

`CallStateMachine.reduceOffering()` (Android) ignorait un `RingTimeout` reçu en `Offering`,
justifié par le commentaire du test : « cancelled once the peer joined ». Cette phrase décrivait
un comportement gateway qui n'existe plus — `CallEventsHandler.ts` documente explicitement,
depuis un incident antérieur nommé (« Item F follow-up »), que `call:join` NE nettoie PLUS le
timer de sonnerie précisément pour laisser l'offre SDP circuler pendant l'early-join. Le test
Android n'a jamais été mis à jour en miroir : il verrouillait un no-op qui a cessé d'être
correct le jour où le gateway a changé de politique, sans qu'aucun signal ne l'indique côté
client — les deux bases de code ne partagent ni type ni test.

> Un commentaire de test qui affirme un fait sur le comportement d'un AUTRE service (ici le
> serveur) est une assertion qui peut expirer sans que le test échoue. Quand un tel commentaire
> nomme une politique serveur précise (« annulé une fois que X »), la vérifier contre le
> handler serveur réel fait partie de la lecture du test — pas seulement contre son
> assertion Kotlin, qui, elle, reste vraie pour toujours puisqu'elle teste le mock de
> son propre no-op.

Le tell qui a permis de la retrouver : l'énoncé de la fonction miroir (`reduceRinging`) traite
DÉJÀ `RingTimeout` normalement — c'est l'ASYMÉTRIE entre les deux branches `when` du même FSM,
sur le même événement, qui aurait dû alerter avant même de lire le commentaire du test. Deux
états voisins d'un même automate qui divergent sur le traitement d'un événement identique
méritent une justification explicite ; ici, elle existait mais était fausse.
