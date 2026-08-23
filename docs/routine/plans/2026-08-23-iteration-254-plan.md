# Plan d'implémentation — Itération 254 : retrait du `participant-resolver` mort

## Objectives

Retirer le module mort `src/utils/participant-resolver.ts` (et son test) du
gateway — un util factorisé jamais câblé, homonyme du vivant
`src/socketio/utils/participant-resolver.ts` — sans toucher au moindre chemin
d'exécution vivant.

## Affected modules

- `services/gateway/src/utils/participant-resolver.ts` — **supprimé**
- `services/gateway/src/__tests__/unit/utils/participant-resolver.test.ts` — **supprimé**

Non touchés (chemins vivants, contre-preuve) :
- `services/gateway/src/socketio/utils/participant-resolver.ts` (module vivant)
- Ses importateurs : `StatusHandler.ts`, `MessageHandler.ts`, `AttachmentReactionHandler.ts`
- Méthodes privées `_resolveParticipantId` (MessageHandler, LocationHandler, ReactionHandler, CallEventsHandler)
- `services/messaging/messageMentions.ts` (`resolveSenderUserId` local, 3 args)

## Implementation phases

1. **Phase 1 — Retrait.** `git rm` des deux fichiers. ✅ Fait.
2. **Phase 2 — Typecheck.** `tsc --noEmit` gateway → exit 0. ✅ Fait.
3. **Phase 3 — Couverture.** `bun run test:coverage` → suite verte, seuils tenus.
4. **Phase 4 — Documentation.** Analyse + plan (ce fichier).
5. **Phase 5 — Publication.** Commit + push sur `claude/brave-archimedes-njhgtm`.

## Dependencies

Aucune. Retrait purement soustractif ; aucun autre module ne dépend des symboles
supprimés (grep : zéro import de production).

## Estimated risks

Très faible. Seul risque théorique : un chargement dynamique non détecté — écarté
par grep exhaustif (`require(`/`import(` sur le chemin : néant) et par
`tsc --noEmit` exit 0.

## Rollback strategy

`git revert` du commit de retrait restaure les deux fichiers à l'identique. Aucun
état externe, aucune migration, aucun schéma impliqué.

## Validation criteria

- [x] `tsc --noEmit` gateway : exit 0
- [x] Aucune référence résiduelle (`grep` hors socketio : néant)
- [ ] `bun run test:coverage` : suite complète verte, seuils 87/80/86/83 tenus
- [x] Module vivant `socketio/utils/participant-resolver.ts` intact

## Completion status

- Retrait : **fait**
- Typecheck : **fait**
- Couverture : **en cours de mesure**
- Docs : **fait**
- Publication : **en attente de la couverture verte**

## Progress tracking

Itération 254 clôt un axe de dette (util factorisé mort, homonymie) dans la
lignée directe des itérations 250/252/253. Méthode confirmée : vérifier
l'APPELANT avant de canonicaliser ; ici l'util n'avait aucun appelant de
production, le retrait est la seule réponse correcte.

## Future improvements

Convergence éventuelle des quatre `_resolveParticipantId` privés vers un util
partagé — refactorisation de COMPORTEMENT (les copies divergent volontairement,
p. ex. résolution par `callId` vs `conversationId`), donc hors périmètre d'une
passe de retrait. À instruire séparément si la duplication devient un coût réel.
