# Plan — Iteration 204 : SSOT `formatShortDate` + recâblage cluster groups/voice/contacts

## Objectives
Supprimer 7 formatages de date `toLocaleDateString()` ad-hoc (dont 6 sans locale
d'interface) et les recâbler sur un nouveau helper SSOT date-seule
`formatShortDate(date, locale)` alimenté par `useI18n().locale`.

## Affected modules
- `apps/web/utils/date-format.ts` (SSOT — nouveau helper + refactor privé)
- `apps/web/__tests__/utils/date-format.test.ts` (tests)
- `apps/web/components/groups/GroupCard.tsx`
- `apps/web/components/groups/groups-layout-responsive.tsx`
- `apps/web/components/groups/GroupDetails.tsx` (+ prop `locale`)
- `apps/web/components/groups/groups-layout.tsx` (passe `locale` à GroupDetails)
- `apps/web/components/groups/ConversationsList.tsx`
- `apps/web/components/settings/voice/VoiceProfileInfo.tsx`
- `apps/web/components/contacts/ConversationDropdown.tsx` (rename + thread locale)

## Implementation phases
1. **RED** — Ajouter tests `formatShortDate` (locale en/fr distinctes, pas de
   `:` heure, défaut fr, entrée string). Vérifier l'échec (fonction absente).
2. **GREEN** — Ajouter `formatShortDate` au SSOT ; refactorer `formatShortFullDate`
   pour déléguer. Recâbler les 7 sites (import + `locale`) ; renommer la fonction
   locale de `ConversationDropdown` et threader `locale`.
3. **Validation** — Suite `date-format.test.ts` verte ; aucune nouvelle erreur tsc.

## Dependencies
Aucune. `useI18n` expose déjà `locale`. Le SSOT `date-format.ts` existe.

## Estimated risks
Faible. Web-only ; aucun schéma/API/migration/clé i18n. Changement visuel
**intentionnel**. Tests `formatConversationDate` agnostiques à l'ordre → refonte
`formatShortFullDate` sans casse.

## Rollback strategy
Révert du commit unique — le helper SSOT est additif ; les recâblages sont
locaux à 6 composants.

## Validation criteria
- `date-format.test.ts` : tous verts (existants + nouveaux `formatShortDate`).
- 0 nouvelle erreur tsc sur les fichiers modifiés.

## Completion status
- [x] Phase 1 RED (6 tests `formatShortDate` ajoutés ; échec confirmé — fonction absente)
- [x] Phase 2 GREEN (helper SSOT + refactor privé `formatShortFullDate` supprimé ;
  7 sites recâblés ; fonction locale `ConversationDropdown` renommée + threadée)
- [x] Phase 3 validation (`date-format.test.ts` 38/38 ; `GroupCard.test.tsx` 7/7 ;
  0 nouvelle erreur tsc — seules subsistent 2 erreurs pré-existantes
  `ConversationsList.tsx:99-100` `(conversation as unknown)._count`, hors diff)
- [ ] Merge + delete branch (en cours)

## Progress tracking
Commit unique sur `claude/brave-archimedes-34xwbe` depuis `main@b7c1fca3`.

## Future improvements
Voir section « Future improvements » de l'analyse 204 (sites avec heure
`PostDetail`/`encryption-settings` → `formatShortDateTime` ; pages admin/join/u ;
`toLocaleString()` numérique).
