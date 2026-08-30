# Itération 281 — la borne de LONGUEUR d'un emoji rejette les emojis RGI valides (famille, couple, multi-personnes teintés) et diverge sur 11 sites

Suivi implicite du travail RGI de `isValidEmoji` (`packages/shared/types/reaction.ts`).
Classe « cette entité a-t-elle une jumelle ? on la prend en entier » + « une SSOT
retapée à chaque site » du `CLAUDE.md`.

## État actuel

La validité d'un emoji de réaction a une SSOT unique et moderne :
`isValidEmoji()` (`packages/shared/types/reaction.ts`) accepte **UN** grapheme
emoji RGI (`\p{RGI_Emoji}`, ES2024) — modificateur de teint (`👍🏽`), ZWJ
(`👩‍💻`), drapeaux régionaux (`🇫🇷`), keycaps (`#️⃣`), et les séquences
multi-personnes (famille `👨‍👩‍👧‍👦`, couple `👩‍❤️‍💋‍👨`). Le commentaire
de la fonction dit explicitement que l'ancienne regex mono-code-point
« bloquait au portillon de réaction les emojis les plus courants ».

À CÔTÉ de cette validité de FORMAT, une borne de LONGUEUR est posée sur le champ
`emoji` de chaque frontière (Zod `.max()`, qui compte les **unités UTF-16**,
c.-à-d. `String.length`). Cette borne est **dupliquée sur 11 sites** et
**diverge** :

| site | borne |
|---|---|
| `packages/shared/utils/validation.ts:1306` (REST reaction add) | `.max(10)` |
| `services/gateway/.../socket-event-schemas.ts` ×8 (les 4 familles add/remove) | `.max(10)` |
| `services/gateway/.../routes/posts/types.ts:516` (LikeSchema) | `.max(10)` |
| `services/gateway/.../routes/posts/types.ts:544` (UnlikeSchema) | `.max(10)` |
| `services/gateway/.../routes/posts/types.ts:132` (story sticker) | `.max(16)` |

## Problèmes identifiés

1. **La borne `max(10)` REJETTE des emojis RGI valides.** Mesuré (unités UTF-16) :

   | emoji | unités | RGI valide | `max(10)` passe |
   |---|---|---|---|
   | famille `👨‍👩‍👧‍👦` | 11 | ✅ | ❌ |
   | couple bisou `👩‍❤️‍💋‍👨` | 11 | ✅ | ❌ |
   | couple bisou teinté `👩🏽‍❤️‍💋‍👨🏼` | **15** | ✅ | ❌ |
   | poignée de main teintée `🧑🏻‍🤝‍🧑🏿` | 12 | ✅ | ❌ |

   Le champ `isValidEmoji` (SSOT) les accepte tous ; la borne de longueur les
   refuse AVANT que la SSOT ne s'exécute. C'est **exactement le portillon que le
   travail RGI a levé au niveau du FORMAT**, réintroduit une couche plus haut au
   niveau de la LONGUEUR. Un utilisateur ne peut littéralement pas réagir avec
   l'emoji famille sur AUCUNE surface (message, commentaire, post, pièce jointe).

2. **La borne DIVERGE (10 vs 16).** Le sticker de story admet 16, les réactions
   10. Deux nombres pour la même question — « combien d'unités fait un emoji ? » —
   dont aucun n'est justifié par la mesure, et le plus courant (10) est faux.

3. **Aucune SSOT.** La borne est un littéral retapé 11 fois ; le jour où
   Unicode ajoute une séquence plus longue, il faut retrouver 11 sites.

## Causes racines

La borne de longueur date d'AVANT le passage à `\p{RGI_Emoji}` : `10` couvrait
l'emoji simple (`😀` = 2) et l'ancienne définition mono-code-point, mais pas les
séquences RGI multi-personnes que la nouvelle SSOT admet. Le correctif RGI a
élargi la validité de FORMAT sans re-mesurer la borne de LONGUEUR qui le
précède — la borne est restée calibrée sur l'ancien monde.

## Impact métier / technique

Un geste produit NOMINAL (réagir avec un emoji famille/couple, présent dans tout
picker moderne) échoue avec `Validation failed` sur les quatre familles de
contenu réagissable et sur les likes de post. Le plus long emoji RGI courant
(15 unités) est refusé avec une marge de 5. Défaut de complétude (dimension 13)
et de simplicité d'usage (dimension 12) : la complexité UTF-16 fuit jusqu'à
l'utilisateur sous la forme d'un refus inexpliqué.

## Évaluation du risque

Faible. Le correctif ne fait qu'ÉLARGIR l'ensemble accepté par la borne de
longueur (aucun emoji aujourd'hui accepté ne devient rejeté), et la validité de
FORMAT (RGI, unicité du grapheme) reste inchangée : une charge forgée non-emoji
est toujours refusée par `isValidEmoji` au niveau du service. La borne reste une
défense en profondeur bon marché (cap avant la regex), simplement calibrée sur
la mesure réelle.

## Amélioration proposée

Une SSOT `EMOJI_MAX_LENGTH` dans `packages/shared/types/reaction.ts`, à côté de
`isValidEmoji` (même fichier, même responsabilité : ce qu'est un emoji de
réaction). Valeur `32` : admet le plus long emoji RGI mesuré (15 unités) avec une
marge confortable pour les futures séquences Unicode, tout en restant un cap
serré contre une charge abusive. Les 11 sites référencent la constante.

## Bénéfices attendus

- Le geste « réagir avec un emoji famille/couple/teinté » réussit partout.
- Une seule valeur à faire évoluer (SSOT) au lieu de 11 littéraux.
- La borne de longueur cesse de contredire la SSOT de validité.

## Complexité d'implémentation

Faible — une constante exportée, 11 références, tests ciblés.

## Critères de validation

1. RED : `SocketReactionAddSchema.safeParse({ …, emoji: '👨‍👩‍👧‍👦' })` échoue
   avant le correctif, réussit après.
2. `EMOJI_MAX_LENGTH >= 15` (admet le plus long RGI mesuré).
3. Les tests existants de la suite `socket-event-schemas` et `reaction` passent
   (borne « exceeds » recalibrée au-delà de la nouvelle valeur).
4. `bun run build` du shared + `tsc` gateway verts ; suites jest/vitest vertes.
