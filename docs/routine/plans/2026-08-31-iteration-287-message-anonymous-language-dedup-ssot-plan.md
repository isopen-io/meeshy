# Plan — Itération 287 : branche anonyme de `_extractConversationLanguages` → SSOT dedup

## Objectifs
Faire passer la branche ANONYME/BOT de
`MessageTranslationService._extractConversationLanguages` par la SSOT de
canonicalisation-avec-dedup `normalizeLanguageForDedup`, pour qu'elle produise la
même clé canonique que la branche INSCRIT (déjà conforme via
`resolveUserLanguagesOrdered` → `normalizeInAppLanguage`) et cesse d'injecter des
cibles NLLB région-taggées inconnues dans le `Set` partagé.

## Modules affectés
- `services/gateway/src/services/message-translation/MessageTranslationService.ts`
  - import : ajouter `normalizeLanguageForDedup`
  - branche anonyme (l. ~907-917) : remplacer l'idiome inline
- `services/gateway/src/__tests__/unit/services/message-translation-destinations.test.ts`
  - nouveau pin de comportement

## Phases
1. **RED** — pin : conversation mêlant un inscrit `systemLanguage: 'yue-HK'` et un
   anonyme `language: 'yue-HK'` doit rendre `['yue']`, jamais `'yue-hk'`. Prouvé
   RED contre l'idiome inline (`[yue, yue-hk]`).
2. **GREEN** — remplacer par `normalizeLanguageForDedup(participant.language)`.
3. **REFACTOR** — commentaire du site mis à jour pour nommer la SSOT et la parité
   avec la branche inscrit.

## Dépendances
- `packages/shared` construit (dist expose `normalizeLanguageForDedup`) et client
  Prisma généré (prérequis CLAUDE.md local test parity).

## Risques estimés
Faible. Fonction pure ; la SSOT ne fait que resserrer l'ensemble sortant. Aucune
régression sur les 6 pins existants.

## Stratégie de rollback
Revert du commit — un seul site de production, un seul fichier de test.

## Critères de validation
- Nouveau pin RED→GREEN prouvé.
- `MessageTranslationService*` (139) + destinations (7) verts.
- `tsc --noEmit` gateway : 0 erreur.

## Statut de complétion
LIVRÉ — RED prouvé (`[yue, yue-hk]`), GREEN (`[yue]`), tsc 0 erreur, 146 tests verts.

## Améliorations futures
Consistance de `_resolveTargetLanguages` / `_normalizeSourceLanguage` (idiome
inline restant) — valeur moindre, à ouvrir en issue si retenu par le balayage de
campagne.
