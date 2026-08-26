# Iteration 237 — `removingHandle` retirait un `@handle` collé à un e-mail : frontière gauche manquante (drift du SSOT `NAME_BOUNDARY_LEFT`)

## Protocole (démarrage)
`main` @ `6b3fc59e` (dernier commit : `feat(android): live feed comment-count sync`). Branche
`claude/brave-archimedes-s2mzxg` alignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3863 paquets), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suite
`packages/shared/__tests__/utils/composer-references.test.ts` verte au départ (9 tests) ;
suites mention (`mention-parser` + `mention-extract`) vertes au départ (69 tests).

**Audit anti-doublon** (11 PRs ouvertes au départ, toutes de `jcnm` : #3261, #3259, #3257,
#3255, #3253, #3250, #3249, #3247, #3245, #3243, #3242). Aucune ne touche
`packages/shared/utils/composer-references.ts` ni `packages/shared/utils/mention-parser.ts` ni
`packages/MeeshySDK/Sources/MeeshyUI/Story/ComposerMentionQuery.swift` — zéro chevauchement de
fichier. Les grosses PRs feature (#3261 = 4325 lignes) sont laissées à la revue humaine : les
merger de façon autonome sortirait du périmètre sûr d'une itération de hardening.

## Sélection : **Priorité 1 — feature récente (composeur de références/mentions) portant une divergence de contrat**

Le module `mention-parser.ts` a été durci de façon répétée pour qu'un `@` précédé d'un
caractère de nom (adresse e-mail `contact@marie.com`) ne soit JAMAIS pris pour une mention. La
frontière gauche `NAME_BOUNDARY_LEFT` (`(?<![\p{L}\p{N}_-])`) y est **exportée explicitement**
« pour éviter tout drift » et appliquée aux trois chemins de détection (`parseMentions`
@DisplayName, `parseMentions` @username, `hasMentions`) ainsi qu'aux helpers de `types/mention.ts`.

`removingHandle` (`composer-references.ts`), qui RETIRE un `@handle` du texte lors de la
transition INLINE → note/silence, **n'appliquait aucune frontière gauche**. Il portait la
frontière droite (`(?![\p{L}\p{N}_.-])`, pour ne pas emporter `@alicia`) mais pas la gauche.

## Current state (avant correctif)

```ts
export function removingHandle(username: string, text: string): string {
  const escaped = username.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const pattern = new RegExp(`\\s*@${escaped}(?![\\p{L}\\p{N}_.-])`, 'giu');
  return text.replace(pattern, '').trim();
}
```

Le `\s*@handle` sans lookbehind gauche matche `@alice` même quand une lettre le précède.
Jumeau Swift identique (`ComposerMentionQuery.removingHandle`, `pattern: "\\s*@\(escaped)(?![...])"`).

## Problems identified

1. **Suppression d'un span jamais détecté comme mention.** `parseMentions`/`hasMentions`
   n'identifient PAS `@alice` dans `bob@alice` (frontière gauche). Mais `removingHandle('alice', …)`
   le RETIRE — la suppression frappe un texte que la détection n'a jamais reconnu. Concrètement :
   `removingHandle('alice', 'écris à bob@alice stp')` renvoyait `écris à bob stp` (l'e-mail est
   amputé de `@alice`), alors qu'aucune mention n'existait dans cette phrase.
2. **Drift du SSOT `NAME_BOUNDARY_LEFT`.** Le module qui l'exporte proclame la frontière gauche
   « source de vérité unique pour TOUS les chemins de mention … pour éviter tout drift » ;
   `removingHandle` est un chemin de mention (il opère sur les mêmes `@handle`) qui ne la
   consommait pas. Détection et suppression divergeaient sur la définition d'« une mention ».
3. **Divergence détection ⇄ suppression, invisible au type.** Le contrat vécu par
   `parseMentions` (ce `@alice` n'est pas une mention) et par `removingHandle` (ce `@alice` est
   retirable) était contradictoire sans qu'aucun `tsc` ne le signale.

## Root causes
- La frontière droite a été jugée suffisante à l'écriture initiale de `removingHandle` (le souci
  cité était `@alice` vs `@alicia`, une collision par la DROITE). Le cas e-mail — collision par
  la GAUCHE — n'a pas été reporté depuis `mention-parser.ts`, alors même que ce module l'avait
  déjà résolu et exporté la brique réutilisable. Deux fonctions écrites séparément sur le même
  concept (« qu'est-ce qu'un `@handle` ? ») ont divergé faute d'héritage de la constante.

## Business impact
- **Corruption silencieuse de texte au composeur.** Une story/publication dont le texte contient
  un couple `user@host` (mention d'un contact whose pseudo est aussi un host token, ou simple
  `bob@alice` collé) voyait son fragment `@host` disparaître dès qu'on posait la référence
  homonyme en note/silence. Aucun message, aucune trace ; l'auteur perd un morceau de sa phrase.
  Fréquence faible (il faut que le token collé au `@` soit exactement le pseudo transitionné),
  mais dégât direct et non réversible sur le contenu que la personne est en train d'écrire.

## Technical impact
- **Comportement de suppression :** un `@handle` précédé d'un caractère de nom (lettre, chiffre,
  `_`, `-`) n'est plus retiré. Un `@handle` séparé (espace, ponctuation, début de texte) l'est
  toujours — les 9 tests existants restent verts (`Soirée avec @alice hier` → `Soirée avec hier`,
  `@alice` → ``, `bravo @Alice !` → `bravo !`, `@alice et @alicia` → `et @alicia`).
