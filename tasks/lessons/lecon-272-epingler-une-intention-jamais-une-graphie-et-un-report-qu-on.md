## Leçon 272 — Épingler une intention, jamais une graphie ; et un report qu'on rapproche soi-même de la rupture cesse d'être un report

> **Renumérotée 269 → 272 le 2026-08-24.** La piste « calling » (Vague 176) a
> posé SA leçon 269 en parallèle, et 270/271 étaient déjà pris quand la mienne a
> atterri. **Les collisions de numéro dans ce fichier sont STRUCTURELLES, pas
> accidentelles** : le dépôt en portait déjà huit (162, 215, 221, 234, 235, 243,
> 244, 253) avant celle-ci. Deux documents (`realtime-sync-audit-2026-08-15`,
> `…-cycle123`) citent « leçon 269 » en visant l'AUTRE — un doublon ne fait donc
> pas que gêner l'œil, il rend des renvois existants ambigus.
>
> **Corollaire opératoire** : relire `grep -o '^## Leçon [0-9]*' | sort -n | tail -1`
> **juste avant de committer**, jamais au moment de rédiger — l'écart entre les
> deux est exactement la fenêtre où l'essaim insère la sienne.


**Contexte** : itération iOS 241i (PR #3464, mergée `e1522ba0`, 0 échec sur 7803).

### (a) Une garde de source qui pin une GRAPHIE rougit à chaque refactor légitime

241i a fait passer dix valeurs d'accessibilité de `"\(count)"` à
`LocalizedNumber.exact(count)`. Deux gardes du dashboard sont passées au rouge :
elles exigeaient **littéralement** `.accessibilityValue("\(health)")` et
`.accessibilityValue("\(value)")`.

**La garde faisait son travail** — leçon 239i : elle a détecté qu'un appelant de
la règle changeait, ce qu'on lui demande exactement, et la faire taire aurait
été le vrai danger.

Mais son ÉNONCÉ, écrit juste à côté, n'a jamais été « interpole » :

> The health gauge must announce the score as its accessibility value.
> StatRing must announce the **raw (un-abbreviated)** count as its accessibility value.

`LocalizedNumber.exact` sert cet énoncé **mieux** que l'interpolation (entier,
groupé, dans les chiffres du lecteur). Le rouge ne signalait donc pas une
régression : il signalait que **l'assertion ne disait pas ce que le test
voulait dire**.

**Règle : une garde de source épingle une INTENTION, pas une orthographe.** Le
symptôme distinctif : le message d'échec et l'assertion ne parlent pas de la
même chose. Quand ça arrive, ne pas recopier la nouvelle graphie à la place de
l'ancienne — réécrire l'assertion pour qu'elle dise l'énoncé.

Corollaire appliqué ici : `StatRing` a gagné le versant **négatif** qui lui
manquait — la valeur ne doit **pas** être l'abrégé (`displayValue`). Une
assertion positive seule (« contient X ») ne protège de rien si la vraie règle
est « et surtout pas Y ».

### (b) Un report qu'on vient soi-même de rapprocher de la rupture n'est plus un report

La jauge de santé était découpée par un nombre de CARACTÈRES (`prefix(1400)`) —
l'une des « 3 fenêtres » portées en carry-over par 239i **puis** 240i.

En réparant l'assertion, le motif s'allonge (il nomme sa source) : la marge
résiduelle tombait à **138 caractères**. C'est exactement le piège que 238i a
documenté (`prefix(2600)`, marge finale **5**) : un doc-comment pousse la fin du
motif hors fenêtre et la garde **rougit sur du code qui la satisfait toujours**
— pire qu'un faux vert, puisqu'elle envoie corriger ce qui n'est pas cassé.

Reporter une 3ᵉ fois aurait été défendable **avant** ce lot. Après l'avoir
soi-même rapproché de la rupture, c'est le laisser exploser chez le suivant.

**Règle : un carry-over que le lot courant rend PLUS fragile doit être traité
dans ce lot.** Le critère n'est pas « est-ce dans mon périmètre ? » mais « ai-je
consommé sa marge ? ».

Remplacé par `functionBody(named:in:)`, jumeau de `structBody` (238i) pour les
vues rendues depuis un `private func`. Et, comme 238i l'exige, **élargir une
borne oblige à prouver qu'on ne fabrique pas un faux vert** : un test vérifie la
borne dans les DEUX sens — elle contient la jauge, et s'arrête **avant**
`StatRing`, qui porte le même `.accessibilityElement(children: .ignore)` et
aurait fait passer la garde au vert pour le mauvais élément.

### (c) Compter des occurrences par `grep` surestime dès qu'un commentaire CITE le motif

Contrôle post-merge : « 2 fenêtres `prefix(1400)` attendues », `grep` en rend
**3**. La 3ᵉ était le doc-comment de `functionBody` **citant** `prefix(1400)`
pour expliquer pourquoi il le remplace. Même mécanisme que le dépouillement de
commentaires que les gardes appliquent déjà — mais oublié dans le contrôle
manuel qui les vérifie. **Un écart de comptage se regarde avant d'être cru :
ici il ne signalait pas un correctif incomplet, mais un grep naïf.**

---
