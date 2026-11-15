# Plan d'itération 80w — source unique de l'accent de repli de marque (`#6366F1` ×3)

**Date** : 2026-11-07 · **Périmètre** : `apps/web` (consomme `@meeshy/shared`) · **Base** : `origin/dev`
**Analyse appariée** : `docs/analyses/uiux/2026-11-07-iteration-80w.md`

## Problème

Trois surfaces web réécrivaient l'indigo de marque `#6366F1` **en dur** comme accent de
repli de `authorAccentColor()` : `routes/profile-sections.tsx` (`DECOR_ACCENT`),
`components/decor-preview.tsx` et `components/pack-sheet.tsx` (`FALLBACK_ACCENT`). Trois
jumelles divergeant en silence si la marque changeait — violation de « UNE source de
vérité » (dim. 11) et de la cohérence (dim. 6).

## Étapes (TDD, RED → GREEN)

1. **RED (shared)** — `packages/shared/__tests__/conversation-colors.test.ts` : attendre
   `DEFAULT_AUTHOR_ACCENT` (hex, `#6366F1`, **∈ `VIBRANT_PALETTE``). ✅ échoue (exports
   absents).
2. **GREEN (shared)** — `conversation-colors.ts` : exporter `VIBRANT_PALETTE` et
   `DEFAULT_AUTHOR_ACCENT = '#6366F1'` (doc-comment liant iOS `indigo500` /
   `--ios-indigo-500` / palette). Rebuild `dist` (gitignored, CI le refait).
3. **RED (web)** — `components/decor-accent-single-source.test.ts` : `DECOR_ACCENT ===
   DEFAULT_AUTHOR_ACCENT` + `scanSource` des 3 fichiers = `[]`. ✅ échoue (3 hits).
4. **GREEN (web)** — les 3 fichiers importent `DEFAULT_AUTHOR_ACCENT` ; `DECOR_ACCENT =
   DEFAULT_AUTHOR_ACCENT` ; les 2 `FALLBACK_ACCENT` supprimés.
5. **Gates** : `vitest` (shared), `bun test` (web + profil), `bun run type-check`,
   `check-design-harmony.mjs` (doit baisser).

## Critère de fin

- Témoins verts (shared 45/45, web 4/4), suites profil/décor vertes, type-check 0 erreur.
- Harmonie : **94 → 91** (−3 exactement), 11 → 8 fichiers.
- Plus aucun littéral `#6366F1` d'accent de repli dans les trois surfaces ; une seule
  source partagée.

## Statut : ✅ LIVRÉ (iter-80w) — voir annotation de l'analyse appariée.
