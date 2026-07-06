# Iteration 121 — Plan d'implémentation (2026-07-06)

## Objectifs
Classer les messages vidéo comme un type `'video'` de première classe dans le transformateur V2 et
afficher un aperçu dédié « 🎥 Vidéo » dans la liste des conversations (cible F86).

## Modules affectés
- `apps/web/utils/v2/transform-conversation.ts` — `getMessageType` (union + branche `video/*`).
- `apps/web/components/v2/ConversationItem.tsx` — union `lastMessage.type` + branche de rendu.
- `apps/web/utils/v2/__tests__/transform-conversation.test.ts` — couverture de classification par mime.
- i18n : **aucune modification** — `v2chat.video` déjà présent dans en/fr/es/pt.

## Phases
1. **RED** : étendre `transform-conversation.test.ts` avec un bloc `getMessageType (via lastMessage.type)`
   couvrant image→`photo`, audio→`voice`, video→`video` (échoue), autre/pdf→`file`, aucun→`text`.
2. **GREEN** : ajouter `'video'` à l'union de retour + branche `mimeType.startsWith('video/')` dans
   `getMessageType`.
3. **GREEN (rendu)** : ajouter `'video'` à l'union `ConversationItemData.lastMessage.type` + branche de
   rendu (🎥 `&#127909;` + `t('v2chat.video')`, gestion `attachmentCount > 1` comme `photo`/`file`).
4. **VALIDATION** : suite de tests web ciblée + `tsc --noEmit`.

## Dépendances
Aucune. Clé i18n déjà livrée.

## Risques estimés
Très faibles — changement additif, aucun chemin existant modifié. `tsc` verrouille l'exhaustivité.

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun changement de schéma/contrat réseau.

## Critères de validation
- Test `transform-conversation.test.ts` vert (nouveaux cas de classification inclus).
- Aucune régression dans `apps/web/utils/v2/__tests__/`.
- `tsc --noEmit` propre sur les 2 fichiers modifiés.

## Statut de complétion
- [x] Phase 1 — RED (test video→'video' échouait sur l'union restreinte)
- [x] Phase 2 — GREEN (transform : branche `video/*` + union étendue)
- [x] Phase 3 — GREEN (rendu : branche 🎥 `v2chat.video`)
- [x] Phase 4 — Validation : `transform-conversation.test.ts` 10/10, suites v2 85/85,
      `tsc --noEmit` propre sur les 2 fichiers modifiés (6 erreurs restantes = pré-existantes,
      fichier non lié `conversation-item/ConversationItem.tsx`, présentes sur `main`).

## Suivi de progression / améliorations futures
- F86b (dedup timestamp `use-message-translations`) documenté comme prochain candidat web LOW.
