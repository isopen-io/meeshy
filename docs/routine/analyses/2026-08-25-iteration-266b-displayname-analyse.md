# Itération 266b — Analyse : `normalizeDisplayName` promettait une seule ligne, et n'en gardait que trois caractères

## Priorité

Priorité 1 — dette exposée au même titre que la vague 266 (`decodeCursor` cycle 265,
`validatePagination` #3506, bornes `.max(5)` #3502) : un contrat de frontière
énoncé dans le doc-comment et non tenu contre l'entrée réelle. Site distinct de
tous les PR ouverts de la vague (aucun ne touche `utils/normalize.ts`).

## État courant

`services/gateway/src/utils/normalize.ts` → `normalizeDisplayName(displayName)`
est la source unique de normalisation d'un `displayName` côté serveur. Deux
appelants de production le consomment, tous deux en amont d'un
`SecuritySanitizer.sanitizeText` :

| site | usage |
|---|---|
| `AuthService.ts:474` | compose `displayName` à l'inscription (`prénom nom`) |
| `routes/users/profile.ts:142` | met à jour le `displayName` d'un profil |

Le doc-comment ÉNONCE le contrat : « garantit un affichage sur une seule ligne,
y compris pour les fins de ligne Windows (`\r\n`) et Mac historiques (`\r`
seul) ». L'implémentation ne retirait que trois caractères :

```ts
return displayName.trim().replace(/[\r\n\t]/g, '');
```

## Problèmes identifiés

1. **Le contrat « une seule ligne » n'était pas tenu.** Un moteur de rendu (CSS
   `white-space`, `UILabel`, Android `TextView`) casse la ligne sur bien plus que
   `\r`/`\n` :
   - `U+2028` LINE SEPARATOR et `U+2029` PARAGRAPH SEPARATOR — séparateurs de
     ligne Unicode, retour à la ligne dur en CSS et dans la plupart des rendus
     natifs ;
   - `U+0085` NEL (Next Line) ;
   - `U+000B` VERTICAL TAB et `U+000C` FORM FEED — blancs verticaux C0.

   Aucun n'était retiré. Un `displayName` collé depuis un traitement de texte, ou
   fabriqué pour l'usurpation, pouvait s'étaler sur deux lignes et déborder de sa
   cellule (liste de conversations, en-tête, mention).

2. **Le doc-comment affirmait la garantie qu'il ne tenait pas.** Même famille que
   « un commentaire qui ÉNONCE une contrainte est une AFFIRMATION » (cycle 94) :
   la phrase « une seule ligne » se relisait comme une propriété acquise.

## Causes racines

Le jeu `[\r\n\t]` couvre les terminateurs de ligne ASCII, ceux auxquels on pense
en écrivant le code. La garantie « une seule ligne » ne se mesure pas contre
ce qu'on tape au clavier mais contre ce qu'un MOTEUR DE RENDU traite comme un
saut de ligne — un ensemble Unicode plus large, invisible dans un éditeur qui
affiche ` ` comme un espace ou rien du tout.

## Impact métier

Cosmétique, mais orienté surface d'usurpation : un `displayName` multi-lignes
casse l'alignement des listes et permet de masquer/imiter du contenu adjacent
(un nom qui empiète sur la ligne du dessous). Aucun client légitime ne produit
ces caractères ; ils n'arrivent que par collage ou par intention.

## Impact technique

Défaut latent transformé en contrat tenu. Aucune valeur de retour légitime ne
change : espaces ordinaires (y compris multiples), espace insécable, émojis,
ponctuation, casse — tous préservés (couverts par les témoins existants, restés
verts). Le durcissement est purement additif au jeu de caractères retiré.

## Évaluation du risque

**Très faible.** Une seule fonction feuille, un seul jeu de caractères élargi.
Les deux appelants passent déjà par `sanitizeText` en aval — la normalisation
est strictement en amont. Rollback : revert du commit unique.

## Améliorations proposées (livrées)

- Élargir le jeu retiré à `/[\r\n\t\v\f  ]/g`.
- Réécrire le doc-comment pour ÉNUMÉRER les terminateurs couverts et dire
  pourquoi (rendu, pas frappe clavier), et affirmer explicitement ce qui reste
  préservé (espaces ordinaires + insécable).

## Bénéfices attendus

- Le contrat « une seule ligne » est désormais tenu contre l'entrée réelle.
- Un `displayName` ne peut plus s'étaler sur deux lignes ni déborder de sa
  cellule dans aucun des trois clients.

## Complexité d'implémentation

Triviale — un jeu de caractères de regex élargi, aucun nouveau module.

## Critères de validation

- [x] RED : 6 témoins (U+2028, U+2029, U+0085, U+000B, U+000C, mix) tombent sur
      `main`, et AUCUN autre témoin du dépôt ne bouge (6 failed / 133 passed).
- [x] GREEN : `normalize.test.ts` → 139/139 ; `normalize-logging.test.ts` inclus
      → 143/143 sur les deux suites.
- [x] `tsc --noEmit` gateway → 0 erreur.
- [x] Appelants de production inchangés (les deux enchaînent `sanitizeText` ;
      `contact-identifiers.ts` a sa PROPRE fonction locale homonyme, non touchée).
- [ ] Commit + push.
- [ ] CI verte sur la PR.
