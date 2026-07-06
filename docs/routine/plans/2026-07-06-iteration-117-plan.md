# Iteration 117 — Plan d'implémentation (2026-07-06)

## Objectives
Corriger F85 : aligner la classification « message texte » du chemin incrémental
(`ConversationMessageStatsService.onNewMessage` / `onMessageDeleted`) sur l'autorité `recompute()`
(`(messageType || 'text') === 'text'`), pour que `contentTypes.text` soit stable entre incrémental et
recompute. (Renuméroté depuis 116 après collision de docs avec une itération parallèle mergée.)

## Affected modules
- `services/gateway/src/services/ConversationMessageStatsService.ts` (helper + 2 signatures).
- `services/gateway/src/socketio/handlers/MessageHandler.ts` (2 sites `onNewMessage`).
- `services/gateway/src/routes/conversations/messages-advanced.ts` (site `onMessageDeleted`).
- Tests : `ConversationMessageStatsService.test.ts` (+4), assertions étendues dans
  `MessageHandler.test.ts` et `conversation-messages-advanced.test.ts`.
- `docs/routine/analyses|plans/2026-07-06-iteration-117-*`.

## Implementation phases
1. **RED** — tests non-texte (new + delete) : un `messageType: 'location'` avec légende ne doit pas
   (dé)compter `textMessages`. Échouent sur le code actuel.
2. **GREEN** — helper `isTextMessageStat` + threading `messageType` (défaut `'text'`) + 3 sites.
3. **Compat** — étendre les assertions d'appelants existantes au nouvel argument (`expect.anything()`).
4. **Rebase** — sur `origin/main` (conflit limité aux docs routine → renumérotés 117).
5. **Validation** — suites service + handlers + route, puis suite gateway, puis CI.

## Dependencies
`bun install` + `prisma generate` (refaits après redémarrage conteneur).

## Estimated risks
Faibles : param optionnel rétro-compatible ; défaut `'text'` préserve tout comportement 6-args.

## Rollback strategy
Revert du commit (pas de schéma/migration).

## Validation criteria
- 64/64 service ; 405/405 + 35/35 appelants ; RED prouvé (2 échecs sans le gate).
- CI gateway verte.

## Completion status
- [x] Fix + threading appliqués.
- [x] Tests neufs + assertions étendues, RED/GREEN prouvés.
- [x] Rebasé sur main, docs renumérotées 117.
- [ ] Push + CI verte.

## Future improvements
F85b (message texte vide), F86 (video→file), reports antérieurs.
</content>
