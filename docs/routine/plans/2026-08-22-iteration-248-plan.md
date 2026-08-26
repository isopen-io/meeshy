# Plan — Itération 248 : canonicaliser la porte des langues autorisées d'un lien partagé

## Objectives

Router le côté LIEN (`allowedLanguages`) de la vérification d'accès de
`POST /anonymous/join/:linkId` par la SSOT `normalizeLanguageForDedup`, comme le
côté joignant (`body.language`) l'est déjà — afin qu'un lien configuré avec une
langue région-taguée (`fr-FR`), 3-lettres (`fra`) ou en casse mixte (`FR`)
admette un joignant dont la langue canonique correspond. Suivi #1 de l'itér. 247.

## Affected modules

- `services/gateway/src/routes/anonymous.ts` (1 comparaison + commentaire).
- `services/gateway/src/__tests__/unit/routes/anonymous.test.ts` (4 témoins
  ajoutés).

## Implementation phases

1. **RED** — 4 témoins dans `POST /anonymous/join/:linkId`, placés APRÈS les
   témoins de join-success existants (le témoin `annonce` fait `.find()` sur le
   premier `message.create` accumulé du describe à app partagée : un nouveau
   join réussi placé AVANT lui polluerait sa recherche).
   - lien `['fr-FR','de']` + joignant `'fr'` ⇒ 201 (RED avant fix)
   - lien `['fra']` + joignant `'fr'` ⇒ 201 (RED avant fix)
   - joignant `'fr-FR'` + lien `['fr']` ⇒ 201 (garde, vert avant fix)
   - contre-épreuve `['en-US','de']` + joignant `'fr'` ⇒ 403 (garde, vert avant)
2. **GREEN** — `l.toLowerCase()` → `normalizeLanguageForDedup(l)` dans le
   `.some(...)`. Commentaire réécrit pour nommer la SSOT et la raison.
3. **REFACTOR** — aucun (substitution minimale, import préexistant).

## Dependencies

`normalizeLanguageForDedup` déjà importé dans `anonymous.ts` (ligne 10) et déjà
appliqué au boundary Zod du même fichier. Aucune nouvelle dépendance.

## Estimated risks

Très faible. La canonicalisation élargit les correspondances légitimes sans
jamais franchir entre deux langues distinctes (SSOT à réduction stricte, garde
anti-troncature). Contre-épreuve 403 en place.

## Rollback strategy

Revert d'un seul commit ; aucune donnée persistée n'est modifiée, aucun contrat
de fil ni schéma changé.

## Validation criteria

- [x] RED prouvé : 2 des 4 témoins tombent avant le fix (région-taguée +
      3-lettres), les 2 gardes passent déjà.
- [x] GREEN : suite `anonymous` 30/30.
- [x] Non-régression : 11 suites `anonymous*` 126/126.
- [x] `tsc --noEmit` gateway exit 0.
- [x] Suites voisines Prisme/preview/rejoin 45/45.

## Completion status

**TERMINÉ.** Fix + témoins livrés, validés, tsc vert. Merge vers `main`.

## Progress tracking

- [x] Sync `main`, réalignement branche.
- [x] Audit anti-doublon (analyses 244-247, suivis nommés).
- [x] RED (4 témoins).
- [x] GREEN (substitution SSOT).
- [x] tsc + suites de non-régression.
- [x] Analyse + plan.
- [ ] Commit + push + PR.

## Future improvements

Suivis #2 (reelAffinity), #3 (`_findUsersForLanguage`), #4 (sites web), #5
(backfill base, dont `ConversationShareLink.allowedLanguages`) — détaillés dans
`docs/routine/analyses/2026-08-22-iteration-248-analyse.md`, à instruire par
itérations séparées et par ordre de sévérité.
