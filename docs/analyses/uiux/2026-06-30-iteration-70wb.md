# Analyse UI/UX — Itération 70wb (Web)

> **Note de label** : l'étiquette `70w` a été prise en parallèle par #1088 (`PhoneResetFlow` i18n, mergée sur `main`). Cette itération est renommée **70wb** (surface disjointe : `InviteUserModal`, aucun fichier code en commun).
> **Scope** : `apps/web` **exclusivement**. Les vues iOS ne servent que de référence de parité (couleurs/features naturelles Meeshy), jamais d'objet de revue.
> **Thème** : accessibilité clavier (WCAG 2.1.1 *Keyboard* / 4.1.2 *Name, Role, Value* / 2.4.7 *Focus Visible*) des **résultats de recherche du modal d'invitation d'utilisateurs** (`InviteUserModal`) — lignes cliquables `<div onClick>` souris-only, **doublées d'un `<Button>` mort** (sans `onClick`). Catégorie « **différé prioritaire 70w+** » du pointeur autoritaire (a11y clavier des `<div onClick>` non-`<button>` HORS `video-calls` / liste de conversations / `create-link-modal`, ce dernier en vol via 69w/#1084).

## Contexte
La routine a déjà soldé exhaustivement : anti-pattern i18n `t('key')||'fallback'`, aria-labels de contenu, focus-traps modales, `prefers-reduced-motion` global (MotionProvider #862), consolidation tokens dark-mode, épuration code mort, lazy-load images, **a11y clavier liste de conversations + tuile audio (67w / #1078)**, **contrôles plein écran d'appel vidéo (68w / #1082)**, tous mergés sur `main` ; et **modal de création de lien (69w / #1084, en vol)**.

Le différé prioritaire visait l'audit transverse des `<div onClick>` / `role="button"` sans `onKeyDown` / `focus-visible`. `invite-user-modal.tsx` (nommé explicitement dans le § différé de 69w, hors cluster liste de conversations) présente un cas **doublement défectueux** : la ligne de résultat est souris-only **et** le bouton « Ajouter » visible est inerte.

## Constats vérifiés (file:line) et corrections

| # | Fichier | Problème | Correction |
|---|---------|----------|-----------|
| 1 | `components/conversations/invite-user-modal.tsx:212-216` | Chaque ligne de résultat de recherche = `<div onClick={() => addUserToSelection(user)}>` **souris-only** : pas de `role`, `tabIndex`, `onKeyDown`, ni nom accessible. Sélectionner un utilisateur à inviter est **impossible au clavier et au lecteur d'écran**. | La ligne entière devient un **`<button type="button">` natif** (activation Enter/Espace **native**, focusable, `disabled` propre). `aria-label={\`${actionLabel} ${displayName}\`}` → nom accessible déterministe et unique par ligne. Anneau `focus-visible:ring-ring`. Clic souris **inchangé** (toute la ligne reste cliquable). |
| 2 | `components/conversations/invite-user-modal.tsx:231-238` | **Bug latent** : le `<Button>` « Ajouter / Sélectionné » **n'a aucun `onClick`** — il ne « marchait » que par **bpropagation** du clic vers le `<div>` parent. Un utilisateur clavier qui tabule dessus et presse Entrée n'obtient **rien** ; un bouton imbriqué dans un futur `role="button"` aurait aussi été une violation de contenu interactif imbriqué. | Le bouton mort est remplacé par une **pastille `<span aria-hidden>` purement décorative** (icône `UserPlus` + libellé). L'unique contrôle interactif de la ligne est désormais le `<button>` racine (constat #1) — **0 contrôle imbriqué, 0 contrôle inerte**. État `disabled` + opacité quand déjà sélectionné. |

> **Pourquoi ce cluster est cohérent** : les 2 constats sont le **même contrôle** (la ligne de résultat) vu sous deux angles — l'enveloppe souris-only et le faux bouton qu'elle contenait. Les corriger ensemble produit **un seul élément interactif accessible** par ligne (principe d'épuration : pas de surcharge, un contrôle = une action). **Aucune nouvelle clé i18n** : `inviteModal.add` / `inviteModal.selected` existaient déjà (×4 locales) et servent de libellé + nom accessible.

## Tests
- **MIS À JOUR** `__tests__/components/conversations/invite-user-modal.test.tsx` — +2 cas (bloc `Search Result Accessibility (keyboard)`) : (a) chaque ligne est exposée comme **`<button>` natif** focusable au nom accessible `Ajouter {nom}` (régression-guard anti-`<div>`) ; (b) après sélection, la ligne devient `disabled` avec le nom `Sélectionné {nom}`. Les **25 cas existants** (recherche, sélection via clic de ligne, invitation, erreurs, annulation) restent verts — la parité souris est préservée (`cursor-pointer` conservé, sélecteur `.closest('[class*="cursor-pointer"]')` des tests inchangé).
- **Résultat** : `jest invite-user-modal` → **1 suite / 27 tests passed**.

## Hors-scope confirmé / différé
- Reste de l'audit a11y clavier (à traiter 71w+, **bornés/orthogonaux**, vérifier PR en vol) : `admin/agent/AgentConfigDialog.tsx` + `AgentGlobalConfigTab.tsx` (toggles `Badge`), `audio/AudioEffectsTimeline.tsx` (seek clavier — sémantique slider, lot dédié), `details-sidebar/*` (`DetailsHeader` / `CustomizationManager` / `DescriptionSection` — édition au clic). ⚠️ `create-link-modal/*` est traité par 69w/#1084 — **NE PAS y toucher**.
- Backdrops/dismiss (`UserConversationsSection.tsx`, `MarkdownLightbox.tsx`, `MediaVideoCard.tsx`) : `onClick={onClose}` doublé d'un bouton de fermeture visible + Escape → **basse priorité**, pas un gap clavier bloquant.
- ESLint local KO (mismatch version d'env, artefact, non bloquant — le gate `Quality (bun)` CI épingle le linter). `@meeshy/shared/dist` non build localement = pré-existant, identique sur `main`.
- `Test shared` rouge sur `main` = régression migration zod v4 (hors-scope web, propriétaire shared ; cf. branch-tracking).

---

## ✅ ANALYSE CORRIGÉE & COMPLÈTE (70wb — 2026-06-30)
Les 2 constats sont **corrigés et testés** (en attente merge `main`). **NE PLUS re-flagger** :
- `invite-user-modal.tsx` lignes de résultat de recherche — clavier/`role`/nom accessible (soldé) ;
- `invite-user-modal.tsx` `<Button>` « Ajouter » inerte sans `onClick` (bug latent soldé : remplacé par pastille décorative, l'action vit sur la ligne-`<button>`).
Catégorie « **a11y clavier des `<div onClick>` non-`<button>`** » : `invite-user-modal` **épuisé**. Reste à balayer (cf. § Hors-scope/différé) pour 71w+.
