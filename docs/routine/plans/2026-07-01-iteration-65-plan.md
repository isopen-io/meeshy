# Iteration 65 — Plan d'implémentation (2026-07-01)

## Objectif
Sous-lot **F30-a** : converger 4 composants de copie vers la source unique `copyToClipboard`
(`lib/clipboard.ts`), gagnant les fallbacks iOS/WebView, et mettre à jour les 3 tests couplés.

## Étapes (RED→GREEN, délégation → vérification)

### Phase A — Conversion des composants
- [x] `components/text/TextViewer.tsx` : import `copyToClipboard` ; `handleCopy` →
      `const { success } = await copyToClipboard(content)` ; `success` → `setIsCopied(true)` + toast succès ;
      sinon toast erreur.
- [x] `components/text/TextLightbox.tsx` : idem (jumeau).
- [x] `components/attachments/AttachmentContextMenu.tsx` : `handleCopyLink` → `copyToClipboard(attachment.fileUrl)`.
- [x] `components/admin/agent/AgentConfigDialog.tsx` : onClick ID → handler async `copyToClipboard(convMeta.id)` +
      toast succès conditionnel.

### Phase B — Mise à jour des tests couplés (jsdom `isSecureContext` falsy)
- [x] `TextViewer.test.tsx` : `jest.mock('@/lib/clipboard')` ; assertions `writeText` → `copyToClipboard`.
- [x] `TextLightbox.test.tsx` : idem.
- [x] `AgentConfigDialog.test.tsx` : mock `@/lib/clipboard` ; assertion `writeText` → `copyToClipboard`.

### Phase C — Vérification & livraison
- [x] `jest` sur les 3 suites + `lib/clipboard.test.ts` → **223/223 vert**.
- [x] `tsc --noEmit` : **0 nouvelle erreur** (diff before/after identique à 905 erreurs pré-existantes ;
      les 2 erreurs `AttachmentContextMenu` 144/149→145/150 ne font que décaler d'1 ligne à cause de l'import).
- [ ] Commit + push `claude/sharp-wozniak-0fc6ol` ; PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter 66 : re-exécuter le protocole renforcé v2, puis poursuivre F30 (reste ~18 sites : Header, feeds,
groups, use-header-actions, use-message-interactions) par sous-lots, ou F31 (dédup `truncateText`).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 4 composants convertis.
- [x] Phase B — 3 tests mis à jour.
- [x] Phase C — tests **223/223** + tsc **0 régression** ; reste : push + PR + CI + merge.
