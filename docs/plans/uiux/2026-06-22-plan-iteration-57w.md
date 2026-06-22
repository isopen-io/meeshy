# Plan de correction — Itération 57w (web)

**Date** : 2026-06-22
**Cible** : `apps/web/components/feed/ReelPlayer.tsx` (lecteur reel immersif)
**Analyse** : `docs/analyses/uiux/2026-06-22-iteration-57w.md`

## Objectif

Internationaliser entièrement le lecteur reel : aucune chaîne user-facing FR figée.
Réutiliser le namespace `reel` (créé 53wb) ; regrouper les nouvelles clés sous `player`.

## Changements

### 1. Locales — `locales/{en,fr,es,pt}/reel.json`
Ajout d'un bloc `player` (12 clés, parité ×4) :
```
position  : "Reel {current} of {total}"  (param current/total)
byAuthor  : "Reel by {name}"             (param name)
play      : "Play"
close     : "Close"
previous  : "Previous reel"
next      : "Next reel"
unmute    : "Turn on sound"
mute      : "Turn off sound"
like      : "Like"
comment   : "Comment"
share     : "Share"
bookmark  : "Save"
```

### 2. Composant — `ReelPlayer.tsx`
- `import { useI18n } from '@/hooks/useI18n';`
- `const { t } = useI18n('reel');` en tête du composant.
- Remplacement des 13 emplacements FR durs par `t('player.*', …)`.
- Clés simples : `t('player.x', 'English')` (fallback EN 2e arg — anti-flash, leçon 50w).
- Clés paramétrées : `t('player.position', { current: index + 1, total })`,
  `t('player.byAuthor', { name })` (params XOR fallback — signature `t()` exclusive ;
  parité ×4 + cibles sr-only/aria ⇒ zéro flash perceptible).

## Vérifications

- [x] Aucune chaîne FR dure résiduelle (`grep` aria-label/alt/label/sr-only).
- [x] Parité JSON ×4 : 12 clés `player.*` identiques en/fr/es/pt (validé via `node -e`).
- [x] JSON valide ×4.
- [ ] `tsc` / build : node_modules absents du container — délégué au CI de la PR.

## Hors périmètre (différé 58w+)

- `PostsFeedScreen.tsx` (aria-labels FR + `title="Feed"`).
- `ReelsFeedScreen.tsx` (`title="Reels"`).

## Statut

✅ Développement terminé. PR + merge main après CI vert.