- **Placement du lookbehind :** `\s*(?<![\p{L}\p{N}_-])@handle`. Le lookbehind est à hauteur du
  `@` (après le `\s*`) : espace présente ⇒ le caractère testé est l'espace (frontière propre,
  match conservé) ; espace absente ⇒ c'est le caractère réellement collé au `@` (lettre d'e-mail
  ⇒ pas de match). Parité stricte avec les trois chemins de `parseMentions`.
- **Réutilisation du SSOT :** `removingHandle` importe désormais `NAME_BOUNDARY_LEFT` depuis
  `mention-parser.ts` — plus de copie locale, plus de drift possible.
- **`tsc` :** 0 nouvelle erreur ; build `dist/` OK (nouvel import interne au package résolu).
- **Coverage :** +2 tests (frontière gauche e-mail préservée ; frontière gauche propre toujours
  retirée), 11/11 verts.
- **Miroir Swift :** `ComposerMentionQuery.removingHandle` reçoit le même lookbehind
  `(?<![\p{L}\p{N}_-])` (ICU/NSRegularExpression le supporte). Non build-testable dans cet
  environnement (pas de toolchain Swift) — modification textuelle jumelle, tests XCTest existants
  (`ComposerMentionQueryTests`, `ReferenceDeclarableModesTests`) inchangés dans leur sémantique.

## Risk assessment
- **Régression fonctionnelle :** nulle attendue. Le seul comportement modifié est le NON-retrait
  d'un `@handle` collé à un caractère de nom — précisément le cas que la détection considérait
  déjà comme un non-mention. Aucun émetteur légitime ne dépend de l'ancien comportement (retirer
  un fragment d'e-mail était le bug).
- **Blast radius :** `removingHandle` n'est appelé qu'au composeur (transition INLINE → autre
  mode) côté web et iOS. Pas de chemin serveur.

## Proposed improvements (livrées)
1. Frontière gauche `NAME_BOUNDARY_LEFT` importée du SSOT et appliquée à `removingHandle` (TS).
2. Lookbehind jumeau dans le miroir Swift.
3. +2 tests de régression.

## Validation criteria
- `composer-references.test.ts` : 11/11.
- `mention-parser.test.ts` + `mention-extract.test.ts` : 69/69 (non régressés).
- `tsc --noEmit` + build `dist/` : verts.

## Améliorations futures (non retenues cette itération)
- Auditer les autres consommateurs de `@handle` (`ReferenceComposerEntries`, `StoryTextEditorView`
  côté iOS) pour vérifier qu'aucun ne réimplémente une extraction/suppression sans la frontière.
- Envisager une brique partagée `mentionSpanPattern(handle)` unique, consommée par détection ET
  suppression, pour rendre le drift structurellement impossible (au-delà du partage de la seule
  constante de frontière).
