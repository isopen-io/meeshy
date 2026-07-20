# Plan de correction — Itération 63wc (web)

**Objectif** : parité dark mode des recadreurs d'image — supprimer le fond de letterbox figé
`#f3f4f6` (style inline, jamais dark-mode-aware) au profit du token `var(--gp-background)`.

## Contexte / contraintes

- **Web uniquement** (`apps/web`). iOS référence seulement.
- **Forte contention i18n** ce cycle (≥8 PR `t()||fallback` en vol) → surface **orthogonale** (couleur
  inline), aucune PR ouverte ne touche ces 2 fichiers.
- Base : `main` HEAD `bded2b0` (post-#850). Branche : `claude/practical-fermat-lxjyk5`.

## Étapes

1. [x] **RED** — étendre le mock `react-easy-crop` des 2 tests pour exposer
   `style.containerStyle.backgroundColor` via `data-container-bg`, puis ajouter un test de contrat
   asserrant `var(--gp-background)` et l'absence de hex.
2. [x] **GREEN** — `avatar-crop-dialog.tsx:140` et `conversation-image-upload-dialog.tsx:220` :
   `backgroundColor: '#f3f4f6'` → `'var(--gp-background)'`.
3. [x] **Annotations** — `branch-tracking.md` (Current State + ledger + base + Next), analyse 63wc.
4. [ ] Commit + push sur `claude/practical-fermat-lxjyk5`.
5. [ ] PR vers `main`, auto-merge à CI vert. Mettre à jour le ledger (#PR, ✅) au merge.

## Cible token

| Avant | Après | Light | Dark |
|-------|-------|-------|------|
| `#f3f4f6` (inline) | `var(--gp-background)` | `#F8FAFC` (≈ identique) | `#0F172A` (corrige) |

## Fichiers touchés (strictement bornés)

- `apps/web/components/settings/avatar-crop-dialog.tsx` (+1/−1)
- `apps/web/components/conversations/conversation-image-upload-dialog.tsx` (+1/−1)
- `apps/web/__tests__/components/settings/avatar-crop-dialog.test.tsx` (mock + 1 test)
- `apps/web/__tests__/components/conversations/conversation-image-upload-dialog.test.tsx` (mock + 1 test)
- `docs/analyses/uiux/2026-06-22-iteration-63wc.md`, `docs/plans/uiux/{ce fichier, branch-tracking.md}`

## Hors périmètre / NE PAS toucher

- `components/v2/theme.ts` (objet thème SSOT). `ReelPlayer.tsx` (overlay toujours sombre + feed contendu).
- Tout `t()||fallback` (contention massive). `metadata-test.tsx` épuration (réservé post-#855).
