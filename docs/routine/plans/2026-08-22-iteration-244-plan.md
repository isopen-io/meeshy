# Iteration 244 — Plan : `sanitizeFileName` tient enfin son plafond de 255 et ne fabrique plus de dotfile

## Objectif
Corriger la branche de troncature de `sanitizeFileName` (`apps/web/utils/xss-protection.ts`) qui, sur
un nom sans point de plus de 255 caractères, retournait `"." + nom entier` — une sortie plus LONGUE
que l'entrée, un fichier caché, et le plafond de longueur défait.

## Modules affectés
- `apps/web/utils/xss-protection.ts` — branche `if (sanitized.length > maxLength)` réécrite.
- `apps/web/utils/__tests__/xss-protection.test.ts` — fichier EXISTANT (47 tests) : 2 cas de
  troncature AJOUTÉS au bloc `sanitizeFileName`.

## Phases
1. **RED** — Ajouter 2 cas au bloc `sanitizeFileName` existant (dotless > 255, segment de queue
   énorme) : les deux rendent 301 avant correctif.
2. **GREEN** — Réécrire la branche : détecter l'extension par `lastIndexOf('.')` (`> 0`), ne la
   préserver que si `ext.length <= maxLength - 2` (garantit un nom non vide et un slice positif),
   sinon troncature dure `slice(0, maxLength)`.
3. **Validation** — 50/50 verts ; grep des appelants ; `tsc --noEmit` propre.

## Dépendances
- Aucune. Fonction pure, aucun appelant existant, aucun changement de signature.

## Risques estimés
- **Négligeable.** `slice` avec arguments garantis positifs (garde sur `ext.length`). Le seul
  changement observable porte sur des entrées > 255 caractères, déjà corrompues auparavant. Point de
  tête préexistant préservé (comportement inchangé pour les vrais dotfiles courts).

## Stratégie de rollback
- `git revert` du commit unique.

## Critères de validation
- [x] RED prouvé (2 troncatures ajoutées rendent 301 avant fix).
- [x] GREEN : 50/50 `xss-protection.test.ts` (47 existants + 3 troncatures).
- [x] Aucun appelant repéré (grep `apps/web`).
- [x] `tsc --noEmit` sans erreur nouvelle.
- [ ] CI verte sur la PR.

## Statut d'achèvement
**Complet.** Branche de troncature corrigée, 2 cas de régression ajoutés au bloc existant.

## Progression
1. ✅ RED (2 troncatures → 301)
2. ✅ GREEN (branche réécrite, plafond tenu, pas de dotfile synthétisé)
3. ✅ Validation (50/50, tsc propre)
4. ✅ Incident corrigé : `Write` avait écrasé le fichier de test existant (443 l.) ; restauré depuis
   `origin/main` et cas neufs fusionnés dans le bloc existant.

## Améliorations futures
1. `isSharedChatRoute` sans garde falsy (asymétrie avec `isPublicRoute`).
2. `sanitizeText`/`truncateText` : troncature qui peut couper une paire de substituts UTF-16.
3. Bornes username admin (3–30) vs `normalizeUsername` (2–16) — arbitrage produit requis.
# Plan — Itération 244 : canonicaliser les comparaisons de langue du hook web

## Objectives

Éliminer la comparaison de codes de langue bruts dans
`apps/web/hooks/use-message-translations.ts` en la routant par la SSOT
`normalizeLanguageForDedup`, pour que le Prisme matche les codes région-tagués /
casse-mixte (`en-US` = `en`, `fr-FR` = `fr`).

## Affected modules

- `apps/web/hooks/use-message-translations.ts` — helper `sameLanguage` + 6 sites.
- `apps/web/__tests__/hooks/use-message-translations.test.tsx` — +5 témoins.

## Implementation phases

1. **RED** — 5 témoins région-tagués/casse (original tagué = préféré ; traduction
   taguée matche ; `getPreferredLanguageContent` sans `translatedFrom` parasite ;
   `shouldRequestTranslation` false ; `getRequiredTranslations` vide). ✅
2. **GREEN** — helper `sameLanguage(a, b)` = `normalizeLanguageForDedup(a) ===
   normalizeLanguageForDedup(b)` (faux si code vide), appliqué aux 6 comparaisons. ✅
3. **Docstring** — documenter la frontière de normalisation et la SSOT. ✅

## Dependencies

- SSOT `normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`)
  — consommée, non modifiée.

## Estimated risks

Faible. Canonicalisation idempotente ⇒ zéro régression sur les codes canoniques.
Signature publique du hook inchangée.

## Rollback strategy

Révert du commit unique. Aucun schéma, aucune migration, aucun changement de
contrat wire.

## Validation criteria

- Jest : suite du hook 50/50 ; voisines 32/32 ; `tsc` sans nouvelle erreur. ✅
- CI verte sur la PR. ⏳

## Completion status

- [x] Phase 1 RED
- [x] Phase 2 GREEN
- [x] Phase 3 docstring
- [x] Analyse + plan
- [ ] CI verte / merge

## Progress tracking

Itération autonome unique. Commit sur `claude/brave-archimedes-wkfh6n`.

## Future improvements

Voir la section « Future improvements » de l'analyse 244 : dedup map interne
keyée par code brut ; audit des consommateurs web restants.
