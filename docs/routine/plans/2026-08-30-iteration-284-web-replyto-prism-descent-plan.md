# Plan — Itération 284 : l'aperçu de réponse (`replyTo`) web descend le Prisme ordonné

## Objectifs

Résoudre `replyToContent` (bulle citée d'une réponse) via le prisme ORDONNÉ du
lecteur contre les traductions PROPRES du `replyTo`, au lieu de la seule langue
élue pour le message parent. Aligner la cinquième instance de contenu web sur la
SSOT `resolvePrismTranslation`, sans changer le corps du principal.

## Modules affectés

- `apps/web/utils/translation-record.ts` (NOUVEAU — SSOT de l'adaptateur)
- `apps/web/hooks/use-message-display.ts` (résolveur `replyToContent`)
- `apps/web/components/common/messages-display.tsx` (import de l'adaptateur extrait)
- `apps/web/components/common/bubble-message/BubbleMessageNormalView.tsx` (câblage `usedLanguages`)
- `apps/web/components/common/bubble-message/FocalRow.tsx` (nouveau prop `usedLanguages`)
- `apps/web/components/common/BubbleMessage.tsx` (passe `usedLanguages` à `FocalRow`)
- `apps/web/__tests__/hooks/use-message-display.test.ts` (témoins)

## Phases

1. **Extraction adaptateur (refactor sans changement de comportement).**
   Déplacer `buildTranslationRecord` de `messages-display.tsx` vers
   `utils/translation-record.ts`, importer aux deux sites.
2. **RED.** Ajouter à `use-message-display.test.ts` : descente rang-2 du
   `replyTo`, priorité `currentDisplayLanguage` (toggle), normalisation région-taguée,
   non-régression rang-1. Les descentes rang-2 tombent.
3. **GREEN.** `useMessageDisplay` : prop `usedLanguages?: readonly string[]` ;
   `replyToContent` délègue à `resolvePrismTranslation` avec
   `preferredLanguages = [currentDisplayLanguage, ...(usedLanguages ?? [])]`.
4. **Câblage.** `BubbleMessageNormalView` (`_usedLanguages` → `usedLanguages`,
   passé au hook) ; `FocalRow` (prop + passage) ; `BubbleMessage` (passe à `FocalRow`).
5. **Gate.** `use-message-display.test.ts`, suites voisines, `tsc --noEmit`.

## Dépendances

`resolvePrismTranslation` (`packages/shared/utils/conversation-helpers.ts`, SSOT
existante et testée). Aucune nouvelle dépendance externe.

## Risques estimés

- Changement de comportement du toggle sur l'aperçu de réponse : NEUTRALISÉ en
  plaçant `currentDisplayLanguage` en tête du prisme de descente (le choix courant
  reste prioritaire ; on n'ajoute que des rangs de repli).
- Appelant sans `usedLanguages` (`bubble-message/FocalRow` avant câblage) :
  défaut `[currentDisplayLanguage]` ⇒ comportement identique à l'ancien.

## Stratégie de rollback

Revert du commit : les fichiers touchés sont isolés, aucune migration ni schéma.

## Critères de validation

- RED prouvé (descente rang-2 tombe sur le code courant).
- `use-message-display.test.ts` vert (anciens + neufs).
- Suites `bubble-message`, `messages-display` vertes.
- `tsc --noEmit` sans erreur neuve.

## Statut de complétion

Livré dans le commit de l'itération.

## Améliorations futures

- Câbler `usedLanguages` dans `conversations/focal/FocalRow` (autre lentille).
- Cliquet garantissant que toute surface web de contenu descend le prisme ordonné.
