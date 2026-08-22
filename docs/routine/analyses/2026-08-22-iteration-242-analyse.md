# Iteration 242 — `removingHandle` crashait (`SyntaxError`) sur TOUT username à tiret : la copie locale de `escapeRegex` avait dérivé du SSOT

## Protocole (démarrage)
`main` @ `e847456d` (dernier commit : `feat(android): conversation-lock master PIN change + remove flows (#3313)`).
Branche `claude/brave-archimedes-mmfvks` recréée depuis `origin/main` (0 avance / 0 retard) au
départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (exit 0), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared` (tous verts).
Suite `packages/shared` verte au départ (98 fichiers, 2370 tests).

**Audit anti-doublon** (20 PRs ouvertes au départ, toutes de `jcnm`). La plus proche est **#3262**
(« removingHandle n'ampute plus un @handle collé à un e-mail — frontière gauche du SSOT »), qui
touche EXACTEMENT `composer-references.removingHandle`. Sa revue de diff montre qu'elle corrige un
défaut ORTHOGONAL (frontière gauche `NAME_BOUNDARY_LEFT`, cas `bob@alice`) et **laisse la ligne
`escaped` inchangée** — le crash à tiret décrit ici SURVIT à son merge. Les deux correctifs sont
complémentaires : #3262 rend `removingHandle` correct sur la frontière gauche, celui-ci le rend
non-crashant. Interaction de merge documentée en fin de fichier.

## Sélection : **Priorité 1 — feature récente (composeur de références/mentions) portant un crash sur entrée courante**

Deux passes d'audit (26 fichiers utilitaires purs de `packages/shared/utils/`, testés
empiriquement) n'ont retenu qu'UN défaut de correction reproductible : `removingHandle` throw un
`SyntaxError` sur tout username contenant un tiret. Les tirets sont fréquents dans les usernames
(`marie-claire`, `jean-pierre`) et explicitement valides (`/^[a-zA-Z0-9_-]+$/`, cité dans
`mention-parser.ts`). Gravité : **crash du chemin composeur** sur une entrée banale.

## Current state (avant correctif)

```ts
// composer-references.ts
export function removingHandle(username: string, text: string): string {
  const escaped = username.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');   // ← copie locale divergente
  const pattern = new RegExp(`\\s*@${escaped}(?![\\p{L}\\p{N}_.-])`, 'giu');  // ← flag `u`
  return text.replace(pattern, '').trim();
}
```

`escapeRegex` existe DÉJÀ, correctement, dans `mention-parser.ts` (non exporté) avec la classe
`/[.*+?^${}()|[\]\\]/g` — **sans** tiret. La copie de `composer-references` a AJOUTÉ `-` à sa
classe (le `\\-]` final). Un username à tiret produit donc `marie\-claire` ; interpolé dans une
regex portant le flag `u` HORS d'une classe de caractères, `\-` n'est PAS un escape d'identité
valide (seuls les métacaractères de syntaxe le sont sous Unicode), et `new RegExp(...)` **throw**
`Invalid regular expression: /\s*@marie\-claire(?![\p{L}\p{N}_.-])/giu: Invalid escape`.

Reproduction empirique (node) confirmée avant correctif ; test RED confirmé (même message).

## Problems identified

1. **Crash sur entrée valide et courante.** `removingHandle('marie-claire', …)` lève un
   `SyntaxError` au lieu de retirer le handle. Le chemin appelant est la transition
   INLINE → note/silence du composeur (web + iOS via le miroir Swift) : poser en note une
   référence dont le pseudo contient un tiret plantait la composition.
2. **Copie locale divergente d'un helper SSOT.** `mention-parser.ts` porte le bon `escapeRegex` ;
   `composer-references.ts` en tenait une copie inline qui a dérivé (ajout de `-`). Le tiret n'a
   de sens de métacaractère qu'À L'INTÉRIEUR d'un `[...]` — l'ajouter à une classe d'échappement
   dont le résultat sort HORS classe est à la fois inutile et, sous `u`, fatal.
3. **Défaut invisible au type et aux témoins existants.** Les 9 témoins de `removingHandle`
   n'employaient que des usernames sans tiret (`alice`, `Alice`, `alicia`) — la branche à tiret
   n'était jamais exécutée, donc jamais rouge.

## Root causes
- **Duplication d'une brique au lieu de sa réutilisation.** `escapeRegex` aurait dû être partagé
  dès l'origine (« Cette entité a-t-elle une JUMELLE ? »). Deux copies écrites séparément sur le
  même concept (« échapper un littéral regex ») ont divergé — exactement la classe de dérive que
  `mention-parser.ts` combat déjà pour ses frontières (`NAME_BOUNDARY_LEFT` exportée « pour éviter
  tout drift »). L'échappement n'avait pas reçu le même traitement.

## Business impact
- **Composition impossible pour les pseudos à tiret.** Un utilisateur qui bascule en note/silence
  une référence à `@marie-claire` (ou tout pseudo à tiret) voyait la composition planter. Les
  tirets sont fréquents dans les prénoms composés — population non négligeable, dégât direct
  (fonction inutilisable), sans contournement côté utilisateur.

## Technical impact
- **Correctif :** `removingHandle` réutilise `escapeRegex` (importé de `mention-parser.ts`) au
  lieu de sa copie ; la copie divergente disparaît. `escapeRegex` devient `export` avec un
  docstring qui INTERDIT désormais explicitement `-` dans la classe (avec la raison : `\-`
  invalide hors classe sous `u`).
- **Comportement :** identique pour tout username SANS tiret (les 9 témoins historiques restent
  verts) ; les usernames À tiret sont désormais retirés correctement au lieu de crasher.
  Frontière droite préservée (`@marie` ne retire pas `@marie-claire`).
- **`tsc --noEmit` :** 0 erreur. **Build `dist/` :** OK (import interne au package résolu ; pas de
  cycle — `mention-parser` n'importe pas `composer-references`).
- **Tests :** +2 témoins de régression (handle à tiret retiré sans crash ; frontière droite avec
  tiret). Suite `packages/shared` entière : **98 fichiers / 2372 tests verts** (2370 + 2).
- **Miroir Swift :** `ComposerReferences.removingHandle` utilise `NSRegularExpression.escapedPattern(for:)`,
  qui échappe correctement — **aucun bug équivalent, aucune modification Swift nécessaire.** Le
  crash est spécifique à l'échappement fait main de la version TS.

## Risk assessment
- **Régression fonctionnelle :** nulle attendue. Retirer `-` de la classe d'échappement est un
  no-op pour tout caractère sauf le tiret, et pour le tiret le comportement passe de « crash » à
  « retrait correct ». Aucun émetteur ne peut dépendre d'un throw.
- **Blast radius :** `removingHandle` n'est appelé qu'au composeur (transition de mode) ; pas de
  chemin serveur. `escapeRegex` n'est consommé que par ces deux fichiers du package partagé.

## Proposed improvements (livrées)
1. `escapeRegex` exporté depuis `mention-parser.ts` (SSOT) + docstring interdisant `-`.
2. `removingHandle` réutilise `escapeRegex` ; copie locale divergente supprimée.
3. +2 témoins de régression (handle à tiret ; frontière droite à tiret).

## Validation criteria
- `composer-references.test.ts` : 11/11 (9 historiques + 2 nouveaux : RED→GREEN à tiret, frontière droite à tiret).
- `mention-parser.test.ts` : non régressé.
- Suite `packages/shared` complète : verte.
- `tsc --noEmit` + build `dist/` : verts.

## Interaction avec la PR #3262 (ouverte au moment de ce lot)
#3262 modifie la ligne `pattern` de `removingHandle` (ajout de `${NAME_BOUNDARY_LEFT}`) et ajoute
`import { NAME_BOUNDARY_LEFT } from './mention-parser.js';` en tête de fichier + 2 témoins dans le
même `describe('removingHandle')`. Ce lot modifie la ligne `escaped` (adjacente) et ajoute
`import { escapeRegex } from './mention-parser.js';` + 2 témoins dans le même bloc. Les deux
correctifs sont **complémentaires et compatibles** :
- État cible une fois les deux mergés : `import { NAME_BOUNDARY_LEFT, escapeRegex } from './mention-parser.js';`
  et `const pattern = new RegExp(\`\\s*${NAME_BOUNDARY_LEFT}@${escapeRegex(username)}(?![\\p{L}\\p{N}_.-])\`, 'giu');`
- Un conflit de merge trivial (imports + bloc de témoins adjacents) est possible selon l'ordre de
  merge ; la résolution est mécanique et est décrite ci-dessus.

## Améliorations futures (non retenues cette itération)
- Une fois #3262 et ce lot mergés, vérifier que la tête de `composer-references.ts` fusionne les
  deux imports en une seule instruction (nettoyage cosmétique).
- Auditer les schémas Zod du gateway (thème récurrent des itérations 239/241) pour d'autres
  bornes/gardes manquantes — surface non couverte par les deux passes d'audit de ce lot.
