# Plan — Itération 58w (web)

## Base
- Repartir de `main` HEAD `657e588` (post-#774/#776/#780).
- Branche de travail : `claude/practical-fermat-mrz8qr` (repivotée 2× : #782 puis #785 fermées doublons).

## Objectif
Solder le différé **gestes/a11y des modales hand-rolled** (noté 56wb, « 57w+ ») —
axe orthogonal au cluster i18n feed (saturé par les agents parallèles). Ajouter les
gestes de dismiss standard (Escape, backdrop) et la sémantique `dialog` à deux
surfaces : `ConversationDrawer` (user-facing) et `AgentTopicEditModal` (admin).

## Étapes
1. [x] `ConversationDrawer.tsx` : `useEffect` Escape→`onClose` (si `isOpen`) ;
   `role="dialog"`+`aria-modal`+`aria-labelledby` sur le drawer ; `id` sur le `<h2>`.
2. [x] `AgentTopicEditModal.tsx` : import `useEffect` ; Escape→`onClose` (garde `!saving`) ;
   dismiss backdrop (`target===currentTarget`, garde `!saving`) ;
   `role="dialog"`+`aria-modal`+`aria-labelledby` sur la carte + `id` sur le `<h3>` ;
   `aria-label` du bouton X (réutilise `agent.topicEditModal.cancel`).
3. [x] Vérif : aucun test ne référence ces 2 composants ; aucune locale touchée.
4. [x] Annoter analyse + `branch-tracking.md`.
5. [ ] Commit + push + PR ; merge dans `main` après CI vert ; supprimer la branche.

## Contraintes
- Aucune dépendance nouvelle (pas de migration vers Radix `Dialog` — hors périmètre).
- Gardes `!saving` sur les gestes d'`AgentTopicEditModal` (cohérence avec `disabled={saving}`).
- Réutiliser l'i18n existant pour le X (pas d'édition de locale → surface collision minimale).
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (59w+)
`PostsFeedScreen.tsx` (i18n large + FR/EN), `me/page.tsx` `title="Mon profil"`,
focus-trap modales, `Badge` hexes off-palette, `next-themes` orphelin.
