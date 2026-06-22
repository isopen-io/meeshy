# Analyse UI/UX — Itération 61wb (web only)

**Date** : 2026-06-22
**Périmètre** : application web (`apps/web/`) exclusivement
**Veine** : Prisme — élimination du *flash-of-raw-keys* sur le chrome global (footer + header + nav dashboard)
**Base** : `main` HEAD post-merge iter-60wd (#811 admin/agent) — commit `799ea44` (rebasée)
**Numérotée 61wb** : `61w` pris par VideoLightbox (#816, agent parallèle `e2lu99`) sur une surface
**disjointe**. Ce lot cible **`components/layout/`**, non couvert par aucune PR en vol
(#837 AttachmentPreviewReply=doublon #804 ; #835 conv-header ; #818 lightbox txt/pptx ; #816 VideoLightbox).

## Revue de cohérence (étapes 1–3 de la routine)

### Doublons d'analyses / PR ouvertes (étape 1)
Forte contention multi-agents repérée parmi les PR ouvertes — **doublons de travail déjà mergé,
fermés ce run** :
- **#837** (`AttachmentPreviewReply` a11y) = DOUBLON de #804 (60wc) déjà mergé → **fermé**.
- **#812** (`ConfigModal` tab labels) = DOUBLON de #806 (60w) déjà mergé (+ `dirty`) → **fermé**.
- **#802 / #803** (focus-trap) = doublons de #796 déjà mergé → déjà fermés.
- PR orthogonales légitimes (NE PAS toucher) : #835, #818, #814.

### Vérification anti-redondance (étape 2)
Surfaces `layout/` jamais traitées par une itération antérieure (grep des analyses 1→61w :
aucune mention de `Footer.tsx`/`layout/Header.tsx`/`DashboardLayout.tsx`).

## Problème traité — anti-pattern `t(key) || 'fallback'` sur le chrome global LIVE

`use-i18n.ts` renvoie `fallback || key` ⇒ **quand `t()` est appelé sans 2e argument, il
retourne la clé brute** (truthy) pendant le chargement async des traductions. Le `|| 'fallback'`
court-circuite alors sur cette clé brute → **flash-of-raw-keys** visible. (Les clés existent
toutes ×4 locales : la valeur correcte s'affiche *après* chargement, mais le bref instant de
load montre `footer.tagline`, `footer.links.about`, `shareText`, `navigation.feeds`…)

3 composants **live** sur ~10 pages publiques chacun :

| Fichier | Occ. | Surface | Clé (existe ×4) |
|---------|------|---------|-----------------|
| `components/layout/Footer.tsx` | 7 | tagline + copyright + 5 liens (about/terms/contact/policy/partners) — footer de settings/contact/terms/partners/links/privacy/me/contacts/search… | `landing.footer.*` |
| `components/layout/Header.tsx` | 4 | message de partage natif (`navigator.share` / clipboard) — fallback **figé en FRANÇAIS** | `header.shareText` |
| `components/layout/DashboardLayout.tsx` | 1 | item de nav « Feed » (`/feed/posts`) | `common.navigation.feeds` |

## Décisions
- **Transformation mécanique** `t(k) || 'x'` → `t(k, 'x')` (signature native, cf. classe de bug
  60wb/#808). Comportement **inchangé** après chargement ; supprime le flash de clé brute pendant le load.
- **Fallbacks alignés sur la valeur EN exacte du locale** (leçon 50w) :
  - Footer : `Meet without shyness`, `© 2026 Meeshy`, `About`/`Terms`/`Contact`/`Policy`/`Partners`
    (l'ancien `'Privacy Policy'` / `'© 2025 Meeshy. All rights reserved.'` / `'Breaking language
    barriers…'` divergeaient de la locale EN → corrigés).
  - Header : `shareText` fallback **anglicisé** (le FR figé devenait le message de partage par défaut
    pour TOUS les non-francophones pendant le load) → valeur EN exacte.
  - DashboardLayout : `'Feeds'` → `'Feed'` (valeur EN exacte, singulier).
- **Aucune clé locale neuve** : toutes présentes ×4 ; diff strictement code (3 fichiers, 12 lignes).

## Vérifications
- Grep anti-pattern résiduel dans les 3 fichiers `layout/` = **0**.
- Clés vérifiées présentes ×4 locales (`landing.footer.*`, `header.shareText`, `common.navigation.feeds`).
- Tests existants `__tests__/components/layout/{Footer,Header,DashboardLayout}.test.tsx` : les mocks
  `useI18n` exposent `t: (key) => translations[key] || key` (ignorent le 2e arg) → assertions
  inchangées, restent vertes. `t(key, string)` est type-valide (`paramsOrFallback?: …| string`).
- CI déléguée (Quality bun / Test web / Security / Build).

## ✅ Statut — COMPLÈTE
**NE PLUS re-flagger** l'anti-pattern `t()||fallback` sur `components/layout/Footer.tsx`,
`components/layout/Header.tsx`, `components/layout/DashboardLayout.tsx`.

## Reste différé (62w+)
- Anti-pattern `t()||fallback` restant (~260 occ / ~45 fichiers hors auth+layout) — par lots bornés
  orthogonaux (conversations header #835, image dialogs #814 en vol — vérifier merge avant de doubler).
- `components/auth/PhoneResetFlow.tsx:491` : `sr-only` `Indicatif pays` FR figé.
- `Badge` variants success/warning/gold off-palette — arbitrage `theme.colors.*` vs `gp-*`.
- `app/settings/loading.tsx` server-component i18n (exclusion documentée).
- retrait dépendance orpheline `next-themes` (touche `pnpm-lock.yaml`, isolé).
- épuration `components/settings/_archived/` (font-selector code mort).
