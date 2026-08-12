# Analyse UI/UX — Itération 60wc (web only)

**Date** : 2026-06-22
**Périmètre** : application web (`apps/web/`) exclusivement
**Veine** : a11y + Prisme — i18n des aria-labels d'un aperçu de pièces jointes live
**Base** : `main` HEAD post-merge iter-60wb (#808 auth anti-pattern) — commit `7f4f093`
**Numérotée 60wc** : double collision absorbée — 60w (#806 config-modal) **et** 60wb (#808 auth `t()||fallback`) livrées en parallèle ; périmètres **disjoints**, les trois conservées.

## Revue de cohérence (étapes 1–3 de la routine)

### Doublons d'analyses
- **Aucun doublon de périmètre** : 60w (#806) = `config-modal.tsx` ; 60wb (#808) =
  anti-pattern `t()||fallback` sur `components/auth/**` ; cette 60wc =
  `AttachmentPreviewReply.tsx` (surfaces sans recouvrement).
- **Doublon détecté côté PR (à fermer)** : PR **#802** et **#803** sont **deux
  doublons encore ouverts** du focus-trap déjà livré par #796 (mêmes 2 modales,
  même hook `useFocusTrap`) → **redondants, à fermer**.

### Correction d'un faux positif que j'avais émis (config-modal)
Mon ébauche initiale qualifiait `components/settings/config-modal.tsx` de **code
mort** (aucun import direct dans `app/`/`components/`). **C'était FAUX** : le
composant est **lazy-loadé et live en prod** via `lib/lazy-components.tsx`
(`LazyConfigModal` + entrée `'config-modal'` du registre) ; la 60w (#806) l'a
correctement internationalisé. **Leçon** : pour juger « code mort » côté web,
grep AUSSI `lib/lazy-components.tsx` (lazy registry) ET les imports dynamiques
`import(...)`, pas seulement les imports statiques. NE PLUS qualifier
`config-modal.tsx` de code mort.

## Problème traité — aria-labels FR figés sur `AttachmentPreviewReply` (LIVE)

`components/attachments/AttachmentPreviewReply.tsx` affiche les aperçus interactifs
de pièces jointes dans les **zones de message/réponse** — surface **vivante**,
montée par `components/common/message-composer/index.tsx` et
`components/common/bubble-message/MessageReplyPreview.tsx` (cœur du chat).

Le composant **n'avait AUCUN hook i18n** : 7 libellés d'accessibilité
(`aria-label`/`title`/`alt`) étaient **figés en français en TOUTES langues** —
un lecteur d'écran anglophone/hispanophone/lusophone entendait du français
(rupture Prisme + a11y, WCAG 1.1.1 / 4.1.2).

| Surface | Avant (FR figé) | Après |
|---------|-----------------|-------|
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
  `actions.openImageNamed`, `gallery.fullscreen`).
- **4 clés neuves** sous le bloc existant `attachments.actions`
  (`imagePreviewNamed`, `openVideoFullscreenNamed`, `openPdfNamed`,
  `openTextFileNamed`) — cohérent avec les `*Named` déjà en place. Parité ×4.
- **Pas de fallback string** : signature `t()` exclusive (params **OU** fallback).
  Les 7 surfaces sont `aria-label`/`title`/`alt` **non visibles** → aucun flash ;
  parité ×4 garantit zéro clé brute.
- **Test** : `__tests__/components/attachments/AttachmentPreviewReply.test.tsx`
  interrogeait par nom accessible FR → mock de `@/hooks/useI18n` ajouté (résout
  les clés en FR), intent inchangé. Pattern identique au 59w `PhoneResetFlow.test`.

## Vérifications
- Grep FR résiduel dans `AttachmentPreviewReply.tsx` (aria/title/alt) = **0**.
- JSON valide ×4 ; diff locale **strictement additif** (4 clés en fin de bloc).
- **CI #804** : Quality (bun) ✅, Test web ✅ (avec le mock i18n),
  Security ✅, Build ✅ — sur le commit pré-merge ET le commit de merge.

## ✅ Statut — COMPLÈTE & CORRIGÉE
**NE PLUS re-flagger** `components/attachments/AttachmentPreviewReply.tsx` pour
i18n des aria-labels/title/alt. **NE PLUS qualifier `config-modal.tsx` de code
mort** — live (lazy) + i18n (#806). **À fermer** : PR #802 / #803.

## Reste différé (61w+)
- `components/auth/PhoneResetFlow.tsx:491` : `sr-only` `Indicatif pays` FR figé.
- Anti-pattern `t()||fallback` restant (~270 occ / ~48 fichiers hors auth) — 60wd+ (cf. #808).
- `Badge` variants success/warning/gold off-palette — arbitrage `theme.colors.*` vs `gp-*`.
- `app/settings/loading.tsx` server-component i18n (exclusion documentée).
- retrait dépendance orpheline `next-themes` (touche `pnpm-lock.yaml`, isolé).
</content>
# Itération 60wc — Analyse UI/UX (web)

**Date** : 2026-06-22
**Périmètre** : application web (`apps/web`) **uniquement**
**Base** : `main` HEAD post-merge iter-60w config-modal #806 + iter-60wb auth anti-pattern #808
**Branche** : `claude/practical-fermat-8e8nhk`

## Contexte

Toutes les analyses 1→60wb et leurs plans sont **complets et annotés** dans `docs/plans/uiux/branch-tracking.md`. Forte contention des agents parallèles (60w config-modal #806, 60wb auth `t()||` anti-pattern #808 — tous deux mergés). Cette itération prend une surface **orthogonale** : un **bug de correctness** relevé par la revue d'optimisation.

> **Numérotation** : renumérotée **60w → 60wb → 60wc** au fil des collisions de merge (60w = config-modal #806 ; 60wb = auth anti-pattern #808, agent parallèle `o2g4dt`). Périmètres tous disjoints.

## Constat — BUG : `setTheme` non défini dans `AdminLayout`

**Fichier** : `apps/web/components/admin/AdminLayout.tsx`
**Lignes** : 355, 359, 363 (sélecteur de thème de l'en-tête admin)

Le menu déroulant « Dark Mode Toggle » de l'en-tête admin appelle `setTheme('light' | 'dark' | 'auto')` sur le `onClick` de chacun de ses trois `DropdownMenuItem`. Or **`setTheme` n'est ni importé ni défini** dans le composant :
- aucun `import`,
- aucun hook ne le fournit (les hooks présents : `useI18n`, `useCurrentInterfaceLanguage`, `useUser`, `useAuth`, `useRouter`),
- aucune déclaration locale.

**Conséquence** : tout clic sur une option de thème dans **n'importe quelle page admin** lève une `ReferenceError: setTheme is not defined` → crash de l'interaction (et potentiellement de la vue via l'error boundary).

**Pourquoi ce n'a pas été capté à la compilation** : `next.config.ts` porte `typescript.ignoreBuildErrors: true` (l.17-18). Le `Cannot find name 'setTheme'` qu'aurait remonté `tsc` strict est donc masqué au build. Bug latent classique de référence non résolue masquée par un build permissif.

## Correctif retenu (Single Source of Truth)

Réutiliser le **setter de thème canonique** déjà en production (aucune réimplémentation) :
- `setTheme` est exposé par `useAppActions()` (`stores/app-store.ts:138`, ré-exporté par `stores/index.ts`).
- Sa signature `(theme: 'light' | 'dark' | 'auto') => void` correspond **exactement** aux 3 appels d'`AdminLayout`.
- L'implémentation applique déjà la classe `.light`/`.dark` sur `documentElement` (et résout `auto` via `matchMedia`), avec garde `typeof window !== 'undefined'`.

Diff minimal (2 lignes, 1 fichier) :
1. `import { useUser, useAppActions } from '@/stores';` (ajout à l'import existant).
2. `const { setTheme } = useAppActions();` dans le corps du composant.

C'est le même pattern que `components/settings/theme-settings.tsx` (l.28 `const { setTheme } = useAppActions();`) → cohérence avec l'écran de réglages principal.

## Hors périmètre / différé (documenté, ne pas re-flagger à l'aveugle)

- **`AdminLayout.tsx:351`** `<span className="sr-only">Toggle theme</span>` — label a11y **en anglais dur**. Ce n'est PAS une rupture Prisme « FR figé en toutes langues » (l'anglais reste une langue valide pour un lecteur d'écran) ; l'i18n exigerait une clé neuve `layout.toggleTheme` ×4 locales pour un gain marginal. **Différé 61w+** (candidat parité a11y, non prioritaire).

## Vérification

- `useAppActions` confirmé exporté par `@/stores` (`stores/index.ts:20`) et exposant `setTheme` (`app-store.ts:138`).
- Type `'light' | 'dark' | 'auto'` ↔ 3 appels d'`AdminLayout` : OK.
- Aucun fichier locale touché (les clés `layout.themeLight/Dark/Auto` existent déjà — `admin.json:2008-2010` — et résolvaient déjà ; seul le *handler* était cassé).
- CI verte sur PR #805 (Quality bun, Build bun, Test web/gateway/shared/agent/python, Security — tous ✅), re-vérifiée après chaque resync `main`.

## Statut

✅ **Corrigé & complet.** NE PLUS re-flagger `AdminLayout.tsx` pour `setTheme` non défini.
