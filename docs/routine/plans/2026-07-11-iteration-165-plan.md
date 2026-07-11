# Iteration 165 — Plan d'implémentation (2026-07-11)

## Objectifs
Corriger F165 : le filtre self-translation de `MessageTranslationService` compare la langue source
verbatim à des cibles normalisées lowercase, laissant passer un aller-retour NLLB self-translation
(`FR`/`fr-FR` → `fr`) qui viole le Prisme (règle #1) et gaspille des requêtes ML.

## Modules affectés
- `services/gateway/src/services/message-translation/MessageTranslationService.ts` (prod)
- `services/gateway/src/__tests__/unit/services/MessageTranslationService.audio.test.ts` (tests)

## Phases
1. **RED** — Ajouter dans `MessageTranslationService.audio.test.ts` :
   - 2 tests comportementaux (harness :699) : source `'FR'` et `'fr-FR'` vs target `'fr'` →
     `sendTranslationRequest` NON appelé.
   - 6 tests unitaires `_isSelfTranslation` (exact, uppercase, locale, différent, auto/AUTO, absent).
   - Vérifier qu'ils échouent contre l'ancienne logique (confirmé : 4 rouges).
2. **GREEN** — Factoriser le helper privé `_isSelfTranslation(rawSourceLang, targetLang)` :
   ```ts
   if (!rawSourceLang) return false;
   const sourceLang = normalizeLanguageCode(rawSourceLang) ?? rawSourceLang.toLowerCase();
   if (sourceLang === 'auto') return false;
   return sourceLang === targetLang;
   ```
   Réécrire les deux sites de filtre (`:457`, `:602`) pour l'appeler.
3. **REFACTOR** — La factorisation élimine la duplication des deux blocs (bénéfice DRY).

## Dépendances
`normalizeLanguageCode` (déjà importé, `@meeshy/shared/utils/language-normalize`).

## Risques estimés
Faible. Le filtre devient plus permissif d'exclusion (exclut `FR`/`fr-FR` en plus de `fr`), n'ajoute
jamais de cible. Sémantique `'auto'` préservée. Pas de changement de schéma/API/état persistant.

## Stratégie de rollback
Revert du commit (2 fichiers). Aucune migration, aucun état persistant modifié.

## Critères de validation
- [x] RED confirmé (4 tests rouges contre l'ancienne logique).
- [x] `MessageTranslationService.audio.test.ts` : 131/131 verts.
- [x] `MessageTranslationService.test.ts` + `.branches.test.ts` : 105/105 verts.
- [x] `tsc --noEmit` : aucune nouvelle erreur dans le fichier touché (erreurs baseline
      `@meeshy/shared/prisma/client` = artefact d'install en cours, non liées).

## Statut de complétion
**COMPLET** — fix + 8 tests, RED/GREEN vérifiés.

## Suivi / améliorations futures
Voir backlog de l'analyse 165 : `markAsRead` unreadCount, `reelAffinity` case, digest `pushSent`,
réactions participantId cross-session.
