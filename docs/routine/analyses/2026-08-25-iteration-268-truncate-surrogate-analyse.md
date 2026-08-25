# Itération 268 — Analyse : `SecuritySanitizer.truncate` coupait au milieu d'une paire de substituts UTF-16

## État courant

`services/gateway/src/utils/sanitize.ts` porte `SecuritySanitizer`, la classe qui
rend un contenu SÛR avant persistance ou diffusion (`sanitizeText`,
`sanitizeURL`, `sanitizeEmail`, `sanitizeJSON`…). `truncate` en est le membre qui
borne une longueur :

```ts
static truncate(input: string, maxLength: number): string {
  if (!input || input.length <= maxLength) {
    return input;
  }
  return input.substring(0, maxLength).trim() + '...';
}
```

## Problèmes identifiés

1. **`substring(0, maxLength)` coupe sur une frontière d'UNITÉ DE CODE UTF-16, pas
   de POINT DE CODE.** Quand `maxLength` tombe au milieu d'une paire de substituts
   — tout caractère hors du plan multilingue de base : émoji, extensions CJK,
   symboles mathématiques — la chaîne rendue se termine par un **substitut haut
   orphelin** (`\uD800`–`\uDBFF`).
2. **`.trim()` ne retire pas un substitut orphelin.** La demi-paire invalide est
   donc conservée et rendue `�`.

Mesure (témoin ROUGE prouvé avant correctif) :

| appel | rendu AVANT | attendu |
|---|---|---|
| `truncate('😀😀😀😀', 5)` | `"😀😀\uD83D..."` | `"😀😀..."` |
| `truncate('ab😀cd', 3)` | `"ab�..."` | `"ab..."` |
| `truncate('😀😀😀', 4)` | `"😀😀..."` (coupe propre) | inchangé |

## Causes racines

Le contrat de `truncate` est « rendre une chaîne SÛRE et bornée ». Il a été écrit
pour un monde ASCII et n'a jamais été confronté aux caractères hors-BMP, aujourd'hui
omniprésents dans le contenu utilisateur (émoji). C'est la forme, à une frontière
d'assainissement, de la règle du dépôt : *une garde se mesure sur tout son espace
d'entrée, pas sur la seule forme qu'on avait en tête en l'écrivant.* Jumelle directe
de l'itération 260 (`isIpInRange` admettait des IP hors plage) et 266 (`isPrivateIp`
ne connaissait que l'IPv4).

## Impact métier

**Piège armé, PAS panne active — et c'est MESURÉ.** `SecuritySanitizer.truncate`
n'a, au moment du correctif, **AUCUN appelant de production** dans le dépôt
(vérifié : `grep -rn '\.truncate(' services packages apps --include=*.ts` hors
`sanitize.ts` et hors les troncateurs homonymes `truncateMessage` /
`truncatePreview` / `truncateMessagePreview`, tous distincts). Le premier appelant
qui l'emploiera pour du contenu utilisateur — un aperçu de notification, un titre
tronqué — publiera un `�` en fin de chaîne sur un produit dont le contenu est
massivement émoji.

Annoncer une panne qu'on n'a pas mesurée coûterait la confiance (leçon cycle 103) :
ce lot ferme un piège armé dans une utilitaire de SÉCURITÉ, exactement dans l'esprit
du cycle 84 (« on ne laisse pas un piège armé au motif que personne n'a encore
marché dessus »).

## Impact technique

- Sortie UTF-16 invalide (substitut solitaire) — rejetée par certains encodeurs
  stricts en aval, rendue `�` partout ailleurs.
- Le défaut vivait dans un membre PUBLIC d'une classe partagée : sa surface future
  est toute route/service qui voudra borner du texte.

## Évaluation du risque

**Très faible.** Le correctif ne modifie le comportement QUE lorsque l'unité à
l'index `maxLength - 1` est un substitut haut — cas qui produit aujourd'hui une
sortie invalide. Toute entrée ASCII/BMP (donc tous les témoins existants, et toute
coupe propre sur frontière de point de code) est rendue à l'identique. Un substitut
haut à l'index `maxLength - 1` a TOUJOURS son substitut bas en `maxLength`
(exclu par `substring`) : le retrait d'une unité est donc toujours correct, jamais
sur-correctif.

## Améliorations proposées (implémentées)

Reculer d'une unité quand la coupe atterrit sur un substitut haut :

```ts
const lastCharCode = input.charCodeAt(maxLength - 1);
const isHighSurrogate = lastCharCode >= 0xd800 && lastCharCode <= 0xdbff;
const end = isHighSurrogate ? maxLength - 1 : maxLength;
return input.substring(0, end).trim() + '...';
```

Portée VOLONTAIREMENT limitée aux paires de substituts (UTF-16 invalide). Les
séquences de graphèmes composées (ZWJ, marques combinantes) produisent, elles, du
texte VALIDE si coupées ; les gérer exigerait `Intl.Segmenter`, changerait le
comportement d'entrées correctes et sortirait du grain « minimal, préservant le
comportement » du lot. Noté comme suivi possible, non retenu ici.

## Bénéfices attendus

- Aucune sortie UTF-16 invalide, quel que soit l'appelant futur.
- Le membre de sécurité tient enfin son contrat sur tout son espace d'entrée.

## Complexité d'implémentation

Triviale : 3 lignes de logique, 1 fonction, 0 nouvelle dépendance.

## Critères de validation

- [x] Témoin ROUGE prouvé AVANT correctif (2 témoins tombent, `"ab�..."` mesuré).
- [x] Suite `sanitize.test.ts` VERTE après correctif (204/204).
- [x] Témoin de non-régression : coupe propre sur frontière de point de code
      (`truncate('😀😀😀', 4)`) inchangée avant/après.
- [x] `tsc --noEmit` gateway : 0 erreur.
