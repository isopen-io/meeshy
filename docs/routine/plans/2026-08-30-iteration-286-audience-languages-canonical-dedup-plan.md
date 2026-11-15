# Itération 286 — plan : canonicalisation des langues d'audience de story

## Objectifs

Faire passer `PostService.audienceLanguages` par la SSOT de canonicalisation
`normalizeLanguageForDedup` avant le filtre de pivot `'en'` et la déduplication,
pour que les deux pipelines de traduction de story n'émettent que des cibles NLLB
canoniques et dédupliquées par langue réelle.

## Modules affectés

- `services/gateway/src/services/PostService.ts` — `audienceLanguages` (pure) +
  import élargi.
- `services/gateway/src/__tests__/unit/services/PostService.audienceLanguages.test.ts`
  — 3 pins de comportement supplémentaires.

Aucun changement de schéma, d'API, d'événement socket, ni de format persistant.

## Phases

1. **RED** — ajouter 3 cas exposant le défaut (pivot `'en-US'`/`'EN'`, dédup
   `'fr'`/`'fr-FR'`/`'FR'`, cap post-dédup). ✅ (3 échecs mesurés sur l'ancien code)
2. **GREEN** — canonicaliser via `normalizeLanguageForDedup`, puis filtrer/dédup. ✅
3. **Validation** — suite ciblée + suites `PostService*`/`PostFeedService` + tsc. ✅

## Dépendances

Aucune. `normalizeLanguageForDedup` existe déjà (`packages/shared`, dist inclus).

## Risques estimés

Faible : fonction pure, la canonicalisation ne fait que resserrer l'ensemble
sortant et est idempotente sur les codes déjà canoniques (pins existants intacts).

## Stratégie de rollback

`git revert` du commit unique. Aucun état à migrer.

## Critères de validation

- `PostService.audienceLanguages.test.ts` : 7/7 verts (4 anciens + 3 neufs).
- 8 suites `PostService*` + `PostFeedService` : 184/184 verts.
- `tsc --noEmit` gateway : 0 erreur.

## Statut d'achèvement

**Terminé.** Toutes les phases livrées et validées.

## Suivi / améliorations futures

- Balayer les autres agrégats de `systemLanguage` verbatim non canonicalisés
  (méthode : chercher `systemLanguage` alimentant un `Set`/`filter`/liste de
  cibles sans passer par `normalizeLanguageForDedup`). Les sites de CADRAGE et de
  CONTENU vers un destinataire nommé sont déjà couverts (recipient-language,
  cycles 124-125) ; les agrégats de TARGETS de traduction sont l'autre famille.
- `audienceLanguages` filtre le pivot `'en'` en dur — si le pivot NLLB devenait
  configurable, l'exprimer en constante partagée. Non planifié.
