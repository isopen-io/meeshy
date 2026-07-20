# Analyse UI/UX — Itération 62wb (web)

## Périmètre
Application **web uniquement** (`apps/web/`). iOS/Android hors périmètre (référence
iOS seulement pour parité naturelle des features).

## Revue de cohérence (étapes 1–3 de la routine)

### Étape 1 — Doublons d'analyses
Aucun doublon de contenu introduit dans `docs/analyses/uiux/`. La numérotation
reste bornée par itération (`*w`/`*wb`/`*wc` = passes disjointes sur collisions
d'agents parallèles). La cible 62wb (`components/v2/Badge.tsx`, tokens couleur)
n'a **jamais** été corrigée — elle figurait en **différé** depuis 59w
(« Badge variants success/warning/gold off-palette — arbitrage `theme.colors.*`
vs `gp-*` requis d'abord »). Cette itération réalise l'arbitrage.

### Étape 2 — Couverture plans/corrections
Tous les items i18n/a11y 49w→61w ont un plan ET une annotation de merge dans
`branch-tracking.md`. Sur `main`, iter-61w (`VideoLightbox`, #816) est **mergée**
— déclencheur de cette routine (`pull_request.closed` #816).

### Étape 3 — Annotations
`branch-tracking.md` mis à jour : 61w marqué ✅ (mergé), nouvelle entrée **62wb**,
`Badge.tsx` retiré du backlog différé (arbitrage tranché + corrigé).

## Contexte — forte contention i18n, surface couleur orthogonale choisie
PRs ouvertes au démarrage (parallèles, **toutes i18n `t()||'fb'` ou lightbox**) :
#814 (image dialog), #818 (text/pptx lightbox dismiss), #835 (conversation
header), #840/#841 (layout chrome, labellisées iter-62w), #842/#843 (message
bubble cluster), #810 (PhoneResetFlow), #805 (AdminLayout theme). Le cluster
`t()||'fb'` est massivement attaqué. → Cette itération évite **entièrement** la
zone i18n et prend une surface strictement disjointe de **catégorie différente**
(cohérence couleur / dark-mode), touchée par **aucune** PR ouverte :
`components/v2/Badge.tsx`.

## Problème traité — variants Badge hors palette, non dark-mode-aware
`components/v2/Badge.tsx` expose 7 variants. Quatre (`default`, `terracotta`,
`teal`, `error`) sourcent leurs couleurs via les **variables CSS du design
system** (`var(--gp-*)`), donc s'adaptent automatiquement light/dark. **Trois**
restaient figés sur des **hex codés en dur issus de l'ancienne palette v1**
(teal/terracotta, avant la refonte indigo/slate) :

| Variant | Avant (hex figé v1) | Après (token design system) |
|---------|---------------------|------------------------------|
| `gold` | `bg-[#E9C46A]/20 text-[#B8860B]` | `bg-[var(--gp-gold-accent)]/20 text-[var(--gp-gold-accent)]` |
| `success` | `bg-[#2A9D8F]/10 text-[#2A9D8F]` | `bg-[var(--gp-success)]/10 text-[var(--gp-success)]` |
| `warning` | `bg-[#F4A261]/20 text-[#D68A3A]` | `bg-[var(--gp-warning)]/20 text-[var(--gp-warning)]` |

**Impact réel** : ces hex ne changent **pas** entre light et dark mode → en dark
mode les badges `success`/`warning`/`gold` gardaient des teintes claires v1
(`#2A9D8F`, `#F4A261`, `#E9C46A`) sur fond sombre, hors de la charte indigo/slate
v2, avec un contraste incohérent par rapport aux badges `error`/`terracotta`/
`teal` voisins. Usages live confirmés : `ContactCard` (`success`),
`FriendRequestCard` (`warning`).

## Arbitrage (le point laissé en suspens depuis 59w)
Le design system **définit déjà** les tokens exacts requis, avec valeurs
light **et** dark (`app/globals.css`) :

| Token | Light | Dark |
|-------|-------|------|
| `--gp-success` | `#10B981` | `#34D399` |
| `--gp-warning` | `#F59E0B` | `#FBBF24` |
| `--gp-gold-accent` | `#F59E0B` | `#FBBF24` |
| `--gp-error` (déjà câblé) | `#EF4444` | `#F87171` |

L'arbitrage est donc tranché **sans ambiguïté** : on mappe sur `--gp-*` plutôt
que d'inventer de nouveaux tokens — Single Source of Truth, exactement le pattern
de la consolidation `#C1292E → var(--gp-error)` (56wb) et de la branche `error`
du même composant. Zéro nouveau token, zéro nouvelle variable CSS.

## Décisions
- **Réutilisation des tokens existants** (`--gp-gold-accent`, `--gp-success`,
  `--gp-warning`) — aucune création. `gold` réutilise `--gp-gold-accent`
  (sémantiquement « accent doré » de la charte) plutôt que d'introduire un
  `--gp-gold` dédié.
- **Texte et fond sur le même token** (avec opacité `/10`–`/20` sur le fond),
  exactement comme la branche `error` déjà en place → cohérence interne du
  composant + lisibilité garantie par les valeurs dark dédiées.
- **Test de contrat** (`__tests__/components/v2/Badge.test.tsx`) verrouillant que
  chaque variant colorée rend un token `var(--gp-*)` et **aucun hex `#RRGGBB`** —
  empêche toute régression vers des couleurs codées en dur (RED→GREEN).

## Vérifié — NE PLUS re-flagger
- `components/v2/Badge.tsx` : **tous** les variants colorés sourcent désormais
  `var(--gp-*)`. Grep `#[0-9A-Fa-f]{6}` dans le fichier = 0. Dark-mode-aware
  complet. **NE PLUS re-flagger** ce composant pour hardcoding couleur / parité
  dark mode.

## Revue optimisation (étape 4) — opportunités repérées (différées, bornées)
- Anti-pattern systémique `t('key') || 'fallback'` (~44 fichiers) — **massivement
  en cours** (#814/#818/#835/#840/#841/#842/#843). NE PAS attaquer en parallèle
  (collision garantie). Lots cohérents bornés une fois la vague mergée.
- `components/common/metadata-test.tsx` : composant debug FR figé — **candidat
  épuration** (vérifier montage prod avant i18n ; ne pas i18n du code mort, cf.
  faux positif `font-selector.tsx` 59w).
- `components/settings/_archived/` : layout archivé non monté — candidat
  suppression (épuration) une fois confirmé inutile.
- `components/text/TextLightbox.tsx:300` : `bg-[#1e1e1e]` figé (fond éditeur
  code) — **réservé à #818** (lightbox), ne pas toucher.
- Dépendance orpheline `next-themes` (touche `pnpm-lock.yaml`, isolé).

## Statut
✅ Implémenté — itération **62wb**. Diff minimal (1 composant +3/-3, 1 test neuf).
`node_modules` absent du container routine → typecheck/build délégués au CI (cf.
59w/60w/61w). Changement = swap de classes Tailwind hex → `var(--gp-*)` sur 3
variants + test de contrat ; aucune logique modifiée.

## ✅ Annotation de complétude
**SOLDÉ en 62wb** — `Badge.tsx` entièrement aligné sur les tokens du design
system (`--gp-*`), dark-mode-aware. Arbitrage 59w tranché (mapping `--gp-*`, pas
de nouveau token). **NE PLUS re-flagger** ce composant pour cohérence couleur.
