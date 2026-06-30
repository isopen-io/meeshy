# Analyse UI/UX — Itération 70wb (Web)

> **Note de collision** : le numéro `70w` a été pris en parallèle par une autre itération web (`PhoneResetFlow.tsx` i18n, branche `claude/practical-fermat-w9pjo3`, mergée #1088). Cette itération — distincte et orthogonale — est renommée **70wb** (convention `wb` déjà utilisée 56wb/57wb/60wb…). Aucun chevauchement de fichiers avec 70w (`PhoneResetFlow.tsx`).

> **Scope** : `apps/web` **exclusivement**. Les vues iOS ne servent que de référence de parité (couleurs/features naturelles Meeshy), jamais d'objet de revue.
> **Thème** : accessibilité clavier + nom accessible (WCAG 2.1.1 *Keyboard* / 4.1.2 *Name, Role, Value* / 2.4.6 *Headings & Labels*) du **modal d'invitation d'utilisateurs** (`InviteUserModal`) — lignes de résultats de recherche `<div onClick>` souris-only enveloppant un `<Button>` imbriqué non-fonctionnel + bouton de retrait icône-seul sans nom accessible. Catégorie « **différé prioritaire 70w+** » nommée explicitement par le § Hors-scope de 69w (`invite-user-modal.tsx` — résultats de recherche).

## Contexte
La routine a déjà soldé exhaustivement : anti-pattern i18n `t('key')||'fallback'`, aria-labels de contenu, focus-traps modales, `prefers-reduced-motion` global (MotionProvider #862), consolidation tokens dark-mode, épuration code mort, lazy-load images, et la vague **a11y clavier des `<div onClick>` non-`<button>`** : liste de conversations + tuile audio (67w / #1078), contrôles plein écran appel vidéo (68w / #1082), modal de création de lien (69w / #1084) — tous mergés sur `main`.

Le § Hors-scope de 69w listait les candidats restants **bornés/orthogonaux** pour 70w+ ; `invite-user-modal.tsx` (résultats de recherche) en faisait partie. Audit du fichier → **anti-pattern *nested-interactive*** confirmé, plus impactant qu'un simple `onKeyDown` manquant.

## Constats vérifiés (file:line) et corrections

| # | Fichier | Problème | Correction |
|---|---------|----------|-----------|
| 1 | `components/conversations/invite-user-modal.tsx:212-239` (résultats de recherche) | Chaque ligne est un `<div onClick={() => addUserToSelection(user)}>` **souris-only** (`cursor-pointer`, pas de `role`/`tabIndex`/`onKeyDown`/`focus-visible`) qui **enveloppe un `<Button>` « Ajouter » sans `onClick`** (action déléguée par *bubbling* du clic). Double défaut : (a) **nested-interactive** (un `<button>` focusable dans un `<div>` cliquable = HTML invalide, comportement clavier fragile) ; (b) les boutons « Ajouter » répétés n'ont **aucun nom accessible distinctif** (un lecteur d'écran entend « Ajouter », « Ajouter », « Ajouter » sans savoir quel utilisateur). | **Le `<Button>` explicite devient le contrôle réel** : `onClick={() => addUserToSelection(user)}` porté par le bouton natif (clavier Enter/Space natif, plus de bubbling fragile) ; le `<div>` redevient présentationnel (retrait de `onClick`/`cursor-pointer`/`hover:bg-accent/50`). `aria-label` descriptif `t('inviteModal.addUserAria', {name})` (« Ajouter {name} ») quand actionnable, `t('inviteModal.selectedUserAria', {name})` quand `disabled` (déjà sélectionné). |
| 2 | `components/conversations/invite-user-modal.tsx:186-194` (badge d'utilisateur sélectionné) | Bouton de retrait **icône-seul** (`<X/>`) sans nom accessible (`aria-label` absent, pas de texte) ⇒ un lecteur d'écran annonce « bouton » nu. | `aria-label={t('inviteModal.removeUserAria', {name})}` (« Retirer {name} »). |

> **Pourquoi ce cluster est cohérent** : les deux contrôles vivent dans le même flux (`InviteUserModal`), partagent l'action « (dé)sélectionner un utilisateur à inviter » et le même défaut de nom accessible/clavier. Le constat #1 est **plus impactant** qu'un simple `onKeyDown` ajouté au `<div>` : faire du `<div>` un `role="button"` aurait **conservé** le nesting invalide (button dans button). La solution *épurée* élimine le contrôle redondant et fait du bouton « Ajouter » visible le seul point d'action — plus simple, plus conventionnel, et la ligne entière n'est plus un piège souris-only.

## i18n
3 clés ajoutées sous `conversations.inviteModal` **×4 locales** (en/fr/es/pt) : `addUserAria`, `selectedUserAria`, `removeUserAria` (interpolation `{name}`). Aucune clé orpheline.

## Tests
- **MIS À JOUR** `__tests__/components/conversations/invite-user-modal.test.tsx` :
  - 11 interactions de sélection migrées du clic-ligne (`closest('[class*="cursor-pointer"]')`, **périmé** — la ligne n'est plus cliquable) vers le clic sur le bouton « Ajouter » ciblé par **rôle + nom accessible** (`getByRole('button', { name: 'Ajouter John Doe' })`) ;
  - mock `Button` étendu pour relayer `aria-label` (`{...rest}`), mock `t` étendu pour les 3 nouvelles clés.
- **NOUVEAU** `describe('Accessibility')` — 3 cas : (a) chaque bouton « Ajouter » expose un **nom accessible distinctif par utilisateur** (Ajouter John Doe / Ajouter Jane Smith) et est `enabled` ; (b) une fois choisi, le bouton devient `disabled` avec le nom « John Doe déjà sélectionné » ; (c) le bouton de retrait du badge porte le nom « Retirer John Doe » et le retrait décrémente la sélection.
- **Résultat** : `jest` ciblé → **1 suite / 28 tests passed** (25 existants migrés + 3 a11y neufs). `tsc` isolé sur le fichier modifié : 0 erreur (attributs JSX/aria standards).

## Hors-scope confirmé / différé (pour 71w+)
- Reste de l'audit « `<div onClick>` non-`<button>` » (bornés/orthogonaux) : `admin/agent/AgentConfigDialog.tsx` + `AgentGlobalConfigTab.tsx` (toggles `Badge`), `audio/AudioEffectsTimeline.tsx` (seek clavier d'une timeline — non trivial, mérite une itération dédiée), `details-sidebar/*` (DetailsHeader/CustomizationManager/DescriptionSection — édition au clic).
- Backdrops/dismiss (`UserConversationsSection.tsx`, `MarkdownLightbox.tsx`, `MediaVideoCard.tsx`) : `onClick={onClose}` doublé d'un bouton de fermeture visible + Escape → **basse priorité**, pas un gap clavier bloquant.
- `Test shared` rouge sur `main` = régression migration zod v4 (hors-scope web, propriétaire shared ; cf. branch-tracking).
- ESLint/typecheck global local KO = artefact d'environnement (`@meeshy/shared/dist` non build, mismatch ESLint) — pré-existant, identique sur `main`, non imputable au diff. Gate fiable = suite jest du fichier + `Quality (bun)` CI.

---

## ✅ ANALYSE CORRIGÉE & COMPLÈTE (70wb — 2026-06-30)
Les 2 constats sont **corrigés et testés** (en attente merge `main`). **NE PLUS re-flagger** :
- `invite-user-modal.tsx` lignes de résultats de recherche — *nested-interactive* / clavier / nom accessible (soldé : le bouton « Ajouter » est désormais le contrôle réel, nommé par utilisateur) ;
- `invite-user-modal.tsx` bouton de retrait du badge sélectionné — nom accessible (soldé).
Catégorie « **a11y clavier/nom accessible des `<div onClick>` non-`<button>`** » : cluster `InviteUserModal` **épuisé**. Reste à balayer (cf. § Hors-scope/différé ci-dessus) pour 71w+.
