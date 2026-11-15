# Plan — Itération 74w (web) : i18n du flux de connexion par lien magique

> Application WEB uniquement (`apps/web`). Base : `origin/dev`. Cible PR : `dev`
> (voir `docs/plans/uiux/web-iteration-pointer.md` pour la doctrine de branche).

## Objectif
Faire parler le flux de connexion par lien magique la langue de l'interface, sur
ses trois surfaces, sans changer ce que voit un lecteur francophone.

## Étapes (faites)
1. **Catalogue** — 11 clés `magicLink.*` (flowTitle, validating, invalid.title,
   invalid.body, requestNew, backToLogin, retry, resend, resend.label, cancel,
   linkExpired) ajoutées aux 7 `catalog-{lang}-public-entry.ts`. `fr` ≡ littéraux
   historiques. → parité `i18n-catalog.test.ts` verte.
2. **Témoin (RED→GREEN)** — `components/magic-link-i18n.test.tsx` : rendu interface
   = `en`, assertions texte catalogue + absence du français.
3. **Câblage** — `translate(currentInterfaceLanguage(), clé)` dans
   `magic-link-validation.tsx` (6), `magic-link-panel.tsx` (4),
   `magic-link-flow.tsx` (1).
4. **Vérification** — type-check, suites auth non-régression, design-harmony.

## Gates
- `bun test` (nouvelle suite + catalogue + non-régression auth) : vert.
- `bun run type-check` : vert.
- CI web (gate composite) à surveiller sur la PR.

## Continuité
- Mise à jour de `docs/plans/uiux/web-iteration-pointer.md` (dernière branche,
  base, prochaine itération 75w).
- Annotation `## ✅ Statut : CORRIGÉ (iter-74w)` dans l'analyse.
