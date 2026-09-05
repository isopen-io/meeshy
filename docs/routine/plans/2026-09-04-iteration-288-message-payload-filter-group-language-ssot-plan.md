# Plan — Itération 288 : `normalizeGroupLanguage` → SSOT `normalizeLanguageForDedup`

## Objectifs
Éliminer la jumelle divergente `normalizeGroupLanguage`
(`services/gateway/src/socketio/utils/message-payload-filter.ts`) en la déléguant
à la SSOT partagée `normalizeLanguageForDedup`, de sorte que la clé de groupe de
langue soit région-aveugle pour TOUT code (y compris hors catalogue), comme le
reste du répertoire.

## Modules affectés
- `services/gateway/src/socketio/utils/message-payload-filter.ts` (production)
- `services/gateway/src/socketio/utils/__tests__/message-payload-filter.test.ts` (témoins)

## Phases
1. RED — ajouter 2 témoins : `yue-HK → yue` et collapse de variantes hors
   catalogue en 1 groupe. Prouver l'échec contre l'implémentation verbatim.
2. GREEN — échanger l'import (`normalizeLanguageCode` → `normalizeLanguageForDedup`),
   déléguer `normalizeGroupLanguage`, mettre à jour le doc-comment.
3. Régression — `message-new-producer-parity` + `tsc --noEmit`.

## Dépendances
- `packages/shared` construit (`bun run build`) — la SSOT vit dans le dist consommé.

## Risques estimés
Très faibles : comportement identique pour tout code catalogué ; seule la
convergence de variantes hors catalogue change (bande passante, jamais Prisme).

## Stratégie de rollback
Un seul fichier de production ; `git revert` du commit restaure l'ancien repli.

## Critères de validation
- RED prouvé par `git stash`.
- 22/22 (fichier) + 40/40 (avec parity).
- `tsc --noEmit` EXIT=0.

## Statut de complétion
LIVRÉ. RED prouvé, GREEN 40/40, tsc 0.

## Améliorations futures
- Balayer les autres `normalizeLanguageCode(x) ?? x.toLowerCase()` du dépôt pour
  distinguer les sites de dedup/clé (catégorie B → SSOT) des sites qui préservent
  un ORIGINAL/CLAIMED verbatim (catégorie A → correct tel quel). La majorité des
  17 sites relevés sont catégorie A ; ce lot ferme le seul de catégorie B trouvé.
- `viewed-languages.ts` (`toCodes`) DROP les codes hors catalogue via
  `normalizeLanguageCode` — divergence de préservation avec la SSOT, mais les
  témoins existants rejettent délibérément le garbage (`'@@@'`, `'f'`) ; toute
  conversion doit préserver ce contrat. À instruire séparément.
