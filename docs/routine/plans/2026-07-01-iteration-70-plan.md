# Iteration 70 — Plan d'implémentation (2026-07-01)

## Objectif
Converger les 2 pages **admin links** vers la source unique presse-papier `lib/clipboard.ts`, corrigeant un
**faux toast de succès** (copie non attendue → « Copié » affiché même en cas d'échec) et gagnant le **fallback
textarea iOS/WebView**. Cible vérifiable par fichier ; CI = gate final.

## Phases

### Phase 1 — i18n (clé `copyError`) ✅
- [x] Ajouter `shareLinks.copyError` et `trackingLinks.copyError` dans `locales/{fr,en,es,pt}/admin.json`
  (4 langues, symétrique, insertion minimale via script — 6 lignes de diff par fichier).

### Phase 2 — Convergence `app/admin/share-links/page.tsx` ✅
- [x] Import `copyToClipboard as copyTextToClipboard` depuis `@/lib/clipboard`.
- [x] `copyToClipboard` → `async` : `const { success } = await copyTextToClipboard(text)` ;
      `toast.success(t('shareLinks.copiedToClipboard'))` si succès, sinon `toast.error(t('shareLinks.copyError'))`.

### Phase 3 — Convergence `app/admin/tracking-links/page.tsx` ✅
- [x] Import `copyToClipboard as copyTextToClipboard` depuis `@/lib/clipboard`.
- [x] `copyToClipboard` → `async` : succès → `t('trackingLinks.copySuccess')`, échec → `t('trackingLinks.copyError')`.

### Phase 4 — Vérification ✅
- [x] tsc par fichier (bruit dep-resolution filtré) : **0 erreur nouvelle**. Les 5 `TS2339` pré-existantes de
      `tracking-links/page.tsx` se décalent de +1 ligne (import ajouté), aucun code d'erreur nouveau.
- [x] Aucun test n'exerce `copyToClipboard` sur ces pages → pas de test à adapter.

### Phase 5 — Livraison
- [ ] Commit + push sur `claude/sharp-wozniak-omcla9`.
- [ ] PR vers `main` ; **CI verte** ; merge dans `main` avant l'itération suivante.

## Continuité
Iter 71 : cible candidate **F30-svc** (`share-utils.ts` + `tracking-links.ts`, avec adaptation du test
`share-utils.test.ts`) ou reste F30 (`Header.tsx` ×5). **F32 gateway** dès que l'environnement Prisma redevient
disponible. Toujours reset sur `main` + baseline par fichier avant édition (protocole v2).

## Statut
- [x] Phases 1–4 terminées, 0 régression locale.
- [ ] Phase 5 : push + PR + CI + merge.
