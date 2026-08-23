# Plan — Itération 255 : consolidation SSOT de la résolution de langue web

## Objectives

Rebrancher les deux réimplémentations partielles du Prisme Linguistique (code de
langue d'affichage d'un autre participant) sur la source de vérité partagée
`resolveUserLanguagesOrdered`, pour restaurer les 4 niveaux du Prisme +
normalisation sur les pastilles de langue.

## Affected modules

- `apps/web/hooks/v2/use-contacts-v2.ts` (contact `languageCode`)
- `apps/web/utils/v2/transform-conversation.ts` (conversation directe `languageCode`)
- Tests : `apps/web/__tests__/hooks/v2/use-contacts-v2.test.tsx`,
  `apps/web/utils/v2/__tests__/transform-conversation.test.ts`

## Implementation phases

1. **RED** — ajouter les témoins de résolution complète (custom-destination →
   code, normalisation `'EN'`→`'en'` / `'pt-BR'`→`'pt'`, ordre system>regional,
   repli `'fr'`) sur les deux suites. Vérifier qu'ils tombent.
2. **GREEN** — importer `resolveUserLanguagesOrdered` et remplacer l'échelle
   `||` par `resolveUserLanguagesOrdered(user, { deviceLocale })[0] ?? 'fr'`.
3. **Validation** — suites ciblées, puis balayage régression `utils/v2` +
   `hooks/v2` + `__tests__/utils`, puis `tsc --noEmit` (scope diff).

## Dependencies

`resolveUserLanguagesOrdered` déjà exporté par
`@meeshy/shared/utils/conversation-helpers` (SSOT existante). `packages/shared`
buildé (dist) pour que jest résolve l'import via moduleNameMapper.

## Estimated risks

Très faibles. Contrat de retour élargi en sur-ensemble strict de l'ancien ; repli
`'fr'` préservé. Aucun cast (les 4 champs sont sur `SocketIOUser`).

## Rollback strategy

Revert du commit : deux expressions et deux imports. Aucune migration, aucun
schéma, aucun contrat de fil touché.

## Validation criteria

- RED confirmé puis GREEN (39 tests des deux suites). ✅
- 52 suites / 1236 tests régression verts. ✅
- Diff limité à 4 fichiers ; `tsc` n'ajoute aucune erreur. ✅

## Completion status

**COMPLETE.** Implémenté, validé, prêt à merger.

## Progress tracking

- [x] RED sur les deux suites
- [x] GREEN (consolidation SSOT × 2)
- [x] Régression verte (52 suites)
- [x] Analyse + plan documentés

## Future improvements

Balayer d'autres réimplémentations `x.systemLanguage || x.regionalLanguage`
restantes hors des sites SENDER (déjà instruits comme passthrough de champ),
p. ex. dans les surfaces admin/legacy, et les rebrancher au même helper au fil
des touches naturelles.
