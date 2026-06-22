# Analyse UI/UX — Itération 59wb (web)

**Date** : 2026-06-22
**Périmètre** : application **web** exclusivement (`apps/web`)
**Thème** : focus-trap clavier (a11y dialogue) sur les modales/drawers hand-rolled

> Numérotée **59wb** : le numéro `59w` a été pris en parallèle par un autre agent
> (#786, i18n + a11y des saisies OTP) — périmètre **disjoint**. Convention
> 49w/49wb, 53w/53wb, 54w/54wb, 56w/56wb, 57w/57wb/57wc, 58w/58wb/58wc.

## Revue de cohérence (étapes 1–3 de la routine)
- **Doublon détecté & géré (×1 ce run)** : le candidat initial de ce run
  (Escape-dismiss + `role="dialog"` sur `ConversationDrawer`/`AgentTopicEditModal`)
  avait été livré **en parallèle** par **#792 (iter-58w)**, déjà mergé sur `main`.
  La PR doublon **#798** a été **fermée sans merge** (convention #770→#771, #783).
  Le run a **repivoté** sur le différé borné non revendiqué que #792 ET l'analyse
  58w laissaient explicitement ouvert : **le focus-trap**.
- **Complétude** : les surfaces feed (reels 57w/57wb, posts 58wb) sont i18n ;
  l'a11y modales (Escape + dialog semantics) est soldée par #792 ; l'a11y OTP par
  #786 (59w). Restait, dans le cluster « modales hand-rolled », **uniquement le
  focus-trap**.

## Problème traité — pas de confinement du focus clavier
Après #792, `ConversationDrawer` et `AgentTopicEditModal` ont Escape + `role="dialog"`
+ `aria-modal` + `aria-labelledby`, mais **le focus clavier n'était pas confiné**
au dialogue : un utilisateur au clavier pouvait `Tab` hors du modal vers le contenu
de la page situé derrière l'overlay (contenu pourtant inerte/masqué visuellement).
C'est l'attente standard d'un dialogue modal (cf. WAI-ARIA Authoring Practices,
APG Dialog : Tab/Shift+Tab cyclent dans le dialogue ; le focus initial entre dans
le dialogue à l'ouverture).

Référence interne : `components/v2/Dialog.tsx` (la lib de dialogue v2) implémente
déjà ce cycle Tab. Les deux modales hand-rolled ne l'utilisent pas.

## Source de vérité réutilisée (PAS de réimplémentation)
Le hook `useFocusTrap(containerRef, isActive)` **existait déjà** dans
`hooks/use-accessibility.ts` — mais **n'avait AUCUN consommateur** (vérifié par
grep) ni **aucun test direct**. Cette itération :
1. **active** ce hook en le câblant aux deux modales (single source of truth) ;
2. lui **ajoute une couverture de tests** (`hooks/__tests__/use-focus-trap.test.tsx`,
   4 cas : focus initial, inactif, wrap Tab→premier, wrap Shift+Tab→dernier).

Le hook : focalise le premier élément focusable à l'activation, et fait cycler
Tab/Shift+Tab aux bornes (premier↔dernier) via un listener sur le conteneur.

## Correctifs
- **`components/v2/ConversationDrawer.tsx`** : `panelRef` sur le panneau dialogue
  + `useFocusTrap(panelRef, isOpen)` (actif uniquement tiroir ouvert — se
  désactive proprement pendant l'animation de fermeture, `isActive=false`).
- **`components/admin/agent/AgentTopicEditModal.tsx`** : `dialogRef` sur le panneau
  + `useFocusTrap(dialogRef, true)` (modal monté = toujours actif ; démontage par
  le parent retire le listener via cleanup).
- **`hooks/__tests__/use-focus-trap.test.tsx`** : nouveau, couvre le hook activé.

## Décisions
- **Réutilisation du hook existant** plutôt que réimplémentation inline (respecte
  « Single Source of Truth » / « No reimplementation » du CLAUDE.md). `v2/Dialog`
  garde sa propre implémentation inline historique — sa **consolidation vers
  `useFocusTrap`** est notée comme opportunité future (ne pas toucher ici : Dialog
  est très consommé, refactor = lot dédié à risque indépendant).
- **Restauration de focus à la fermeture** (renvoyer le focus à l'élément
  déclencheur) **NON ajoutée** : ce serait une modification du hook partagé
  affectant sa sémantique ; bornée et différée (voir ci-dessous). Le périmètre
  reste additif et sûr (active du code existant + le teste).
- Aucune dépendance ajoutée ; pattern identique sur les deux modales.

## Vérifié — NE PLUS re-flagger
- `ConversationDrawer.tsx` / `AgentTopicEditModal.tsx` : focus-trap clavier en
  place via `useFocusTrap`. Le cluster « gestes/a11y modales hand-rolled » (56wb)
  est désormais **entièrement soldé** (Escape #792 + dialog semantics #792 +
  focus-trap 59wb).
- `tsc --noEmit` : 0 erreur sur les fichiers touchés. `use-focus-trap.test.tsx` :
  4/4 verts.

## Revue optimisation (étape 4) — opportunités repérées (différées, bornées)
- **Restauration de focus** au déclencheur à la fermeture des dialogues (enrichir
  `useFocusTrap` d'un retour de focus) — APG recommandé, à faire globalement.
- **Consolidation `v2/Dialog`** vers `useFocusTrap` (supprimer la copie inline) —
  refactor d'un composant très consommé, lot dédié.
- `Badge` variants success/warning/gold hexes off-palette → arbitrage
  `theme.colors.*` vs `gp-*` (hérité 56wb).
- `app/settings/loading.tsx` = server component → i18n server-side dédiée (54w).
- console.error FR (participants-drawer ×5, links-section ×3) — logs dev.
- retrait dépendance orpheline `next-themes` (touche lockfile, isolé).

## Statut
✅ Implémenté — itération 59wb. Diff minimal (3 fichiers : 2 composants + 1 test ;
aucune chaîne i18n / locale touchée → orthogonal aux i18n parallèles). Hook
préexistant activé + couvert. Délégué au CI pour build/typecheck complet.
