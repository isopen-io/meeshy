# Plan — Itération 288 : canonicalisation du filtre `?languages=` (liste de messages)

## Objectifs
Réconcilier le filtre bande-passante REST `?languages=` avec son jumeau socket :
canonicaliser les codes de langue verbatim du client (`normalizeLanguageForDedup`)
avant de tailler les traductions, pour que la variante régionale du Prisme
(locale appareil rang 4, `Accept-Language`) matche les clés canoniques stockées.

## Modules affectés
- `services/gateway/src/routes/conversations/messages-list.ts` — site unique du
  parse `?languages=` (frontière client).
- `services/gateway/src/__tests__/unit/routes/messages-list-language-filter-canonicalization.test.ts`
  — nouveau témoin de comportement (HTTP de bout en bout).

## Phases
1. **RED** — témoin HTTP : message avec traductions `{pt, es}` stockées
   canoniquement, `?languages=pt-BR` doit garder `pt`. ✅ (3 rouges avant fix.)
2. **GREEN** — import `normalizeLanguageForDedup`, canonicalisation à la frontière,
   dédup APRÈS canonicalisation. ✅
3. **Non-régression** — suites liées + typecheck. ✅

## Dépendances
`@meeshy/shared/utils/language-normalize` (`normalizeLanguageForDedup`), déjà la
SSOT employée par `PostFeedService.getViewerLanguages`, `viewed-languages.ts`,
`PostService.audienceLanguages`.

## Risques estimés
Négligeables. Le correctif resserre le filtre vers l'espace des clés stockées ;
`?languages=` absent inchangé ; codes canoniques idempotents ; 3-lettres
supportés préservés.

## Stratégie de rollback
Revert du commit (une transformation + un import + un fichier de test). Aucun
état persistant, aucune migration, aucun changement de contrat client.

## Critères de validation
- `messages-list-language-filter-canonicalization.test.ts` : 5/5 verts.
- Suites `messages-list*|translation-transformer|reply-message-protection-contract` :
  108/108 verts.
- `tsc --noEmit` gateway : EXIT=0.

## Statut de complétion
LIVRÉ. RED prouvé, GREEN, non-régression et typecheck verts.

## Suivi de progression / améliorations futures
- Le matching interne des taillleurs (`transformTranslationsToArray`,
  `filterMessagePayloadForLanguages`) reste `.toLowerCase()` sur les clés
  stockées — correct sous l'invariant « clés de traduction canoniques ». Si un
  jour une écriture stocke une clé région-tagée, ce serait un défaut à la SOURCE
  d'écriture, pas au filtre : à garder à l'esprit lors du prochain audit des
  écritures de `Message.translations`.
