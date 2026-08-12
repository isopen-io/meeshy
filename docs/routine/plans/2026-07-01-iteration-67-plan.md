# Iteration 67 — Plan d'implémentation (2026-07-01)

## Objectif
Sous-lot **F30-c** : converger les 2 sites de copie d'identifiant de groupe (doublon desktop/responsive)
vers la source unique `copyToClipboard`, gagnant les fallbacks iOS/WebView.

## Étapes (délégation → vérification)

### Phase A — Conversion des 2 sites
- [x] `components/groups/groups-layout.tsx` : `copyIdentifier` → `copyToClipboard(displayIdentifier)` ;
      `if (success) { setCopiedIdentifier + toast succès + reset 2 s } else { toast erreur }` ; try/catch retiré.
- [x] `components/groups/groups-layout-responsive.tsx` : idem (variante responsive).

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` : multiset d'erreurs **identique** à la baseline `main` (0 régression).
- [x] `jest __tests__/components/groups` → **GroupCard 7/7 vert** (composant distinct, non impacté).
- [ ] Commit + push `claude/sharp-wozniak-0fc6ol` (force-with-lease, history iter 66 déjà mergée) ;
      PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter 68 : protocole renforcé v2, puis F30 (reste ~10 sites) — cluster suivant candidat : « header/conversation »
(`Header`, `use-header-actions`, `ConversationItem`) ou « admin links » (`admin/share-links`,
`admin/tracking-links`, `tracking-links.ts`). Ou F31 (dédup `truncateText`).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 2 sites convertis.
- [x] Phase B — tsc 0 régression + GroupCard 7/7 ; reste : push + PR + CI + merge.
