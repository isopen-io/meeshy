# Iteration 240 — `isValidEmoji` rejetait les emojis modernes courants (teint, ZWJ, drapeaux) ET acceptait `'1️'` : bascule sur `\p{RGI_Emoji}`

## Protocole (démarrage)
`main` @ `02ac20d9` (dernier commit : `Merge PR #3282 — le rejet de la bannière
d'épingle était un booléen collant [cycle 80]`). Branche
`claude/brave-archimedes-cr0ocg` alignée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), `npx prisma generate --generator client` + `bun run build` dans
`packages/shared`. Suite shared vitest verte au départ : **2356/2356**.

**Audit anti-doublon** (21 PRs ouvertes au départ, série `brave-archimedes` +
`upbeat-dirac` + dependabot). Deux chasseurs de bugs (subagents) ont balayé en
parallèle `packages/shared` et `services/gateway/src/validation` en évitant
explicitement les fichiers déjà couverts par une PR ouverte
(`language-normalize.ts` #3280, `time-remaining.ts` #3259, `concurrency.ts` (chunk)
#3253, `attachment-validators.ts` (timeRange) #3243, `river-lanes.ts` #3270,
`role-types.ts` #3249, `notification-strings.ts`/`attachment.ts` (formatFileSize)
#3275, SignalSchemas #3266, MyMentions clamp #3255, call-schemas #3236). **Aucune PR
ouverte ne touche `packages/shared/types/reaction.ts`** — zéro chevauchement de
fichier.

## Sélection : **Priorité 1 — durcissement d'une frontière de confiance sur une
feature à fort trafic (gate de réaction emoji), correctness bidirectionnelle**

`isValidEmoji` / `sanitizeEmoji` (`packages/shared/types/reaction.ts`) sont le gate
serveur qui décide quels emojis de réaction sont persistés. Les QUATRE consommateurs
sont des services gateway (`ReactionService`, `PostReactionService`,
`CommentReactionService`, `AttachmentReactionService`) — **aucun appel côté client
web/iOS**. Un seul point de vérité, à fort trafic (réactions messages + posts +
commentaires + pièces jointes).

## Current state (avant correctif)

```ts
export function isValidEmoji(emoji: string): boolean {
  const emojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}️)$/u;
  return emojiRegex.test(emoji.trim());
}
```

La regex ne matche qu'UN SEUL code point (optionnellement + `U+FE0F`). C'est faux
dans les DEUX sens, vérifié empiriquement sur Node 22 ET bun 1.3 (les deux runtimes CI) :

### A) Faux positif — contredit l'intention testée de la fonction
La branche `\p{Emoji}️` ré-admet exactement les chiffres/symboles que le test
`isValidEmoji('1') === false` (reaction.test.ts:69-72) déclare vouloir rejeter, dès
qu'on leur colle un `U+FE0F` :
- `isValidEmoji('1️')` → **`true`** (devrait être `false`). Idem `'0️'`…`'9️'`, `'#️'`, `'*️'`.
- Conséquence : le gateway PERSISTE `'1️'` comme « réaction emoji valide ».

### B) Faux négatif — bloque les réactions modernes les plus courantes
Toute séquence emoji multi-code-points est rejetée :
- `isValidEmoji('👍🏽')` → **`false`** (pouce + modificateur de teint Fitzpatrick — l'une des réactions les PLUS courantes)
- `isValidEmoji('👩‍💻')` → **`false`** (séquences ZWJ : métiers, familles…)
- `isValidEmoji('🇫🇷')` → **`false`** (drapeaux régionaux)
- `isValidEmoji('#️⃣')` → **`false`** (keycaps)

L'utilisateur qui tente de réagir avec l'un de ceux-là reçoit `Invalid emoji` du gateway.

## Problems identified
1. **Gate de réaction rejette les emojis modernes courants.** Teint, ZWJ, drapeaux,
   keycaps — le jeu exact qu'un emoji-picker moderne (WhatsApp, Slack, iMessage)
   présente — sont tous refusés. Écart de parité concurrentielle direct.
2. **Faux positif symétrique.** `'1️'` / `'*️'` (chiffre/symbole + sélecteur de
   variante) passent, alors qu'ils ne sont PAS des emojis autonomes (seule la
   séquence keycap complète `'1️⃣'` = chiffre + FE0F + U+20E3 l'est).
3. **Regex énumère un base code point** au lieu de matcher un grapheme emoji RGI ;
   sa branche `\p{Emoji}️` est trop permissive (admet `0-9`, `#`, `*`, tous
   porteurs de la propriété `Emoji` mais pas emojis autonomes).

## Root causes
La regex a été écrite « un emoji = un code point (+ FE0F optionnel) » avant que la
propriété de string `\p{RGI_Emoji}` (ES2024, drapeau `v`) ne soit disponible et
supportée par le runtime. Le modèle mono-code-point ne peut structurellement pas
décrire une séquence RGI (teint, ZWJ, régional, keycap), et sa relaxe `\p{Emoji}️`
laisse fuir les bases non-emoji.

## Business impact
- **Réel et immédiat.** Les réactions à teint de peau et les drapeaux sont un usage
  quotidien massif ; les refuser dégrade l'expérience et rompt la parité avec tout
  concurrent. Le faux positif `'1️'` pollue les agrégations de réactions avec des
  jetons non-emoji.
- Server-only : aucun risque de compat navigateur (le gate ne tourne QUE côté gateway).

## Technical impact
- **Fix :** `const emojiRegex = new RegExp('^\\p{RGI_Emoji}$', 'v');`
  `\p{RGI_Emoji}` est une propriété de STRING → drapeau `v` obligatoire (ES2024).
- **Pourquoi `new RegExp` et pas un littéral :** la cible tsc du package `shared` est
  ES2020 ; un littéral `…/v` déclenche `TS1501` (« flag only available when targeting
  es2024 or later »). `new RegExp(..., 'v')` contourne le check du COMPILATEUR (tsc ne
  valide que les littéraux) sans changer la cible du package — et le RUNTIME (Node 22
  + bun 1.3, les deux consommateurs) supporte pleinement le drapeau `v`. Vérifié sur
  les deux runtimes.
- **Comportement, prouvé empiriquement (accepte / rejette) :**
  accepte `😀 👍 🔥 ⭐ 🚀 🎉 💯 ❤️ 👍🏽 👩‍💻 🇫🇷 #️⃣` ;
  rejette `1 1️ 0️ #️ *️ hello a '' '   ' 😀😀 😀abc 👍👎`.
- **Interaction avec le cap de longueur `.max(10)`** (`socket-event-schemas.ts`) : les
  cas courants tiennent tous sous 10 unités UTF-16 (`👍🏽`=4, `🇫🇷`=4, `👩‍💻`=5,
  `#️⃣`=3, `❤️`=2). Seules les séquences ZWJ extrêmes (famille 4 personnes
  `👨‍👩‍👧‍👦`=11) restent plafonnées par ce cap séparé et préexistant — hors périmètre
  (voir Améliorations futures).
- **`tsc` :** 0 erreur (le `new RegExp` est une string, pas un littéral typé).
- **Pas de duplication à unifier.** `EMOJI_REGEX` de `MessageTranslationService.ts`
  matche un message ENTIÈREMENT emoji (heuristique skip-traduction, `+`, inclut `\s`)
  — sémantique distincte, pas un doublon de `isValidEmoji`.

## Risk assessment
- **Faible.** Server-only (4 services gateway, Node 22/bun). Le fix est strictement
  plus correct dans les deux sens : plus permissif envers les emojis LÉGITIMES,
  strictement moins permissif envers le faux positif `'1️'`. Aucun test ne pose de
  séquence corrompue ; les cas conservés (`hello`, `''`, `'   '`, `'😀😀'`, `'😀abc'`,
  `'👍👎'`) restent rejetés à l'identique.
- **Test flip assumé :** l'assertion `rejects a flag sequence` (reaction.test.ts:88-90,
  ancienne) documentait une LIMITATION de la regex (« cannot match single-unit regex »),
  pas une règle produit. Elle est remplacée par `accepts a regional-indicator flag
  sequence` dans un nouveau bloc `valid multi-code-point emoji (RGI sequences)`.
- **Rollback :** restaurer le littéral mono-code-point et l'assertion de rejet de drapeau.

## Proposed improvements (implémenté)
1. **RED** (reaction.test.ts) : +4 acceptations (teint, ZWJ, drapeau, keycap) + 2
   rejets de faux positif (`'1️'`, `'*️'`) + 2 `sanitizeEmoji` (teint, drapeau) →
   8 tests rouges sur `main`. L'assertion de rejet de drapeau est déplacée en
   acceptation.
2. **GREEN** (reaction.ts) : littéral mono-code-point → `new RegExp('^\\p{RGI_Emoji}$', 'v')`
   + docstring citant la cible tsc ES2020, la raison du `new RegExp`, et le périmètre
   server-only.

## Expected benefits
- Les réactions à teint de peau, ZWJ, drapeaux et keycaps sont enfin acceptées —
  parité avec tout messager moderne.
- Le faux positif `'1️'` / `'*️'` est fermé : plus de jetons non-emoji persistés.
- Un seul point de vérité RGI-canonique pour « est-ce un emoji valide ».

## Implementation complexity
**Faible.** 1 fichier de production (1 regex + docstring), 1 fichier de test
(+8 tests net, 1 assertion déplacée).

## Validation criteria
- [x] RED prouvé : 8 tests rouges sur `main` avant correctif.
- [x] GREEN : `reaction.test.ts` 38/38 verts.
- [x] Suite shared vitest complète : **2363/2363** (2356 baseline + 7 net).
- [x] `bun run build` (tsc shared) : 0 erreur — `dist/types/reaction.js` porte le fix.
- [x] Gateway end-to-end : suites `(Reaction|reaction)` **640/640** (27 suites) —
      les 4 services consommateurs restent verts sur le `dist` reconstruit.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)
- **Cap `.max(10)` sur `emoji`** (`socket-event-schemas.ts`, `validation.ts`) : plafonne
  les séquences ZWJ extrêmes (famille 4 personnes = 11 unités UTF-16). Décision produit
  à peser : relever le cap (ex. `.max(32)`) pour couvrir toutes les séquences RGI, OU
  l'assumer. À traiter séparément (change un contrat de wire).
- **`EMOJI_REGEX` de `MessageTranslationService.ts`** : heuristique emoji-only distincte ;
  pourrait bénéficier d'une revue RGI propre si la détection skip-traduction se révèle
  imprécise sur les séquences modernes — analyse dédiée requise (sémantique `+`/`\s`).
- **Parité `v`-flag ailleurs :** auditer si d'autres validations shared « un emoji »
  existent côté web (aucune trouvée ici) — si oui, préférer un helper partagé plutôt
  qu'une regex `v`-flag dupliquée (le `v`-flag throw sur navigateurs < mi-2023).
