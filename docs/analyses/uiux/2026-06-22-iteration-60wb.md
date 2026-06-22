# Itération 60wb — Analyse UI/UX (web)

**Date** : 2026-06-22
**Périmètre** : application web (`apps/web`) **uniquement**
**Base** : `main` HEAD post-merge iter-59w/60w (`09b7a84`, après config-modal #806)
**Branche** : `claude/practical-fermat-8e8nhk`

## Contexte

Toutes les analyses 1→60w et leurs plans de correction sont **complets et annotés** dans `docs/plans/uiux/branch-tracking.md` (chaque surface soldée porte un « NE PLUS re-flagger »). Forte contention des agents parallèles sur les surfaces feed/reels/modales (57w–60w) — la 60w « config-modal i18n » (#806) couvre exactement le candidat que cette branche avait initialement préparé, d'où la **renumérotation en 60wb** et le pivot sur une surface orthogonale.

La revue d'optimisation a relevé un **bug de correctness** (et non une finition i18n/a11y), prioritaire car il provoque un **crash runtime** réel.

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
- CI verte sur PR #805 (Quality bun, Build bun, Test web/gateway/shared/agent/python, Security — tous ✅) avant détection du conflit `branch-tracking.md` (renumérotation 60w→60wb).

## Statut

✅ **Corrigé & complet.** NE PLUS re-flagger `AdminLayout.tsx` pour `setTheme` non défini.
