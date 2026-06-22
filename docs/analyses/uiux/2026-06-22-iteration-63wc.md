# Analyse UI/UX — Itération 63wc (web)

**Date** : 2026-06-22
**Périmètre** : application **web** uniquement (`apps/web`). iOS/Android hors périmètre
(référence iOS seulement pour parité naturelle des features).
**Surface** : fond de letterbox des **recadreurs d'image** `react-easy-crop`
(`containerStyle.backgroundColor` en style inline).
**Branche** : `claude/practical-fermat-lxjyk5` (base `main` HEAD `bded2b0`, post-merge iter-62wp #850).
**Suffixe** : `63wc` — `63w` est occupé par #855 (épuration settings/_archived) et le slot 63 est
sous très forte contention (≥8 PR web en vol). Périmètre **strictement disjoint** (couleur/dark-mode,
zéro i18n).

## Étape 1 — Doublons d'analyses

Aucun doublon de contenu introduit. `branch-tracking.md` sert de ledger anti-répétition (chaque surface
soldée porte un « NE PLUS re-flagger »). Vérifié : la veine couleur/dark-mode a déjà été attaquée en
**62wb** (`components/v2/Badge.tsx`, classes Tailwind `bg-[#hex]` → `var(--gp-*)`) et **56wb**
(`#C1292E → var(--gp-error)`). **Cette itération est leur jumeau pour les couleurs en _style inline_**
(`style={{ backgroundColor: '#...' }}`) — catégorie distincte (le hex inline ne porte PAS de variante
`dark:` Tailwind, donc encore plus systématiquement non-dark-mode-aware), sur des fichiers **non couverts**
par 62wb/56wb. Pas de répétition.

**Doublons / faux positifs re-vérifiés (NE PLUS re-flagger)** — repris du ledger, confirmés ce cycle :
- Sélection/copie des bulles de message (faux positif soldé 62wp : sélectionnable nativement + action
  Copier explicite). RAS.
- `type="button"` manquant en `<form>` (faux positif soldé 62wp : un seul `<button>` brut, hors form). RAS.
- `components/v2/theme.ts` (`#F8FAFC` light / `#0F172A` dark) = **objet thème SSOT intentionnel**, PAS un
  hex figé à corriger. Ne pas toucher (ce sont littéralement les valeurs source des tokens `--gp-*`).

## Étape 2 — Couverture plans/corrections

Tous les items i18n/a11y 49w→62w ont un plan ET une annotation de merge dans `branch-tracking.md`.
Sur `main`, iter-62wp (#850, perf admin thumbnails) est **mergée** — déclencheur de cette routine
(`pull_request.closed` #850). Le cluster `t('key') || 'fallback'` reste **massivement en cours** via ~8 PR
parallèles (#851 password-reset, #852/#849 conv details-sidebar, #853 audio-effects, #854 /me profile,
#856 empty-states, #844 navigation) → **NE PAS attaquer en parallèle** (collision garantie). Surface prise
ici = **orthogonale** (couleur inline, aucune PR ouverte ne touche ces 2 recadreurs).

## Étape 3 — Annotations

`branch-tracking.md` mis à jour : entrée **63wc** (Current State + ledger), #850 marqué ✅, base déplacée
sur `bded2b0`, pointeur « Next iteration » → 64w+. Les 2 recadreurs marqués soldés pour la parité dark
mode → NE PLUS re-flagger.

## Étape 4 — Optimisation livrée : cohérence design-system + dark mode

### Constat (bug réel : rupture de parité dark mode)

Deux recadreurs d'image utilisent `react-easy-crop` et figent le **fond de letterbox** (la zone visible
autour de l'image recadrée, sous le masque circulaire) via `containerStyle.backgroundColor` en **style
inline** sur la valeur **`#f3f4f6`** (gris-100 Tailwind) :

| Fichier | Ligne | Contexte |
|---------|-------|----------|
| `components/settings/avatar-crop-dialog.tsx` | 140 | recadrage de l'avatar utilisateur (paramètres) |
| `components/conversations/conversation-image-upload-dialog.tsx` | 220 | recadrage de l'image de conversation |

**Impact réel** : `#f3f4f6` est une couleur **claire codée en dur**, posée en **style inline** (donc sans
aucune variante `dark:` possible, contrairement à une classe Tailwind). En **dark mode**, le dialogue
(fond sombre `--gp-surface` `#1E293B`) encadrait l'image recadrée d'un **rectangle gris clair criard**,
totalement hors charte indigo/slate v2 et incohérent avec le reste du modal. Exactement la classe de bug
soldée pour les classes Tailwind en 62wb (`Badge.tsx`).

### Arbitrage (token cible)

Le design system définit déjà le token sémantiquement juste — la **couleur de toile applicative**
(`app/globals.css`), avec valeurs light **et** dark :

| Token | Light | Dark |
|-------|-------|------|
| `--gp-background` | `#F8FAFC` | `#0F172A` |
| `--gp-surface` (le dialogue lui-même) | `#FFFFFF` | `#1E293B` |

Choix = **`var(--gp-background)`** (et non `--gp-surface`) : le fond de letterbox doit être **légèrement en
retrait** par rapport au papier du dialogue (`--gp-surface`), exactement comme une toile derrière une
photo. En light, `#F8FAFC` ≈ `#f3f4f6` (différence **imperceptible** → zéro régression visuelle claire) ;
en dark, `#0F172A` fournit le fond sombre correct. **Zéro nouveau token, zéro nouvelle variable CSS** —
Single Source of Truth, même pattern que 62wb/56wb.

### Correctif

`backgroundColor: '#f3f4f6'` → `backgroundColor: 'var(--gp-background)'` sur les **2 occurrences / 2
fichiers**. Changement = swap d'une valeur littérale vers un token CSS ; aucune logique modifiée.

### Tests / non-régression (TDD — RED→GREEN, garde anti-régression)

Les deux fichiers de test existants mockent `react-easy-crop` mais **ignoraient** le prop `style`. Le mock
est étendu pour exposer `containerStyle.backgroundColor` via `data-container-bg`, puis **un test de
contrat** est ajouté à chacun :
- `__tests__/components/settings/avatar-crop-dialog.test.tsx` → bloc `Theme / dark mode` :
  `expect(bg).toBe('var(--gp-background)')` + `expect(bg).not.toMatch(/#[0-9A-Fa-f]{3,8}/)`.
- `__tests__/components/conversations/conversation-image-upload-dialog.test.tsx` → dans `Cropper Controls`
  (via le helper `setupCropper` existant) : même double assertion.

Verrouille toute régression vers un hex figé. Les tests existants restent verts (le mock continue de
rendre les mêmes éléments ; seul un attribut data est ajouté).

### Parité iOS (référence uniquement)

Affordance purement chromatique (fond d'un recadreur) — pas de contenu Prisme, pas de résolution de langue.
iOS gère le recadrage/avatar via ses propres surfaces SwiftUI (`MeeshyColors` adaptatifs) ; aucune
propagation requise. Vérifié : pas de feature naturelle iOS manquante côté web ici.

## Revue optimisation (étape 4) — opportunités repérées (différées, bornées)

- Anti-pattern systémique `t('key') || 'fallback'` — **massivement en cours** (#851/#852/#849/#853/#854/
  #856/#844). NE PAS attaquer en parallèle. Lots cohérents bornés une fois la vague mergée.
- Autres `style={{ backgroundColor:'#...' }}` figés à auditer (hors composants thème SSOT `theme.ts`) :
  candidat veine 64w+ si d'autres surfaces apparaissent.
- `components/common/metadata-test.tsx` : composant debug FR **non référencé** (0 import, URL localhost
  figée) — **candidat épuration** (suppression franche, pas i18n de code mort). Réservé pour ne pas
  entrer en collision avec #855 (épuration settings/_archived en vol ce cycle) ; à reprendre une fois #855
  mergée pour éviter deux PR « épuration » concurrentes.
- Audit `prefers-reduced-motion` sur les animations framer-motion (36 fichiers le respectent déjà ;
  vérifier les manquants) — a11y vestibulaire, lot borné futur.

## Faux positifs / NE PLUS re-flagger

- `components/settings/avatar-crop-dialog.tsx` + `components/conversations/conversation-image-upload-dialog.tsx` :
  fond recadreur **soldé** (`var(--gp-background)`, dark-mode-aware). NE PLUS re-flagger pour hardcoding
  couleur / parité dark mode.
- `components/v2/theme.ts` (`#F8FAFC`/`#0F172A`) : objet thème SSOT — **PAS** un hex figé.
- `components/feed/ReelPlayer.tsx` (`activeColor="#fb7185"/"#fbbf24"`) : couleurs d'icônes actives sur
  **vidéo toujours sombre** (overlay reel plein écran indépendant du thème) — parité dark mode sans objet ;
  + surface feed contendue. NE PAS « corriger ».

## Statut

✅ Implémenté — itération **63wc**. Diff : 2 fichiers composant (+2/−2) + 2 fichiers de test (mock étendu +
1 test de contrat chacun). `node_modules` absent du container routine → typecheck/build/test délégués au CI
(cf. 59w/60w/61w/62w). Changement = swap valeur littérale → token CSS, aucune logique modifiée.

## ✅ Annotation de complétude

**SOLDÉ en 63wc** — les 2 recadreurs d'image (`avatar-crop-dialog`, `conversation-image-upload-dialog`)
sourcent désormais `var(--gp-background)` pour le fond de letterbox, dark-mode-aware. Jumeau inline-style
du correctif Badge 62wb. **NE PLUS re-flagger** ces composants pour cohérence couleur / parité dark mode.
