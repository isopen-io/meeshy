# Iteration 70 — Plan d'implémentation (2026-07-01)

## Objectif
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
