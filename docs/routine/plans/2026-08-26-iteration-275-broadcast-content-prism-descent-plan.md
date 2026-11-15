# Plan — Itération 275 : contenu de diffusion admin descend le Prisme ordonné

## Objectifs

Faire descendre le prisme ORDONNÉ au CONTENU (sujet/corps) des deux canaux de
diffusion admin, via la SSOT `resolvePrismTranslation`, en préservant la langue
de CADRAGE au rang 1 renseigné (`recipientLanguage`).

## Modules affectés

- `services/gateway/src/jobs/broadcast-recipients.ts` — `localizedBroadcastText`
  (helper pur reprofilé : `lang: string` → `preferredLanguages: readonly string[]`,
  routé par `resolvePrismTranslation`).
- `services/gateway/src/jobs/broadcast-sender.ts` — canal e-mail : CONTENU par
  `recipientLanguages(user)`, CADRAGE (`language`) par `recipientLanguage(user,'en')`.
- `services/gateway/src/jobs/broadcast-inapp-sender.ts` — canal in-app : idem,
  CADRAGE = `lang`.
- Tests : nouveau `__tests__/unit/jobs/broadcast-content-prism-descent.test.ts`.

## Phases

1. **RED** — témoin de descente multi-rangs (rang 1 sans traduction, rang 2 avec)
   sur les deux canaux + unité pure `localizedBroadcastText`. Prouver le rouge sur
   le code rang-1 actuel.
2. **GREEN** — reprofiler `localizedBroadcastText` (SSOT) + recâbler les deux
   callers (contenu ordonné, cadrage rang-1).
3. **REFACTOR** — doc-comments alignés ; retirer le commentaire qui surdit « la
   descente » là où le code ne descendait pas.
4. **VALIDATION** — suites broadcast + framing + `localizedBroadcastText` vertes,
   `tsc` gateway, sous-ensemble de la suite gateway concerné.

## Dépendances

`resolvePrismTranslation` (SSOT, `@meeshy/shared`) — déjà buildée dans `dist`.
`recipientLanguages` / `recipientLanguage` (`utils/recipient-language.ts`).

## Risques estimés

Faible. Rétro-compatible (lecteurs à un rang inchangés) ; zéro coût de traduction
supplémentaire ; pas de changement de contrat/fil.

## Stratégie de rollback

Un seul commit ; revert direct si régression. Aucun état persisté modifié.

## Critères de validation

Voir l'analyse (§ Critères de validation).

## Statut d'achèvement

- [ ] RED prouvé
- [ ] Helper reprofilé (SSOT)
- [ ] Deux callers recâblés (contenu ordonné / cadrage rang-1)
- [ ] Suites vertes + tsc gateway
- [ ] Commit + push

## Améliorations futures

- Sélection des langues-cibles de l'audience par le prisme ORDONNÉ
  (`routes/admin/broadcasts.ts`, `groupBy(['systemLanguage'])`) — dimension #13,
  change le volume de traduction, à ouvrir en issue distincte (voir analyse).
- Unifier le `where`-builder inline de `routes/admin/broadcasts.ts` sur
  `buildBroadcastRecipientFilter` (jumelle divergente).
