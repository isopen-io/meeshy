# Plan de correction — Itération 70wb (Web)

> **Note de collision** : `70w` pris en parallèle par l'itération `PhoneResetFlow.tsx` (mergée #1088). Celle-ci, orthogonale, est renommée **70wb**. Référence d'analyse : `docs/analyses/uiux/2026-06-30-iteration-70wb.md`.
> **Objectif** : accessibilité du modal d'invitation d'utilisateurs (`InviteUserModal`) — supprimer l'anti-pattern *nested-interactive*, rendre la sélection opérable au clavier et nommer les contrôles pour les lecteurs d'écran. **Aucune surcharge ajoutée** : on retire au contraire un contrôle souris-only redondant (logique épurée).

## Étapes

1. **Résultats de recherche** (`invite-user-modal.tsx:212-239`)
   - Retirer `onClick`/`cursor-pointer`/`hover:bg-accent/50` du `<div>` enveloppant → ligne présentationnelle.
   - Porter `onClick={() => addUserToSelection(user)}` sur le `<Button>` « Ajouter » existant (devient le contrôle réel, clavier natif).
   - `aria-label` dynamique : `addUserAria` (actionnable) / `selectedUserAria` (disabled), interpolés avec `{name}`.
   - Factoriser `userName` + `isSelected` dans le callback `map`.

2. **Badge sélectionné** (`invite-user-modal.tsx:186-194`)
   - `aria-label={t('inviteModal.removeUserAria', {name})}` sur le bouton de retrait icône-seul.
   - Factoriser `userName` dans le callback `map`.

3. **i18n** — ajouter `addUserAria`, `selectedUserAria`, `removeUserAria` sous `conversations.inviteModal` en **en/fr/es/pt** (interpolation `{name}`).

4. **Tests** (`__tests__/.../invite-user-modal.test.tsx`)
   - Migrer les 11 interactions clic-ligne vers `getByRole('button', { name: 'Ajouter John Doe' })`.
   - Relayer `aria-label` dans le mock `Button`, ajouter les 3 clés au mock `t`.
   - Ajouter `describe('Accessibility')` (3 cas : nom distinctif par utilisateur, état disabled nommé, bouton de retrait nommé).

## Critères d'acceptation
- [x] `jest invite-user-modal.test.tsx` vert (28/28).
- [x] Aucune nouvelle clé i18n orpheline ; parité en/fr/es/pt.
- [x] Aucun changement de l'API publique du composant (mêmes props) → `conversation-participants-drawer.tsx` inchangé.
- [x] `tsc` isolé du fichier modifié sans erreur.
- [ ] CI verte (`Quality (bun)` + suite jest du fichier) puis merge `main`.

## État
✅ **Implémenté & testé en local (28/28).** En attente CI + merge `main` (cf. `branch-tracking.md`).
