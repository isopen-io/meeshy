# Iteration 122 — Plan d'implémentation (2026-07-06)

## Objectives
Rendre `ifNoneMatchMatches` conforme à **RFC 7232 §3.2** (comparaison FAIBLE des validateurs pour
`If-None-Match`), afin que le conditional-GET (ETag/304) récemment généralisé ne soit pas silencieusement
annulé derrière un CDN/proxy transformant qui affaiblit les ETags forts en `W/"…"`.

## Affected modules
- `services/gateway/src/utils/etag.ts` — `ifNoneMatchMatches` : comparaison faible (strip `W/` des 2 côtés).
- `services/gateway/src/utils/__tests__/etag.test.ts` — +5 cas paramétrés (faibles).
- `services/gateway/src/__tests__/unit/utils/etag.test.ts` — +3 `it` (faible seul / en liste / non-match).

## Implementation phases
1. **RED** — ajouter les cas `W/"abc"` (attendu `true`) dans les deux suites → échec avec le code exact
   `values.includes(etag)`. ✅
2. **GREEN** — implémenter la comparaison faible : `*` en court-circuit, puis `opaqueTag(v).replace(/^W\//,'')`
   des deux côtés + `values.some(...)`. ✅
3. **Validation** — jest sur les 2 suites etag + contrats conditional-GET + `/sync`. ✅

## Dependencies
Aucune. Changement local à une fonction pure ; aucun appelant ne change de signature.

## Estimated risks
Très faible. La comparaison faible est correcte pour tous les appelants (`If-None-Match` sur GET
idempotents). Le chemin fort direct-to-origin (`"abc"`) matche exactement comme avant.

## Rollback strategy
Revert du commit (isolé, un seul fichier source + deux fichiers de test).

## Validation criteria
- [x] etag suites : 39/39 (dont 8 nouveaux cas faibles).
- [x] `async-send-contract` + `download-onsend-double-send` : 4/4.
- [x] `/sync` : 16/16.
- [x] `ifNoneMatchMatches('W/"abc"', '"abc"') === true` ; `ifNoneMatchMatches('"abc"', '"abc"') === true` ;
      `ifNoneMatchMatches('W/"def"', '"abc"') === false`.

## Completion status
**COMPLET.** Fix + tests + docs. Prêt à commit/push.

## Progress tracking
- [x] Analyse + plan.
- [x] Tests RED puis fix GREEN.
- [x] jest vert (39 + 4 + 16).
- [ ] Commit + push.

## Future improvements
- **F87 (LOW)** : unifier `sanitizeMongoQuery` sur le garde de clés dangereuses de `sanitizeJSON`.
- **F88 (MINOR)** : clamp défensif de `truncateFilename` pour `maxLength < 4`.
