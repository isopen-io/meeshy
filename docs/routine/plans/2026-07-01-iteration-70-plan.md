# Iteration 70 — Plan d'implémentation (2026-07-01)

## Objectif
**Corriger la régression build sur `main`** : doublon `import { copyToClipboard }` (`TS2300`) cumulé par un
merge parallèle sur les 2 fichiers du lot F30-d (iter 68). Consolider les docs iter-68 concaténés.

## Étapes

### Phase A — Correction de la régression
- [x] `components/conversations/header/use-header-actions.ts` : suppression du **2e** import `copyToClipboard`
      (L6), garde le 1er (L3).
- [x] `components/conversations/conversation-item/ConversationItem.tsx` : suppression du **2e** import (L13),
      garde le 1er (L8).

### Phase B — Consolidation docs iter-68 (concaténés par le merge parallèle)
- [x] `docs/routine/analyses/2026-07-01-iteration-68-analyse.md` : réécrit en un récit cohérent.
- [x] `docs/routine/plans/2026-07-01-iteration-68-plan.md` : idem.

### Phase C — Vérification & livraison
- [x] `tsc --noEmit` : **909 → 905**, diff = 4 `TS2300` retirées, 0 ajoutée (retour baseline propre).
- [x] `jest` header + conversation-item : **27/27** verts.
- [x] Recensement : aucun autre doublon `copyToClipboard` sur l'app.
- [ ] Commit + push `claude/sharp-wozniak-0fc6ol` (force-with-lease) ; PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter suivante : protocole v3 (détecter doublons d'import post-merge AVANT de choisir un lot), puis F30 sur
un cluster **exotique** peu ciblé par les autres agents (ex. `use-message-interactions`, `share-affiliate-modal`)
ou F31 (dédup `truncateText`). Éviter les fichiers « chauds » (conversation header, feed) fortement disputés.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 2 doublons d'import supprimés.
- [x] Phase B — docs iter-68 consolidés.
- [x] Phase C — tsc 909→905 + 27/27 ; reste : push + PR + CI + merge.
**Clôturer F30** : converger les **13 derniers sites** `navigator.clipboard.writeText` bruts vers la source
unique `copyToClipboard` (`apps/web/lib/clipboard.ts`), gagnant les fallbacks iOS/WebView/contexte non
sécurisé. Comportement nominal préservé, CI garantie verte (vérifiée localement, jest + tsc).

## Phases

### Phase 1 — Sites à fonction locale `copyToClipboard` (collision → alias)
- [ ] `components/settings/TwoFactorSettings.tsx` : import `copyToClipboard as copyTextToClipboard` ;
      corps local → `const { success } = await copyTextToClipboard(text); if (success) toast.success(...)`.
- [ ] `components/affiliate/share-affiliate-modal.tsx` : idem, conserver toast succès + toast erreur.
- [ ] `app/admin/tracking-links/page.tsx` : idem, rendre le wrapper `async`.
- [ ] `app/admin/share-links/page.tsx` : idem, rendre le wrapper `async`.

### Phase 2 — Service
- [ ] `services/tracking-links.ts` : `copyTrackingLinkToClipboard` →
      `const { success } = await copyToClipboard(shortUrl); return success;` (signature `Promise<boolean>`
      inchangée ; le log d'erreur interne de la source unique remplace le try/catch local).

### Phase 3 — `share-utils.ts` + test
- [ ] `lib/share-utils.ts` : fallback de `shareLink` → `await copyToClipboard(url)` (retour `false` conservé).
- [ ] `share-utils.test.ts` : `jest.mock('@/lib/clipboard')` ; assertion `mockWriteText` → `copyToClipboard`.

### Phase 4 — Header (5 sites) + test
- [ ] `components/layout/Header.tsx` : les 5 branches `else` → `void copyToClipboard(...)` (import ajouté).
- [ ] `Header.test.tsx` : mock `@/lib/clipboard` ; assertions `mockClipboardWriteText` → `copyToClipboard`.

### Phase 5 — use-message-interactions (2 sites) + test
- [ ] `hooks/use-message-interactions.ts` : `handleCopyMessage` + `handleCopyMessageLink` →
      `const { success } = await copyToClipboard(...)`; toast succès/erreur selon `success`.
- [ ] `BubbleMessageNormalView.test.tsx` : mock `@/lib/clipboard` ; 2 assertions `writeText` → `copyToClipboard`.

### Phase 6 — Vérification & livraison
- [ ] `tsc --noEmit` apps/web : **1198 = 1198** (0 régression).
- [ ] jest sur les 6 suites impactées (clipboard, Header, share-utils, TwoFactorSettings,
      BubbleMessageNormalView) : tous verts, comptes ≥ baseline.
- [ ] Commit + push sur `claude/sharp-wozniak-59kjx0`.
- [ ] PR + merge dans `main` (CI verte). Conflits → reset sur `main`, ré-analyse, republication.

## Critère de succès
`grep -rn navigator.clipboard.writeText apps/web --include=*.ts --include=*.tsx` (hors tests / lib/clipboard.ts)
= **0 site**. F30 clos. Continuité iter 71 : cibles N1/N2/N3 (dédup admin) ou F32 (si Prisma redevient dispo).
Éliminer la **race condition** de validation de disponibilité dans le flux d'inscription
(`useFieldValidation`) en annulant les requêtes obsolètes via `AbortController` (API navigateur native).
Corrige aussi le `setState` post-démontage et supprime les requêtes zombies. Comportement nominal
préservé, CI garantie verte (cible apps/web vérifiable localement).

## Phases

### Phase 1 — `AbortController` sur `checkAvailability` ✅
- [x] `abortRef = useRef<AbortController | null>(null)`
- [x] `checkAvailability` : annuler la précédente (`abortRef.current?.abort()`), créer un controller,
      passer `{ signal }` au `fetch`
- [x] Gardes `if (controller.signal.aborted) return;` après `fetch` et après `json()`

### Phase 2 — Ne pas dégrader l'état sur annulation ✅
- [x] `catch` : `if ((error as Error)?.name === 'AbortError') return;` avant `setStatus('invalid')`

### Phase 3 — Cleanup de l'effet ✅
- [x] Cleanup `[value, disabled, …]` : `abortRef.current?.abort()` (changement de valeur / démontage)

### Phase 4 — Tests & vérification ✅
- [x] Nouveau `__tests__/hooks/use-field-validation.test.ts` (3 tests : annulation au changement de
      valeur, non-écrasement par réponse obsolète, annulation au démontage)
- [x] `jest` : 3/3 verts (RED garantie contre l'ancien code — le test « réponse obsolète » exige la garde)
- [x] `tsc --noEmit` : 1198 = 1198 (0 régression)

### Phase 5 — Livraison ✅
- [x] Commit + push sur `claude/sharp-wozniak-auwriu`
- [ ] PR + merge dans `main` (CI verte)

## Backlog reporté
- **F2** : flip `SOCKET_LANG_FILTER` (~75 % bande passante multilingue) — décision staging/produit, gateway.
- **F33** : `usePrefetch` prefetch `fetch` sans `AbortController` (best-effort, faible priorité).
- **F34** : `useContactsFiltering` (`@deprecated`) — migrer vers `useContactsV2` puis supprimer.
- **F32** : SSOT ObjectId gateway (~25 sites) — non vérifiable local (Prisma).

## Résultat
Validation d'inscription débarrassée de sa race condition (aucune réponse périmée n'écrase l'état
courant), sans `setState` post-démontage, sans requêtes zombies. Continuité assurée pour l'itération 71
(candidats : F33/F34 web vérifiables, ou F2/F32 gateway si l'environnement Prisma redevient disponible).
