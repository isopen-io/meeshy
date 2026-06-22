# Plan — Itération 58w (web)

## Base
- Repartir de `main` HEAD `657e588` (post-merge #780 iter-57wb).
- Branche de travail : `claude/practical-fermat-ihammv`.

## Contexte — pivot après collision
Le candidat 58w initial (i18n `ReelsFeedScreen.tsx`) a été livré **en parallèle**
par un autre agent (#780, iter-57wb, mergé `657e588`). La PR doublon #783 a été
fermée sans merge (CI verte) — convention #770→#771. Le run repivote sur un
périmètre **non revendiqué** : le différé borné 56wb « gestes/a11y modales
hand-rolled ».

## Objectif
Passe **a11y + gestes de dismiss standard** sur les 2 dialogues maison du
design-system, sans dépendance ni focus-trap (différé 59w+) :
- `components/v2/ConversationDrawer.tsx` (user-facing)
- `components/admin/agent/AgentTopicEditModal.tsx` (admin)

## Étapes
1. [x] `ConversationDrawer` : `useEffect` Escape→`onClose` (actif `isOpen`) +
   `role="dialog"`/`aria-modal`/`aria-labelledby` (id sur `<h2>`).
2. [x] `AgentTopicEditModal` : `useEffect` Escape→`onClose` **gardé `!saving`** +
   `role/aria-modal/aria-labelledby` (id sur `<h3>`) + `aria-label` close.
3. [x] `agent.topicEditModal.close` ×4 locales (Close/Fermer/Cerrar/Fechar).
4. [x] Vérif parité clés admin ×4 + JSON valide + diff minimal.
5. [x] Annoter analyse + `branch-tracking.md` (collision #783 + 56wb soldé).
6. [ ] Commit + push + PR ; merge dans `main` après CI vert ; supprimer la branche.

## Contraintes / décisions
- **Pas de backdrop-dismiss** sur le modal de formulaire admin (perte de saisie
  accidentelle) — Échap réversible suffit.
- Focus-trap complet **hors périmètre** (invasif) → 59w+.
- Aucune dépendance ajoutée ; pattern identique sur les 2 modales.
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (59w+)
`PostsFeedScreen.tsx` (~30, **large** — seul gros reliquat feed), focus-trap
dialogues, `Badge` off-palette (arbitrage tokens), `app/settings/loading.tsx`
(server component i18n), console.error FR, `next-themes` orphelin.
