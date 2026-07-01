# Iteration 60 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique — prédicat d'expiration (F28b) » : ajouter `isExpired` à
`apps/web/utils/time-remaining.ts` et converger les 7 réimplémentations du prédicat
« est-ce expiré ? » (6 fichiers), sans changer le comportement.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Baseline : `UserDetailSections.test.tsx` + `conversation-links-section.test.tsx` verts.
- [x] Vérifié site par site : tous gardent `null` → `false` → `isExpired` strictement équivalent.

## Étapes (délégation → vérification)

### Phase A — Source unique
- [x] `utils/time-remaining.ts` : `isExpired(expiresAt: string|number|Date|null|undefined, nowMs = Date.now())`
      → `expiresAt != null && new Date(expiresAt).getTime() < nowMs`. Pure, `nowMs` injectable.
- [x] Test `__tests__/utils/time-remaining.test.ts` : +5 cas `isExpired`.

### Phase B — Convergence des 7 sites (6 fichiers)
- [x] `UserActivitySection.tsx` : supprime la fn locale `isExpired`, importe la canonique (3 call sites inchangés).
- [x] `app/admin/share-links/page.tsx` : supprime la fn locale `isExpired`, importe la canonique.
- [x] `conversation-links-section.tsx` : `isLinkExpired(link) = isExpired(link.expiresAt)` (wrapper conservé).
- [x] `share-affiliate-modal.tsx` : inline → `isExpired(token.expiresAt)`.
- [x] `app/chat/[id]/page.tsx` : inline → `isExpired(data.link.expiresAt)`.
- [x] `app/links/page.tsx` : 2× inline → `isExpired(link.expiresAt)`.

### Phase C — Vérification & livraison
- [x] `jest time-remaining + UserDetailSections + conversation-links-section` → **250/250**.
- [x] `tsc --noEmit` : aucune nouvelle erreur sur les 6 fichiers touchés (erreurs `_TrendingUp` /
      `unknown` d'`app/links/page.tsx` pré-existantes sur `main`).
- [ ] Commit + push `claude/sharp-wozniak-9e5y85` ; PR vers `main` ; CI verte ; **merge**.

## Hors périmètre (consigné dans l'analyse)
- `DeliveryQueueItemCard.formatCountdown` (seconde), F26c-c(c), F25b, F2, F10, F21.

## Continuité
Iter 61 : nouveau scout. Pistes : `formatCountdown` seconde (si 2ᵉ site), slug/url, sanitize,
validateurs téléphone (F25b).

## Incidents de merge (parallélisme multi-agents)
- Re-vérifier `origin/main` juste avant le merge ; le code de cette piste (`utils/time-remaining.ts`
  + 6 fichiers links/expiry) est disjoint des tracks initiales/iOS → seul le slot de docs iter-60
  pourrait collisionner → renuméroter si pris.

## Statut (mis à jour en fin d'itération)
- [x] Phase A / B — util `isExpired` + 7 convergences ; sémantique préservée.
- [x] Phase C — tests + tsc verts ; reste : commit + push + PR + CI + merge.
