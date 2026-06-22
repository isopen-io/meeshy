# Analyse UI/UX — Itération 60wb (web only)

**Date** : 2026-06-22
**Périmètre** : application web (`apps/web/`) exclusivement
**Veine** : a11y + Prisme — i18n des aria-labels d'un aperçu de pièces jointes live
**Base** : `main` HEAD post-merge iter-60w (#806 ConfigModal) — commit `09b7a84`
**Numérotée 60wb** : collision avec la 60w (#806, config-modal) livrée en parallèle ; périmètres **disjoints**, les deux conservées.

## Revue de cohérence (étapes 1–3 de la routine)

### Doublons d'analyses
- **Aucun doublon de périmètre** : la 60w (#806) couvre `config-modal.tsx` ;
  cette 60wb couvre `AttachmentPreviewReply.tsx` (surfaces sans recouvrement).
- **Doublon détecté côté PR (à fermer)** : le fichier `2026-06-22-iteration-59w.md`
  est le résultat d'un **merge de TROIS tentatives 59w parallèles** (OTP a11y,
  ImageLightbox i18n, focus-trap). Les PR **#802** et **#803** sont **deux doublons
  encore ouverts** du focus-trap déjà livré par #796 (mêmes 2 modales, même hook
  `useFocusTrap`) → **redondants, à fermer**.

### Correction d'un faux positif que j'avais émis (config-modal)
Mon ébauche initiale qualifiait `components/settings/config-modal.tsx` de **code
mort** (au motif qu'aucun import direct n'existait dans `app/`/`components/`).
**C'était FAUX** : le composant est **lazy-loadé et live en prod** via
`lib/lazy-components.tsx` (`LazyConfigModal` + entrée `'config-modal'` du registre).
Mon grep s'était limité aux imports directs et avait **manqué le registre de
lazy-loading**. La 60w (#806) l'a donc correctement internationalisé.
**Leçon (à appliquer)** : pour juger « code mort » côté web, toujours grep aussi
`lib/lazy-components.tsx` (lazy registry) ET les imports dynamiques `import(...)`,
pas seulement les imports statiques. NE PLUS qualifier `config-modal.tsx` de code
mort — il est live et i18n (#806).

## Problème traité — aria-labels FR figés sur `AttachmentPreviewReply` (LIVE)

`components/attachments/AttachmentPreviewReply.tsx` affiche les aperçus interactifs
de pièces jointes dans les **zones de message/réponse** — surface **vivante**,
montée par `components/common/message-composer/index.tsx` et
`components/common/bubble-message/MessageReplyPreview.tsx` (cœur du chat).

Le composant **n'avait AUCUN hook i18n** : 7 libellés d'accessibilité
(`aria-label`/`title`/`alt`) étaient **figés en français en TOUTES langues** —
un lecteur d'écran anglophone/hispanophone/lusophone entendait du français
(rupture Prisme + a11y, WCAG 1.1.1 / 4.1.2).

| Ligne | Avant (FR figé) | Après |
|-------|-----------------|-------|
| group | `{n} pièce(s) jointe(s)` | `t('upload.filesAttached', {count})` *(réutilisé)* |
| image | `Ouvrir l'image {name}` | `t('actions.openImageNamed', {name})` *(réutilisé)* |
| image alt | `Aperçu de l'image {name}` | `t('actions.imagePreviewNamed', {name})` *(neuf)* |
| vidéo title | `Ouvrir en plein écran` | `t('gallery.fullscreen')` *(réutilisé)* |
| vidéo | `Ouvrir la vidéo {name} en plein écran` | `t('actions.openVideoFullscreenNamed', {name})` *(neuf)* |
| PDF | `Ouvrir le PDF : {name}` | `t('actions.openPdfNamed', {name})` *(neuf)* |
| texte | `Ouvrir le fichier texte : {name}` | `t('actions.openTextFileNamed', {name})` *(neuf)* |

## Décisions
- **Réutilisation maximale** (Single Source of Truth) : 3 des 7 chaînes mappent
  vers des clés **déjà présentes ×4 locales** (`upload.filesAttached`,
  `actions.openImageNamed`, `gallery.fullscreen`) — zéro clé neuve pour elles.
- **4 clés neuves** sous le bloc existant `attachments.actions`
  (`imagePreviewNamed`, `openVideoFullscreenNamed`, `openPdfNamed`,
  `openTextFileNamed`) — cohérent avec les `*Named` déjà en place
  (`deleteImageNamed`/`openFileNamed`…). Parité ×4 (en/fr/es/pt) ajoutée.
- **Pas de fallback string** : signature `t()` exclusive (params **OU** fallback,
  leçon 54w/59w). Les 7 surfaces sont `aria-label`/`title`/`alt` **non visibles**
  → aucun flash de texte pendant le load async, et la parité ×4 garantit zéro
  clé brute affichée.
- **Test** : `__tests__/components/attachments/AttachmentPreviewReply.test.tsx`
  interrogeait par nom accessible FR. Mock de `@/hooks/useI18n` ajouté pour
  résoudre les clés en FR (les requêtes par nom accessible — geste clavier,
  ouverture lightbox — restent valides, intent inchangé). Diff minimal, pattern
  identique au 59w `PhoneResetFlow.test`.

## Vérifications
- Grep FR résiduel dans `AttachmentPreviewReply.tsx` (aria/title/alt) = **0**.
- JSON valide ×4 ; diff locale **strictement additif** (4 clés en fin de bloc).
- **CI #804** : Quality (bun) ✅, Test web ✅ (après ajout du mock i18n),
  Build/Security/tous tests ✅, Summary ✅.

## ✅ Statut — COMPLÈTE & CORRIGÉE
**NE PLUS re-flagger** `components/attachments/AttachmentPreviewReply.tsx` pour
i18n des aria-labels/title/alt : entièrement internationalisé (Prisme respecté).
**NE PLUS qualifier `config-modal.tsx` de code mort** — live (lazy) + i18n (#806).
**À fermer** : PR #802 / #803 (doublons du focus-trap 59w déjà livré par #796).

## Reste différé (61w+)
- `components/auth/PhoneResetFlow.tsx:491` : `sr-only` `Indicatif pays` FR figé.
- `Badge` variants success/warning/gold off-palette — arbitrage `theme.colors.*`
  vs `gp-*` requis d'abord (NE PAS trancher à l'aveugle).
- `app/settings/loading.tsx` server-component i18n (exclusion documentée).
- retrait dépendance orpheline `next-themes` (touche `pnpm-lock.yaml`, isolé).
</content>
