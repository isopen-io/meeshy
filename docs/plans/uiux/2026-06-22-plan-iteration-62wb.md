# Plan — Itération 62wb (web)

## Objectif
Aligner les 3 variants Badge hors-palette (`gold`/`success`/`warning`) sur les
tokens CSS du design system (`var(--gp-*)`) pour les rendre dark-mode-aware.
Réalise l'arbitrage couleur laissé en suspens depuis 59w.

## Périmètre
- `apps/web/components/v2/Badge.tsx` (3 variants → tokens `--gp-*`)
- `apps/web/__tests__/components/v2/Badge.test.tsx` (test de contrat, neuf)

## Étapes
1. ✅ Vérifier que `--gp-success`/`--gp-warning`/`--gp-gold-accent` existent en
   light **et** dark dans `app/globals.css` (confirmé : l.83-85 light, l.120-122
   + l.73/110 dark).
2. ✅ Swap `bg-[#…] text-[#…]` → `bg-[var(--gp-*)]/N text-[var(--gp-*)]` pour
   `gold`/`success`/`warning` (mirror du variant `error` déjà câblé).
3. ✅ Test `it.each` verrouillant : chaque variant coloré contient `var(--gp-*)`
   et **aucun** hex `#RRGGBB`.
4. ⏳ CI : typecheck + jest (node_modules absent en local → délégué CI).
5. ⏳ PR + merge auto vers `main`, update `branch-tracking.md`.

## Risques / non-régression
- Pure substitution de classes Tailwind présentationnelles, aucune logique.
- Variants `error`/`terracotta`/`teal`/`default` déjà sur `--gp-*` → pattern
  éprouvé, zéro risque structurel.
- Usages live : `ContactCard` (success), `FriendRequestCard` (warning) — rendu
  identique en light, **corrigé** en dark.

## Hors périmètre (réservé / différé)
- Tout l'i18n `t()||'fb'` (vague #814/#818/#835/#840/#841/#842/#843).
- `TextLightbox` `#1e1e1e` (réservé #818).
- `metadata-test.tsx`, `_archived/`, `next-themes` orphelin (épuration future).
