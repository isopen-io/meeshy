# Iteration 244 — `sanitizeFileName` défaisait son propre plafond de longueur : nom dotless > 255 → `"." + nom entier` (fichier caché plus LONG que l'entrée)

## Protocole (démarrage)
`main` @ `2bfaebf5` (dernier commit : `docs(lessons): Leçon 243`). Branche
`claude/brave-archimedes-9e4nuc` resynchronisée sur `origin/main` après merge des PR #3240
(iter 237) et #3243 (iter 238) de cette session.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript.
`apps/web` : jest + jest-environment-jsdom, tests en `**/__tests__/**/*.test.ts`.

**Audit anti-doublon** : les cycles 82-93 et itérations 234-243 ont exhaustivement traité les
schémas de réponse, les gates de présence, les communautés, l'analyse vocale, les plafonds de
réaction et les invariants temporels `end ≥ start`. **Cette cible (`apps/web/utils/xss-protection.ts`)
n'apparaît dans AUCUN de ces cycles.** Le module A un fichier de test
(`apps/web/utils/__tests__/xss-protection.test.ts`, 47 tests), dont un bloc `sanitizeFileName` — mais
ce bloc ne couvrait QUE le cas « nom long AVEC extension » (`'a'*300 + '.txt'`), le seul qui passe
malgré le bug ; le cas dotless (le défaut) n'était pas testé. Numéro d'itération choisi 244
(> 243, le plus haut existant) pour éviter la collision d'homonymes réparée à l'itération 238.

## Sélection : **Priorité — bug de correction dans un utilitaire de SÉCURITÉ non couvert**

`sanitizeFileName` est l'assainisseur de noms de fichiers uploadés/pièces jointes (docstring : « Use
for: uploaded files, attachments »). Son contrat affiché : retirer le path-traversal, restreindre le
jeu de caractères, et **plafonner la longueur à 255**. C'est du code de sécurité — la classe la plus
sensible où un bug de correction compte.

## Current state (avant correctif)

```ts
const maxLength = 255;
if (sanitized.length > maxLength) {
  const ext = sanitized.split('.').pop() || '';                     // dotless ⇒ ext = TOUT le nom
  const nameWithoutExt = sanitized.substring(0, maxLength - ext.length - 1); // négatif ⇒ ''
  return `${nameWithoutExt}.${ext}`;                                // '.' + TOUT le nom
}
```

## Problems identified

1. **Le plafond de longueur est DÉFAIT sur un nom sans point.** `'a'.repeat(300)` :
   - `ext = split('.').pop()` = le nom ENTIER (pas de point) = 300 caractères ;
   - `maxLength - ext.length - 1 = 255 - 300 - 1 = -46` ;
   - `String.substring(0, -46)` borne le négatif à `0` → `nameWithoutExt = ''` ;
   - retour = `'.' + 'a'.repeat(300)` → **longueur 301, PLUS LONGUE que l'entrée**, et le plafond
     que la branche prétend appliquer est franchi.

2. **Un fichier CACHÉ (dotfile) est fabriqué.** Le retour commence par `.` — sous Unix un fichier
   caché, et un nom qui peut se glisser sous un filtre naïf basé sur l'extension. La fonction
   INTRODUIT le point ; l'entrée n'en avait aucun.

3. **Même défaut quand le segment après le dernier point est énorme.** `'file.' + 'x'.repeat(300)` :
   `ext = 'x'.repeat(300)`, calcul négatif, même retour `'.' + …` de longueur 301.

## Root causes
- `split('.').pop()` sur un nom sans point rend le nom entier au lieu d'une chaîne vide — l'auteur a
  supposé qu'un point existait toujours. Le calcul `maxLength - ext.length - 1` n'est jamais gardé
  contre un `ext` plus long que `maxLength`, et `substring` masque le débordement en bornant le
  négatif à `0` plutôt qu'en signalant.

## Business impact
- **Faible aujourd'hui (fonction exportée, appelant à confirmer dans `apps/web`), défensif.**
  C'est un utilitaire public de sécurité : le durcir empêche qu'un futur câblage (upload, pièce
  jointe) hérite d'un plafond défait et d'un dotfile synthétisé. Un assainisseur qui rend une sortie
  plus longue que son entrée et viole son propre invariant est un piège armé.

## Technical impact
- Le contrat de longueur est désormais tenu dans TOUS les cas (`out.length <= 255`).
- Aucun dotfile n'est plus SYNTHÉTISÉ : un nom sans point, un nom à point de tête, ou une extension
  surdimensionnée retombent sur une troncature simple `slice(0, maxLength)`.
