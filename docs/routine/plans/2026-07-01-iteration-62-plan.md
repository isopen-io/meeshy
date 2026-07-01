# Iteration 62 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique — troncature de texte (F31) » : extraire `truncateFilename` et `truncateText`
(deux paires byte-identiques) dans `apps/web/utils/truncate.ts` et converger les 4 sites, sans
changer le comportement.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Paires vérifiées byte-identiques (`MarkdownViewer`/`PDFViewerWrapper` ;
      `MediaAudioCard`/`MediaVideoCard`).
- [x] Baseline : `MarkdownViewer.test.tsx` + `PDFViewerWrapper.test.tsx` verts.

## Étapes (délégation → vérification)

### Phase A — Source unique
- [x] `utils/truncate.ts` : `truncateFilename(filename, maxLength=32)` + `truncateText(text, maxLength)`
      (implémentations copiées à l'identique).
- [x] Test `__tests__/utils/truncate.test.ts` (6 cas).

### Phase B — Convergence des 4 sites
- [x] `v2/MediaAudioCard.tsx` : supprime la fn locale `truncateText`, importe le canonique.
- [x] `v2/MediaVideoCard.tsx` : idem.
- [x] `markdown/MarkdownViewer.tsx` : supprime le `const truncateFilename`, importe le canonique.
- [x] `pdf/PDFViewerWrapper.tsx` : idem.

### Phase C — Vérification & livraison
- [x] `jest truncate` **6/6** ; `MarkdownViewer` + `PDFViewerWrapper` **62/62**.
- [x] `tsc --noEmit` : aucune nouvelle erreur (erreur `code({…}: unknown)` de `MarkdownViewer`
      pré-existante sur `main`).
- [ ] Commit + push `claude/sharp-wozniak-9e5y85` ; PR vers `main` ; CI verte ; **merge**.

## Hors périmètre (consigné dans l'analyse)
- `truncateLinkName`, `truncateText`/`ConversationDropdown`, `truncateAtWord` (sémantiques distinctes).
- F30 (presse-papier), F25b, F2, F10, F21.

## Continuité
Iter 63 : **F30** — converger les ~17 sites `navigator.clipboard.writeText` sur le canonique
`lib/clipboard::copyToClipboard` (robustesse iOS/fallback), lot nuancé site par site (préserver les
toasts propres) — potentiellement en sous-lots. Sinon slug/url, sanitize, validateurs (F25b).

## Incidents de merge (parallélisme multi-agents)
- Re-vérifier `origin/main` juste avant le merge ; le code (`utils/truncate.ts` + 4 fichiers) est
  disjoint des tracks initiales/iOS → seul le slot de docs iter-62 pourrait collisionner → renuméroter.

## Statut (mis à jour en fin d'itération)
- [x] Phase A / B — util `truncate` + 4 convergences ; comportement préservé.
- [x] Phase C — tests + tsc verts ; reste : commit + push + PR + CI + merge.
