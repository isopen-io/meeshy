# Itération 266b — Plan : tenir le contrat « une seule ligne » de `normalizeDisplayName`

## Objectifs

Faire tenir à `normalizeDisplayName` la garantie « affichage sur une seule
ligne » que son doc-comment énonce, en retirant TOUS les terminateurs de ligne
qu'un moteur de rendu traite comme un saut, pas seulement `\r\n\t`.

## Modules affectés

- `services/gateway/src/utils/normalize.ts` — la fonction feuille (1 ligne + doc).
- `services/gateway/src/__tests__/unit/utils/normalize.test.ts` — 6 témoins.

## Phases d'implémentation

1. **RED** — ajouter 6 témoins sous « removing control characters » : U+2028,
   U+2029, U+0085, U+000B, U+000C, et un mix. Écrits en `\u` escapes pour un
   codepoint déterministe. Prouver qu'ils tombent sur `main` sans faire bouger
   d'autre témoin.
2. **GREEN** — élargir le jeu retiré à `/[\r\n\t\v\f  ]/g`.
3. **REFACTOR** — réécrire le doc-comment : énumérer les caractères couverts et
   la raison (rendu), affirmer ce qui reste préservé.

## Dépendances

Aucune. Fonction feuille, pas de nouveau module, pas de changement de signature.

## Risques estimés

Très faibles. Les deux appelants de production enchaînent `sanitizeText` en aval.
Aucun client légitime ne produit ces caractères. Risque théorique : un nom
contenant U+000B/U+000C comme séparateur volontaire — non pertinent pour un
`displayName` mono-ligne.

## Stratégie de rollback

Revert du commit unique.

## Critères de validation

- RED prouvé (6 failed / 133 passed, exactement les nouveaux).
- GREEN : 139/139 sur `normalize.test.ts`.
- `tsc --noEmit` gateway : 0 erreur.
- CI verte.

## Statut de complétude

- [x] Phase 1 (RED)
- [x] Phase 2 (GREEN)
- [x] Phase 3 (REFACTOR doc)
- [x] tsc gateway 0 erreur
- [ ] Commit + push + PR + CI

## Suivi / améliorations futures

- **Jumelle éventuelle** : `capitalizeName` (prénom/nom) ne strippe pas ces
  caractères, mais les noms passent par la validation de pattern du schéma
  (`AuthSchemas.register`, `[\s'.-]` + lettres), qui exclut déjà les terminateurs
  de ligne. Pas de dette symétrique à ouvrir ici.
- **Côté client** : vérifier que les résolveurs d'aperçu (web/iOS/Android) ne
  réintroduisent pas de saut de ligne à l'affichage d'un `displayName` — hors
  scope de ce lot serveur.
