# Iteration 66 — Plan d'implémentation (2026-07-01)

## Objectif
Sous-lot **F30-b** : converger les 4 sites de partage feed/reel vers la source unique `copyToClipboard`
(`lib/clipboard.ts`), gagnant les fallbacks iOS/WebView, sans changement de comportement nominal.

## Étapes (délégation → vérification)

### Phase A — Conversion des 4 sites
- [x] `components/feed/PostsFeedScreen.tsx` : `handleShare` → `copyToClipboard(url)` ; `if (success)` →
      `mutate + toast succès`, sinon toast erreur. Try/catch retiré (util ne jette pas).
- [x] `components/feed/ReelsFeedScreen.tsx` : `onShare` → idem.
- [x] `app/reel/[postId]/page.tsx` : `onShare` → idem.
- [x] `app/feeds/post/[postId]/page.tsx` : `handleShare` → idem (branche else silencieuse préservée).

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` : multiset d'erreurs **identique** à la baseline (0 régression ; 905=905, seuls
      décalages de ligne dus à l'import).
- [x] Aucune suite de test ne rend ces 4 composants (0 couverture feed/reel) → pas de test à mettre à jour.
- [ ] Commit + push `claude/sharp-wozniak-0fc6ol` ; PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter 67 : protocole renforcé v2, puis F30 (reste ~12 sites) — cluster suivant candidat : « partage groupe »
(`groups-layout` + `groups-layout-responsive`) ou « header/conversation » (`Header`, `use-header-actions`,
`ConversationItem`). Ou F31 (dédup `truncateText`).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 4 sites convertis.
- [x] Phase B — tsc 0 régression, 0 couverture à mettre à jour ; reste : push + PR + CI + merge.
