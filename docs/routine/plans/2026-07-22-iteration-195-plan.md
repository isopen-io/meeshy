# Iteration 195 — Plan d'implémentation : éliminer les 2 derniers `slice(0,2)` sur code de langue + 6e copie `FLAG_MAP`

## Objectifs
Rebrancher les 3 sites restants de troncature aveugle de code de langue sur le
SSOT `normalizeLanguageCode` (+ `getFlag`), fermant la classe de collisions
639-2/3 → globe/défaut sur le canal email (backend) et les couleurs/drapeaux web.

## Modules affectés
- **Gateway** : `services/gateway/src/services/EmailService.ts`
  (`normalizeLanguage`) + `__tests__/unit/services/EmailService.test.ts`.
- **Web** : `apps/web/components/v2/theme.ts` (`getLanguageColor`),
  `apps/web/components/v2/LanguageOrb.tsx` (suppression `FLAG_MAP` locale) +
  nouveau `apps/web/__tests__/components/v2/theme.test.ts`.

## Phases

### Phase 1 — Gateway EmailService (RED → GREEN)
1. RED : ajouter dans `EmailService.test.ts` (bloc i18n) deux tests :
   `sendPasswordResetEmail({ language: 'spa' })` → `htmlContent` contient `'Hola'` ;
   `{ language: 'por' }` → contient `'Olá'`. + garde de non-régression :
   `{ language: 'ita' }` → `'Ciao'`/contenu italien, `{ language: 'pt-BR' }` → `'Olá'`.
2. GREEN : `import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize'` ;
   `normalizeLanguage` = `normalizeLanguageCode(language)` puis membership check
   sur `['fr','en','es','pt','it','de']`, sinon `defaultLanguage`.

### Phase 2 — Web theme.getLanguageColor (RED → GREEN)
1. RED : nouveau `theme.test.ts` — `getLanguageColor('spa')` = `'#F59E0B'`,
   `getLanguageColor('deu')` = `'#4338CA'` ; gardes `getLanguageColor('fr')` = `'#6366F1'`,
   `getLanguageColor('xx')` / `''` = `default`.
2. GREEN : remplacer `code.toLowerCase().slice(0,2)` par
   `normalizeLanguageCode(code)` (import depuis `@meeshy/shared`).

### Phase 3 — Web LanguageOrb (refactor SSOT)
1. Supprimer la constante `FLAG_MAP` locale + `normalizedCode`/`slice`.
2. `import { getFlag } from './flags'` ; `displayFlag = flag || getFlag(code)`.
3. Couvert par `flags.test.ts` (getFlag déjà testé, dont `id`) — pas de test
   render supplémentaire nécessaire (délégation pure à des helpers testés).

## Dépendances
`normalizeLanguageCode` (SSOT, déjà exporté `@meeshy/shared/utils/language-normalize`)
+ `getFlag` (`v2/flags.ts`, itération 194). Aucune nouvelle dépendance.

## Risques estimés
Faible. Changements strictement additifs/correctifs ; les cas fonctionnant par
hasard restent identiques. Seul risque : import ESM `@meeshy/shared` côté gateway
— déjà utilisé par d'autres services gateway (`AttachmentReactionService`, etc.).

## Stratégie de rollback
Chaque phase est un commit indépendant, revert isolé possible. Aucun changement
de schéma/API/contrat.

## Critères de validation
- Gateway : `bun run test` sur `EmailService.test.ts` vert (nouveaux + existants).
- Web : `bun run test` sur `theme.test.ts` + `flags.test.ts` vert.
- Typecheck des 3 fichiers de production OK.
- RED prouvé avant fix pour chaque phase.

## Statut de complétion
- [x] Phase 1 — Gateway EmailService (`normalizeLanguage` → SSOT). RED prouvé
      (`spa`→email EN « Hello Carlos »), GREEN ; suite complète 72/72.
- [x] Phase 2 — Web getLanguageColor (SSOT). RED prouvé (`spa`→gris `#64748B`
      au lieu d'ambre `#F59E0B`), GREEN ; `theme.test.ts` 5/5.
- [x] Phase 3 — Web LanguageOrb (délégation `getFlag`, 6e copie `FLAG_MAP`
      supprimée, incl. `id` manquant). `flags.test.ts` 16/16 inchangé.
- [x] Validation globale : typecheck des 3 fichiers prod OK (0 erreur), aucune
      régression.

## Progress tracking
Démarrage @ `main eea15779`. Branche `claude/brave-archimedes-isgqzw`.
Validation : gateway `EmailService.test.ts` 72/72 ; web `theme.test.ts` +
`flags.test.ts` 21/21 ; RED prouvé pour Phase 1 et Phase 2 (stash prod → échec
attendu → restore → vert). `tsc --noEmit` : 0 erreur sur les 4 fichiers touchés
(les erreurs TS restantes sont pré-existantes, dans `__tests__/admin/...`, non
touchées).

## Améliorations futures
- Miroir Swift/Android : vérifier qu'aucun `String(prefix: 2)` sur code de
  langue ne subsiste hors `MeeshyUser.normalizeLanguageCode`.
- Envisager un `getSupportedEmailLanguage` partagé si d'autres services backend
  dupliquent l'ensemble des 6 langues email.
