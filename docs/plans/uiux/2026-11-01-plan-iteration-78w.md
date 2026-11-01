# Plan — Itération 78w (Web)

**Analyse appariée** : `docs/analyses/uiux/2026-11-01-iteration-78w.md`
**Base** : `origin/dev` · **Cible PR** : `dev` · **Branche** : `claude/practical-fermat-0tzqfi`

## Objet

a11y / i18n — traduire les noms accessibles des pastilles de palier (`TierDots`),
écrits en dur en français, pour les sept langues d'interface.

## Étapes (TDD)

1. **RED** — `routes/progression-tier-dots-i18n.test.tsx` : rend `<TierDots>` en EN
   et FR, exige des `aria-label` traduits (EN) et le câblage FR conservé. Échoue
   (rendu mi-anglais mi-français).
2. **GREEN** —
   - `lib/view/progression.ts` : `tierListLabel(axis)` + `tierDotLabel(tier)`
     (pending / reached / reached_on), `threshold` brut.
   - `catalog-game-concept-{fr,en,es,pt,de,it,ar}.ts` : 4 clés
     `game.progression.tier.{list,reached,reached_on,pending}` (partie `concept`).
   - `routes/progression-parts.tsx` : `TierDots` appelle les deux helpers.
   - `routes/progression-interface-language.test.tsx` : regex `FRENCH` durcie
     (`Paliers de|atteint|à atteindre`).
3. **Gates** — `bun test` (suites Progression + catalogue), `type-check`,
   `check-design-harmony.mjs`.

## État : ✅ LIVRÉ (voir annotation de l'analyse appariée)

- 192/192 tests ciblés GREEN · type-check 0 erreur · harmonie 92/9 inchangé.
- Pistes de suite : voir § « Pistes 79w+ » de l'analyse.
