# Plan — Itération 58wc (web)

## Objectif
Internationaliser les 7 chaînes FR figées de `ConversationSettingsModal.tsx`
(surface disjointe de la congestion reels/feed des PR parallèles).

## Étapes
1. [x] Vérifier la congestion des PR ouvertes → choisir une surface disjointe
2. [x] Confirmer `useI18n('conversations')` présent dans le composant
3. [x] Vérifier la parité ×4 locales des clés réutilisées
   (`cancel`/`confirm`/`addDescription`/`saving`)
4. [x] Ajouter 2 clés neuves `conversationDetails.{loading,untitled}` ×4 locales
5. [x] Remplacer les 7 chaînes JSX par `t('conversationDetails.*')`
6. [x] Valider JSON ×4
7. [x] Docs analyse + plan + branch-tracking
8. [ ] Commit, push, PR, CI vert, merge dans main, supprimer la branche

## Périmètre
- `apps/web/components/conversations/ConversationSettingsModal.tsx` (6 swaps)
- `apps/web/locales/{en,fr,es,pt}/conversations.json` (+2 clés chacun)
- docs/analyses/uiux + docs/plans/uiux + branch-tracking

## Hors périmètre (différé 59w+)
Voir section « Revue optimisation » de l'analyse 58wc.
