# Plan — Iteration 178 : brancher les feuilles de détail read-receipt sur `resolveParticipantAvatar`

## Objectifs
Unifier la résolution d'avatar des feuilles de **détail** de statut (message +
attachment) sur la source unique `resolveParticipantAvatar` déjà utilisée par la
voie **résumé**, supprimant la divergence de sémantique (fallback compte + gestion
chaîne-vide) sur `services/gateway/src/services/MessageReadStatusService.ts`.

## Modules affectés
- `services/gateway/src/services/MessageReadStatusService.ts`
  - `getMessageStatusDetails` (`select` @~1280, retour @~1325)
  - `getAttachmentStatusDetails` (`select` @~1424, retour @~1439)
- `services/gateway/src/__tests__/unit/services/MessageReadStatusService.test.ts`

## Phases
1. **RED** — 2 tests (un par fonction) : avatar local blanc + `user.avatar`
   valide → avatar compte ; deux blancs → `null`. ✅
2. **GREEN** — ajout `user: { select: { avatar: true } }` aux deux `select`,
   retour via `resolveParticipantAvatar(participant)` (helper déjà importé). ✅
3. **Validation** — suite service + suites routes + tsc diff. ✅

## Dépendances
Aucune nouvelle. `resolveParticipantAvatar` (`@meeshy/shared/utils/participant-helpers`,
PR #1925) déjà importé et utilisé dans le fichier.

## Risques estimés
Très faibles — type de retour inchangé, changement strictement additif
(fallback compte + normalisation blanc). Une relation `user { avatar }` de plus
par requête détail (déjà chargée par la voie résumé sœur).

## Stratégie de rollback
`git revert` du commit — 4 lignes de prod + 2 tests, isolé à un seul service.

## Critères de validation
- `MessageReadStatusService` : 165/165. ✅
- `messages*` + `message-read-status` : 16 suites / 581 tests. ✅
- `tsc` gateway : aucune nouvelle erreur (42 vs 44 base). ✅

## Statut : COMPLETE

## Progress tracking
- [x] Analyse rédigée (`2026-07-13-iteration-178-analyse.md`)
- [x] RED (2 tests)
- [x] GREEN (2 fonctions rebranchées)
- [x] Validation locale
- [ ] Commit + push + PR

## Future improvements (backlog reporté)
- displayName `??` blank-leak (`routes/conversations/messages.ts:1178/1214`).
- `getUserLanguageChoices` codes non normalisés (`user-language-preferences.ts`).
- F69 `sanitizeFileName` overlong sans extension (latent).
