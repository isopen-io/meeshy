# Iteration 53 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique du nom d'affichage (username-first → canonique) — F26b-c » : converger G6
(`create-conversation-modal`) et G7 (`MemberSelectionStep`) vers le canonique
`utils/user-display-name` par délégation (fallback `'Unknown User'` préservé), corrigeant l'ordre
username-first qui masquait le vrai nom.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Baseline : `create-conversation-modal.test.tsx` vert (users mockés ont un `displayName`).

## Étapes (délégation → vérification)

### Phase A — Converger G6/G7
- [ ] `components/conversations/steps/MemberSelectionStep.tsx` : importer
      `getUserDisplayName as resolveDisplayName` ; corps de la fonction module →
      `return resolveDisplayName(user, 'Unknown User');`.
- [ ] `components/conversations/create-conversation-modal.tsx` : importer le canonique ; corps de la
      closure `getUserDisplayName` (dans `useEffect`) → `return resolveDisplayName(user, 'Unknown User');`.

### Phase B — Vérification & livraison
- [ ] `jest __tests__/components/conversations/create-conversation-modal.test.tsx` → vert.
- [ ] `tsc --noEmit` web : aucune nouvelle erreur sur les 2 fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-kekt10` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
- F26b-b (G5 `utils/user.ts` name-first), F26c-d (initiale G7), F26c-c, F25b, F2, F10, F21.

## Continuité
Iter 54 : **F26b-b** (G5 `utils/user.ts` name-first → canonique + réécriture `utils/user.test.ts`,
flip d'ordre displayName vs firstName+lastName — décision produit assumée pour clore le cluster
`getUserDisplayName`) ; sinon F26c-c (widgets) ou nouveau scout (slug/url, sanitize, date-relative).

## Incidents de merge (parallélisme multi-agents)
- Si un commit parallèle réintroduit une résolution username-first locale, restaurer la délégation au
  canonique `utils/user-display-name`.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — G6 (`create-conversation-modal`) et G7 (`MemberSelectionStep`) convergés par
      délégation au canonique (`resolveDisplayName(user, 'Unknown User')`) ; ordre username-first
      corrigé, plus de réimplémentation locale.
- [x] Phase B — jest `create-conversation-modal.test.tsx` **26/26** + `ConversationLayout.test.tsx`
      **16/16** ; `tsc --noEmit` web : **aucune** erreur sur les 2 fichiers touchés ; commit + push +
      PR + CI + merge.
