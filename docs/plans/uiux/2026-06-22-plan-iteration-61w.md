# Plan — Itération 61w (web)

## Objectif
Internationaliser les **2 dernières chaînes FR figées** de la visionneuse vidéo
plein écran `components/video/VideoLightbox.tsx` — parité avec sa jumelle
`ImageLightbox.tsx` (soldée en 59w). Surface **orthogonale** à toutes les PR en
vol (#804–#814 : config-modal, admin/agent, auth, attachments, anti-pattern
`t()||'fb'`).

## Contexte / état du métier
`VideoLightbox.tsx` est déjà i18n à ~95 % (`useI18n('common')`, tous les
`aria-label`). Restaient 2 surfaces FR figées affichées en TOUTES langues
(rupture Prisme), identiques au défaut corrigé sur `ImageLightbox` :
1. `title` du bouton plein écran (tooltip survol).
2. Bloc d'aide clavier desktop (`<p>…</p>`).

## Changements (1 composant, 4 locales)
### 1. `components/video/VideoLightbox.tsx`
- L668 `title` : `"Quitter le plein écran (F)"`/`"Plein écran (F)"` →
  `t('common.exitFullscreen')`/`t('common.enterFullscreen')` (**réutilise** les
  clés déjà câblées sur l'`aria-label` du même bouton — zéro clé neuve ; retire le
  « (F) » redondant avec l'aide clavier).
- L684-685 aide clavier : `<p>Utilisez les flèches…</p>` →
  `<p>{t('common.videoLightboxKeyboardHelp')}</p>`.

### 2. `locales/{en,fr,es,pt}/common.json`
- 1 clé neuve `common.videoLightboxKeyboardHelp` (après `lightboxKeyboardHelp`),
  texte vidéo (Espace play/pause, M mute, F plein écran) ×4 locales à parité.

## Découverte clé (épuration)
- Les clés `common.exitFullscreen`/`enterFullscreen` **existent déjà** ×4 → le
  `title` ne crée aucune clé. Une seule clé réellement neuve.

## Hors périmètre (assumé)
- Anti-pattern `t()||'fb'` (40 fichiers) → en cours #814, ne pas dupliquer.
- `metadata-test.tsx` (debug FR) → vérifier mort/vivant avant i18n.
- Commentaires FR internes de `VideoLightbox.tsx` → non user-facing.

## Vérification
- node_modules absent → typecheck/build délégués au CI (cf. 58wb/59w/60w).
- JSON valide ×4, clé `videoLightboxKeyboardHelp` présente ×4 (vérifié).
- Grep FR user-facing dans `VideoLightbox.tsx` = 0 (reste : commentaires).

## Suite (différé restant)
- Lots de l'anti-pattern `t()||'fb'` une fois #814 mergée (par feature).
- `metadata-test.tsx` (si vivant en prod).
- `Badge` success/warning/gold off-palette → arbitrage `theme.colors.*` vs `gp-*`.
