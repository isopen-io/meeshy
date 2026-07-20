# Plan Iteration 182 — SSOT blank-aware `displayName` sur les DTO participants d'appel

## Objectifs
Aligner la sérialisation du `displayName` des participants d'appel
(`CallEventsHandler`) sur le SSOT blank-aware `resolveParticipantDisplayName`
(#2025), supprimer la triplication du mapping participant→DTO, sans toucher au
comportement de `username`/`avatar`.

## Modules affectés
- `services/gateway/src/socketio/callParticipantView.ts` (nouveau — helper pur)
- `services/gateway/src/socketio/CallEventsHandler.ts` (3 sites câblés + import)
- `services/gateway/src/__tests__/unit/socketio/callParticipantView.test.ts`
  (nouveau — 9 tests)
- `packages/shared/utils/participant-helpers.ts` (réutilisé, non modifié)

## Phases d'implémentation
1. **RED** — `callParticipantView.test.ts` : priorité local>compte ; fallback
   `''` local ; whitespace-only local = absent ; `undefined` quand tout blanc /
   pas de participant ; ordre avatar compte-first préservé ; fallback username
   préservé ; pass-through identité/role/flags/quality ; `userId → participantId`.
2. **GREEN** — `callParticipantView.ts` : `toCallParticipantView(row)` pur ;
   `displayName: resolveParticipantDisplayName(row.participant) ?? undefined` ;
   reste reproduit à l'octet près. Câbler les 3 sites `CallEventsHandler`
   (`.map(toCallParticipantView)` ×2, `toCallParticipantView(participant)` ×1).
3. **REFACTOR** — retrait de l'import `ConnectionQuality` inutilisé dans
   `CallEventsHandler` ; docstrings ; aucune duplication introduite.

## Dépendances
Aucune (SSOT shared déjà buildé/testé ; jest map `@meeshy/shared/*` → source).

## Risques estimés
Très faible : `username`/`avatar`/identité/flags/quality identiques aux sites
d'origine ; seul `displayName` change (sens strictement plus correct). Helper pur
testé en isolation. L'ordre avatar (compte-first, divergent du SSOT) est
**volontairement préservé** — sa migration nécessite une décision produit
(backlog).

## Stratégie de rollback
Revert du commit unique — les 3 sites retrouvent leur mapping inline `||` (fuite
de nom blanc incluse) et le helper/test disparaissent, sans effet de bord.

## Critères de validation
- `callParticipantView.test.ts` : 9/9 verts.
- Suites `CallEventsHandler-*` : inchangées / vertes.
- `tsc --noEmit` gateway : 0 nouvelle erreur sur les lignes touchées.

## Statut de complétion
- [x] Phase 1 RED (test écrit)
- [x] Phase 2 GREEN (helper + câblage 3 sites)
- [x] Phase 3 REFACTOR (import retiré)
- [x] Validation — `callParticipantView.test.ts` **9/9** verts ; suites
      `CallEventsHandler-*` **24/24 (471 tests)** vertes (aucune régression) ;
      `tsc --noEmit` gateway : **0 erreur**.
- [x] Commit + push

## Améliorations futures
- Migrer l'avatar des appels sur `resolveParticipantAvatar` **après confirmation
  produit** de l'ordre local → compte (cf. backlog analyse 182).
- Étendre `toCallParticipantView` à d'éventuels futurs sites de sérialisation de
  participant d'appel (source unique).