- Un point de tête PRÉEXISTANT dans l'entrée (`.bashrc`) est préservé comme avant — la fonction ne
  se met pas à dé-cacher des fichiers, elle cesse seulement d'en créer.
- Les 5 comportements non-troncature (nullish, nom normal, path-traversal, remplacement de
  caractères, extension courte) sont inchangés — prouvés verts avant ET après.

## Risk assessment
- **Négligeable.** `slice` avec des arguments GARANTIS positifs (garde `ext.length <= maxLength - 2`,
  donc `maxLength - ext.length - 1 >= 1`) — jamais le comportement divergent de `slice` sur négatif.
  Aucun appelant existant (grep exhaustif `apps/web`), donc zéro risque de régression d'intégration.
  Le seul changement observable porte sur des entrées > 255 caractères, qui étaient déjà corrompues.

## Proposed improvements (implémenté)

```ts
const lastDot = sanitized.lastIndexOf('.');
const ext = lastDot > 0 ? sanitized.slice(lastDot + 1) : '';
if (ext.length > 0 && ext.length <= maxLength - 2) {
  return `${sanitized.slice(0, maxLength - ext.length - 1)}.${ext}`;
}
return sanitized.slice(0, maxLength);
```

- `lastDot > 0` : ignore un point de tête (position 0) et l'absence de point.
- `ext.length <= maxLength - 2` : garantit qu'au moins un caractère de nom précède le point → jamais
  de sortie à point de tête, jamais de calcul de slice négatif.
- fallback `slice(0, maxLength)` : troncature dure, plafond tenu, aucun point introduit.

## Expected benefits
- L'invariant de longueur (≤ 255) est réellement tenu ; plus de dotfile synthétisé ; extension réelle
  préservée quand elle tient. Premier fichier de test pour ce module de sécurité.

## Implementation complexity
- **Triviale.** 1 fichier source (branche de troncature réécrite), 1 fichier de test neuf (7 tests).

## Validation criteria
- [x] RED : 2 tests AJOUTÉS (dotless > 255 ; segment de queue énorme) prouvent le retour de longueur
      301 avant correctif — ajoutés au bloc `sanitizeFileName` EXISTANT, sans écraser le fichier.
- [x] GREEN : 50/50 tests `xss-protection.test.ts` (47 existants préservés + 3 troncatures dont 2
      neuves).
- [x] Aucun appelant repéré par grep `apps/web` (fonction exportée publique).
- [x] `tsc --noEmit` : aucune erreur nouvelle sur `xss-protection.ts`.
- [ ] CI verte sur la PR (gate lint/jest réel).

## Incident de manœuvre (corrigé)
Le premier jet a écrit le test à `utils/__tests__/xss-protection.test.ts` en supposant qu'il
n'existait pas (vérif faite sur `utils/xss-protection.test.ts`, PAS sur le sous-répertoire
`__tests__/`). `Write` a écrasé les 443 lignes existantes (47 tests) par 48. Détecté au
`git show --stat` (430 suppressions anormales) : le fichier original a été restauré depuis
`origin/main`, et les 2 cas neufs FUSIONNÉS dans le bloc `sanitizeFileName` existant. Leçon : avant
tout `Write` d'un fichier de test, vérifier `__tests__/` en plus du dossier plat.

## Améliorations futures (hors périmètre, relevées par l'audit)
- **`isSharedChatRoute` (`apps/web/utils/route-utils.ts:64`)** : contrairement à son jumeau
  `isPublicRoute` (`if (!pathname) return true;`), il appelle `.startsWith` sans garde → `TypeError`
  sur pathname falsy. Défensif, faible valeur (dépend des appelants).
- **`sanitizeText`/`truncateText` (`xss-protection.ts:91`, `:269`)** : troncature `substring` sur
  unités UTF-16 → peut couper une paire de substituts (emoji/astral). Le dépôt a déjà la doctrine
  inverse (`utils/truncate.ts` `sliceCodePoints`). Rare (MAX 10000), faible valeur.
- **Bornes username admin (`packages/shared/types/validation/admin-user.ts:11`)** : `min(3).max(30)`
  vs `normalizeUsername` (2–16) — smell de cohérence cross-module, nécessite un arbitrage produit
  (quelle borne fait autorité) avant d'être qualifié de bug.
