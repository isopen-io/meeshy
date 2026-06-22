# Plan — Itération 59w (web)

## Base
- Repartir de `main` HEAD `5148505` (post-merge #787 iter-58wb PostsFeedScreen + FeedTabs).
- Branche de travail : `claude/practical-fermat-gkkftf-59w` (créée depuis `main`).

## Contexte
- Revue des analyses `docs/analyses/uiux/` + plans `docs/plans/uiux/` : tout le
  cluster feed 53w est soldé (ReelPlayer #774, ReelsFeedScreen #780, PostsFeedScreen
  #787) ; modales hand-rolled 58w soldées ; rouge erreur 56wb soldé.
- Audit d'optimisation orienté **surfaces live user-facing**. Faux positif écarté :
  `components/settings/font-selector.tsx` contient ~12 chaînes FR figées MAIS n'est
  monté QUE par `components/settings/_archived/settings-layout.tsx` (code archivé,
  jamais rendu en prod) — i18n d'un composant mort = valeur nulle. **NE PAS i18n
  font-selector tant qu'il reste dans `_archived`.**
- Cible 59w : `components/attachments/ImageLightbox.tsx` — visionneuse d'images
  plein écran **live** (montée partout où une image est ouverte). Déjà i18n à 90 %
  (boutons download/close/nav/zoom/rotate) mais **3 chaînes FR figées** restantes
  + lacune a11y dialog.

## Objectif
1. i18n des 3 dernières chaînes FR de `ImageLightbox` (rupture Prisme — affichées
   en TOUTES langues) :
   - L209 `Impossible de charger l'image` → `t('common.imageLoadError', ...)`
   - L220 bouton `Télécharger quand même` → `t('common.downloadAnyway', ...)`
   - L337 aide clavier `Utilisez les flèches ← →…` → `t('common.lightboxKeyboardHelp', ...)`
2. a11y : sémantique dialogue sur le portail plein écran (pattern 58w) —
   `role="dialog"` + `aria-modal="true"` + `aria-label={t('common.imageViewer')}`.

## Étapes
1. [x] 4 clés neuves sous l'objet `common` de `locales/{en,fr,es,pt}/common.json`
   (`imageViewer`, `imageLoadError`, `downloadAnyway`, `lightboxKeyboardHelp`).
2. [x] `ImageLightbox.tsx` : 3 swaps `t()` (fallbacks EN 2e arg, leçon 50w) +
   `role`/`aria-modal`/`aria-label` sur le `motion.div` racine.
3. [x] Vérif : JSON valide ×4 ; parité des 4 clés ×4 locales ; grep FR résiduel = 0.
4. [x] Annoter analyse + `branch-tracking.md` (58wb mergée, base 59w, ne plus
   re-flagger ImageLightbox ni font-selector archivé).
5. [ ] Commit + push ; PR ; merge `main` après CI vert ; supprimer la branche.

## Contraintes
- Fallbacks EN en 2e arg (anti-flash, leçon 50w).
- Namespace `common` réutilisé (le composant fait déjà `useI18n('common')`) —
  aucun nouveau namespace, aucun nouvel import.
- Gestes déjà conformes (Escape→close, clic backdrop→close, flèches nav) : ne pas
  retoucher la logique clavier/souris, seulement la sémantique a11y manquante.
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (60w+)
- `Badge` v2 variants success/warning/gold hexes off-palette — **nécessite arbitrage
  `theme.colors.*` vs `gp-*` AVANT toute migration** (déféré 56wb, ne pas trancher
  à l'aveugle).
- focus-trap complet sur `ConversationDrawer` + `AgentTopicEditModal` (58w laissait
  ce reliquat borné).
- `font-selector.tsx` : décider épuration (suppression `_archived/`) OU i18n si
  ré-activé — NE PAS i18n tant qu'archivé.
- console.error FR (logs dev, non bloquant) ; `next-themes` orphelin (touche lockfile).
