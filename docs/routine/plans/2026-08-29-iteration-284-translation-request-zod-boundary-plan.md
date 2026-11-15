# Plan — Itération 284 — `translation:request` frontière Zod

## Objectifs
Porter le dernier handler socket non gardé du gateway (`translation:request`) sur
la frontière Zod partagée, comme les douze familles de handlers délégués.

## Modules affectés
- `services/gateway/src/socketio/MeeshySocketIOManager.ts` (handler + wrapper)
- `services/gateway/src/socketio/__tests__/MeeshySocketIOManager.test.ts` (témoins)
- Réutilise (aucune modification) : `validation/socket-event-schemas.ts`
  (`SocketTranslationRequestSchema`), `middleware/validation.ts`
  (`validateSocketEvent` / `isValidationFailure`).

## Phases
1. **RED** — ajouter 3 témoins de frontière (non-ObjectId, targetLanguage absent,
   charge non-objet) prouvant qu'aucune requête ne part sur charge malformée.
2. **GREEN** — importer le schéma + les helpers ; valider en tête de
   `_handleTranslationRequest` ; consommer les valeurs validées ; passer la
   signature à `data: unknown` ; retirer l'annotation du wrapper.
3. **REFACTOR** — aligner les fixtures existantes sur des ObjectIds valides
   (helper `convId`) pour qu'elles exercent le vrai chemin.

## Dépendances
Aucune nouvelle. Le schéma et les helpers existaient déjà.

## Risques estimés
Faible : trafic nominal (vrais ObjectIds) inchangé ; seule la charge malformée
change de comportement (refus net au lieu d'erreur opaque).

## Stratégie de rollback
Révert du commit — changement isolé à un fichier de production + son test.

## Critères de validation
- `tsc --noEmit` gateway : 0 erreur.
- `MeeshySocketIOManager.test.ts` : 416/416.
- `src/socketio` : 1705/1705.

## Statut de complétion
LIVRÉ. tsc 0 erreur ; 416/416 ; 1705/1705.

## Suivi progression
Frontière Zod désormais universelle sur les sites d'écoute socket du gateway
(douze familles déléguées + `translation:request` inline).

## Améliorations futures
Un balayage-cliquet des sites `socket.on(` du gateway vérifiant que chaque
handler lisant une charge cliente passe par `validateSocketEvent` figerait cette
propriété (aujourd'hui tenue par revue). À ouvrir en issue si la file de
handlers inline recroît.
