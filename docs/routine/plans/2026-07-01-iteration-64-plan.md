# Iteration 64 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Restauration de `isExpired` (F28b-restore) » : restaurer le travail d'iter 60 (prédicat
d'expiration unifié) **silencieusement reverté** par le merge parallèle `9a431658`, détecté par le
protocole renforcé au démarrage d'iter 64.

## Étapes (délégation → vérification)

### Phase A — Restauration de la source unique
- [x] `git checkout 7f727821 -- apps/web/utils/time-remaining.ts apps/web/__tests__/utils/time-remaining.test.ts`
      (réintroduit `isExpired` + ses tests ; `formatTimeRemaining` inchangé).

### Phase B — Re-convergence des 6 sites (identique à iter 60)
- [x] `UserActivitySection.tsx` : supprime la fn locale `isExpired`, importe la canonique.
- [x] `app/admin/share-links/page.tsx` : idem.
- [x] `conversation-links-section.tsx` : `isLinkExpired(link) = isExpired(link.expiresAt)`.
- [x] `share-affiliate-modal.tsx` : inline → `isExpired(token.expiresAt)`.
- [x] `app/chat/[id]/page.tsx` : inline → `isExpired(data.link.expiresAt)`.
- [x] `app/links/page.tsx` : 2× inline → `isExpired(link.expiresAt)`.

### Phase C — Vérification & livraison
- [x] `jest time-remaining + UserDetailSections + conversation-links-section` → **250/250**.
- [x] `tsc --noEmit` : aucune erreur sur les 6 fichiers (erreurs `tracking-links`/`_TrendingUp`
      pré-existantes sur `main`).
- [ ] Commit + push `claude/sharp-wozniak-9e5y85` ; PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter 65 : au démarrage, re-exécuter le protocole renforcé ÉLARGI (tous exports + consommateurs).
Puis F30 (copyToClipboard, sous-lots), ou slug/url, sanitize, F25b.

## Protocole renforcé v2 (leçon iter 64)
La vérification de démarrage doit couvrir **chaque export** des sources uniques récentes ET leurs
consommateurs (grep import), pas seulement l'existence du fichier canonique : un merge périmé peut
retirer un export (ex. `isExpired`) en laissant le fichier (car un autre export plus ancien y demeure).

## Statut (mis à jour en fin d'itération)
- [x] Phase A / B — canonical `isExpired` + 6 re-convergences restaurés.
- [x] Phase C — tests + tsc verts ; reste : commit + push + PR + CI + merge.
