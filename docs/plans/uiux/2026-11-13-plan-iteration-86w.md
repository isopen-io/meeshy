# Plan — itération 86w (web)

**Analyse** : `docs/analyses/uiux/2026-11-13-iteration-86w.md`
**Axe** : cohérence de positionnement (6) + maintenabilité (11), gate d'harmonie #8879.
**Branche** : `claude/practical-fermat-u8t5dq` → PR vers `dev`.

## Problème

Le bouton d'envoi de marque est recopié en **trois jumelles divergentes** :
`composer.tsx` (envoi), `composer-tray.tsx` (envoi vocal), `message-edit-composer.tsx`
(soumission d'édition). Même fond
`linear-gradient(135deg, var(--accent), color-mix(…, white))`, même encre `text-white`.
Deux des trois sont hors périmètre du gate (`composer*`) : une divergence silencieuse y
passerait. Les deux littéraux de `message-edit-composer` (scanné) comptent au gate.

## Correction (TDD)

1. **RED** : describe « le bouton d'envoi » dans `check-design-harmony.test.ts` —
   `scanSource(message-edit-composer) → []` + trois sites ⊇ `var(--send-accent-fill)` /
   `text-ios-on-brand`, ⊄ dégradé local.
2. **GREEN** :
   - Jeton composé `--send-accent-fill` sur `:root` (`styles/app.css`), dérivé de
     `var(--accent)`, voisin des `--recording-*` / dans l'esprit de `--onb-brand`.
   - Trois boutons → `background: var(--send-accent-fill)` + glyphe `text-ios-on-brand`
     (= `--ios-on-brand` = `#fff`, byte-identique).

## Preuve

- `check-design-harmony.test.ts` : 33 → **36** GREEN.
- `message-edit-composer` / `composer` / `composer-tray` / `-heif` / `declared-tokens` :
  **52** GREEN (non-régression).
- Gate `check-design-harmony.mjs` : **10 → 8** violations (−2), 8 → 7 fichiers.
- `tsc --noEmit` : 0.

## Critère de fin

PR verte fusionnée dans `dev` ; analyse annotée `✅ CORRIGÉ (iter-86w)` ; pointeur
`web-iteration-pointer.md` mis à jour ; prochaine itération **87w** (pistes en pied
d'analyse : `message-menu` masque de luminance, `thread-header-*` `#fff`, etc.).

## ✅ Statut : LIVRÉ (iter-86w)
