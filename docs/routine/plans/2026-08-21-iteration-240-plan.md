# Plan d'implémentation — Iteration 240 : `isValidEmoji` → `\p{RGI_Emoji}`

## Objectifs
Corriger le gate de validation d'emoji de réaction (`packages/shared/types/reaction.ts`)
pour qu'il :
1. ACCEPTE tout grapheme emoji RGI valide (teint, ZWJ, drapeaux, keycaps) — actuellement rejetés.
2. REJETTE les faux positifs `'1️'`, `'*️'` (base non-emoji + sélecteur de variante) — actuellement acceptés.

## Modules affectés
- `packages/shared/types/reaction.ts` — `isValidEmoji` (consommé par `sanitizeEmoji`).
- `packages/shared/__tests__/types/reaction.test.ts` — couverture.
- Consommateurs (inchangés, vérifiés verts) : `services/gateway/src/services/{ReactionService,PostReactionService,CommentReactionService,AttachmentReactionService}.ts`.

## Phases d'implémentation
1. **RED** — encoder le comportement correct dans `reaction.test.ts` :
   - Nouveau bloc `valid multi-code-point emoji (RGI sequences)` : `👍🏽`, `👩‍💻`, `🇫🇷`, `#️⃣`.
   - Bloc `invalid inputs` : +`'1️'` (digit+FE0F), +`'*️'` ; l'ancienne assertion « rejects a flag » est déplacée en acceptation ; commentaire du cas deux-emojis reformulé « single RGI grapheme ».
   - `sanitizeEmoji` : +teint (`👍🏽`), +drapeau (`🇫🇷`).
   → 8 rouges sur `main`. **Fait.**
2. **GREEN** — `reaction.ts` : littéral `/^(\p{Emoji_Presentation}|\p{Emoji}️)$/u`
   → `new RegExp('^\\p{RGI_Emoji}$', 'v')` + docstring (raison `new RegExp` vs TS1501, périmètre server-only). **Fait.**
3. **Validation** — build shared, suite complète, gateway reaction e2e. **Fait.**

## Dépendances
Aucune. `\p{RGI_Emoji}`/`v` supportés par Node 22 + bun 1.3 (runtimes CI + gateway) ;
`new RegExp` évite le bump de cible tsc (ES2020 → ES2024).

## Risques estimés
- **Faible.** Server-only (aucun appel client). Strictement plus correct dans les deux sens.
- Test flip unique (rejet drapeau → acceptation drapeau) : l'ancienne assertion documentait
  une limitation d'implémentation, pas une règle produit.

## Stratégie de rollback
Restaurer le littéral mono-code-point et l'assertion de rejet de drapeau. Aucun schéma /
API / migration touché.

## Critères de validation
- [x] RED : 8 tests rouges sur `main`.
- [x] `reaction.test.ts` : 38/38.
- [x] Suite shared vitest : 2363/2363.
- [x] `bun run build` (tsc) : 0 erreur ; `dist` porte le fix.
- [x] Gateway `(Reaction|reaction)` : 640/640 (27 suites).
- [ ] CI verte sur la PR.

## Statut de complétion
**Implémenté et validé localement.** En attente CI.

## Suivi de progression
- 2026-08-21 : RED → GREEN → validation complète. Docs analyse + plan posées. Push branche.

## Améliorations futures
- Décision produit sur le cap `emoji .max(10)` (séquences ZWJ extrêmes).
- Revue RGI éventuelle de `EMOJI_REGEX` (heuristique emoji-only, `MessageTranslationService`).
