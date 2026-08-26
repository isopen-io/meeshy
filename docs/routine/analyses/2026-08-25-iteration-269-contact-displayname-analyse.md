# Itération 269 — Analyse : `normalizeDisplayName` du carnet d'adresses avait dérivé de sa jumelle exportée, sur DEUX axes

> Note de coordination : une session sœur porte déjà un lot étiqueté « It. 269 »
> (#3517, `android-legacy-iso639`, normalisation de code de langue Android). Ce
> lot-ci est disjoint (normalisation d'un nom de contact appareil) et nommé
> `iteration-269-contact-displayname` pour éviter toute collision de fichier au
> merge.

## État courant

Le gateway porte DEUX fonctions `normalizeDisplayName`, jumelles par le nom et le
but (rendre un nom d'affichage sûr, sur une seule ligne), divergentes par le
contrat :

| site | portée | terminateurs de ligne | borne de longueur |
|---|---|---|---|
| `utils/normalize.ts` (exportée) | inscription / profil (`AuthService`, `routes/users/profile`) | **SUPPRIME** `[\r\n\t\v\f  ]` | aucune (bornée par schéma en amont) |
| `utils/contact-identifiers.ts` (privée) | synchro du carnet d'adresses appareil | **REMPLACE par un espace** `[\r\n\t]` seulement | `.slice(0, 200)` |

La jumelle exportée a été durcie deux fois — à l'it. 266b sur le jeu complet des
séparateurs de ligne (un moteur de rendu casse aussi sur `U+2028`/`U+2029`/`NEL`/
`\v`/`\f`), et de longue date sur sa garantie « une seule ligne ». La copie du
carnet d'adresses n'a reçu **aucune** des deux évolutions et portait, en plus,
une troncature non sûre en UTF-16.

## Problèmes identifiés

**Deux défauts INDÉPENDANTS dans la même fonction privée, tous deux « une garde
qui ne couvre qu'une partie de son espace d'entrée » :**

1. **Troncature coupant au milieu d'une paire de substituts UTF-16.**
   `.slice(0, 200)` coupe sur une frontière d'UNITÉ DE CODE, pas de POINT DE CODE.
   Quand la 200ᵉ unité tombe sur un substitut HAUT (tout caractère hors du plan
   multilingue de base : émoji, extensions CJK, symboles mathématiques), la
   chaîne rendue se termine par une demi-paire orpheline rendue `�`. Jumelle
   directe de l'it. 268 (`SecuritySanitizer.truncate`), fermée dans `sanitize.ts`
   et jamais portée à ce SECOND troncateur.

2. **Jeu de séparateurs de ligne incomplet.** La fonction remplace seulement
   `[\r\n\t]` par un espace pour garantir un affichage sur une seule ligne, mais
   laisse passer `U+2028` (LINE SEPARATOR), `U+2029` (PARAGRAPH SEPARATOR),
   `U+0085` (NEL), `U+000B` (VERTICAL TAB) et `U+000C` (FORM FEED). Un contact
   nommé `"Awa Diallo"` s'étale sur deux lignes à l'écran. Jumelle directe
   de l'it. 266b, fermée dans `normalize.ts` et jamais portée ici.

Mesure (témoins ROUGES prouvés AVANT correctif) :

| entrée | rendu AVANT | attendu |
|---|---|---|
| `'a'.repeat(199) + '😀'` (201 unités) | `"a…a\uD83D"` (200 u., substitut orphelin) | `"a…a"` (199 u.) |
| `'Awa Diallo'` | `"Awa Diallo"` (deux lignes) | `"Awa Diallo"` (une ligne) |
| `'a'.repeat(198) + '😀' + 'x'…` | `"…😀"` (coupe propre) | inchangé (non-régression) |

## Causes racines

Deux copies d'une même règle — le jeu des caractères qui BRISENT une ligne —
tenues par la vigilance humaine, dérivent : la première qui change (ici la
jumelle exportée, à l'it. 266b) casse la sémantique sans qu'aucune autre ne le
sache. C'est exactement la forme de la leçon 287 (« une divergence entre N
implémentations de la même règle se supprime en extrayant UN site ») et de la
règle du dépôt « une protection se mesure sur tout son espace d'entrée » (it. 260
`isIpInRange`, it. 266 `isPrivateIp`, it. 267 MIME, it. 268 `truncate`).

Le carnet d'adresses est, par l'aveu de l'en-tête du module, une donnée « NON
MAÎTRISÉE » — accents, émojis, scripts non-latins, noms multi-lignes collés d'un
traitement de texte. C'est précisément le domaine d'entrée où les deux formes
manquantes (hors-BMP, séparateurs Unicode) sont fréquentes.

## Impact métier

**Piège armé partiellement ACTIF, et c'est mesuré.**

- Défaut 2 (séparateurs) est ACTIF pour tout contact du carnet dont le nom porte
  un séparateur Unicode — rare mais réel (collage depuis un document, données
  d'usurpation). Le nom s'affiche sur deux lignes dans le répertoire / les
  suggestions de contact.
- Défaut 1 (substitut) est ARMÉ : il ne se déclenche que sur un nom de plus de
  200 unités UTF-16 finissant par un caractère hors-BMP à la frontière exacte —
  peu fréquent, mais sur un produit dont le contenu est massivement émoji, le
  premier nom concerné publie un `�` persistant dans le `displayName` servi et
  re-diffusé.

Aucun `contactKey` n'est affecté (le `displayName` n'entre pas dans son calcul) :
la synchro reste idempotente. Le défaut est cosmétique-mais-persistant, jamais
fatal pour le lot.

## Impact technique

- Sortie UTF-16 invalide (substitut solitaire) — rejetée par certains encodeurs
  stricts en aval, rendue `�` partout ailleurs, et PERSISTÉE en base.
- Rupture de la garantie « une seule ligne » sur une surface d'affichage
  (répertoire de contacts) — débordement de cellule, désalignement.
- Deux copies d'une règle de rendu : dette de divergence future.

## Évaluation du risque

**Très faible.**
- Le correctif de troncature ne modifie le comportement QUE lorsque l'unité à
  l'index `199` est un substitut haut — cas qui produit aujourd'hui une sortie
  invalide. Toute entrée ASCII/BMP est rendue à l'identique (témoin de
  non-régression : coupe propre sur frontière de point de code, inchangée).
- Le correctif de séparateurs n'ajoute que 5 caractères au jeu remplacé par un
  espace — tous des caractères qui n'ont aucune place dans un nom sur une ligne.
- L'extraction de `LINE_BREAKING_CHARS_SOURCE` est byte-identique au jeu que
  `normalize.normalizeDisplayName` portait déjà : ce site est INCHANGÉ à
  l'exécution (vérifié : 40 suites / 1154 tests `utils` verts, `tsc` 0 erreur).

## Améliorations proposées (implémentées)

1. **Extraire le jeu de séparateurs de ligne en SOURCE UNIQUE**
   (`LINE_BREAKING_CHARS_SOURCE`, `services/gateway/src/utils/normalize.ts`).
   Les deux normaliseurs en dérivent leur regex — l'un pour SUPPRIMER (profil),
   l'autre pour REMPLACER par un espace (contact). Le jeu ne peut plus rediverger.

2. **`contact-identifiers.normalizeDisplayName`** :
   - remplace désormais le jeu COMPLET par un espace (défaut 2 fermé) ;
   - recule d'une unité quand la coupe à 200 atterrit sur un substitut haut
     (défaut 1 fermé), à l'identique de `SecuritySanitizer.truncate`.

Portée VOLONTAIREMENT limitée : les deux fonctions gardent leur contrat distinct
(supprimer vs remplacer, borne vs pas de borne). On ne fusionne PAS les deux
fonctions — seul le JEU de caractères, la règle qui avait dérivé, devient unique.
Les graphèmes composés (ZWJ, marques combinantes) restent hors périmètre : coupés,
ils produisent du texte VALIDE (pas une demi-paire), et les gérer exigerait
`Intl.Segmenter` et changerait le comportement d'entrées correctes.

## Bénéfices attendus

- Aucune sortie UTF-16 invalide, quelle que soit la longueur/composition du nom.
- Garantie « une seule ligne » tenue sur tout l'espace des séparateurs de ligne.
- Une seule définition du jeu de rupture de ligne dans le gateway : la prochaine
  évolution touche un site, pas deux.

## Complexité d'implémentation

Triviale : 1 constante extraite, 2 fonctions ajustées (~8 lignes de logique), 0
nouvelle dépendance, 3 témoins ajoutés.

## Critères de validation

- [x] Témoins ROUGES prouvés AVANT correctif (2 tombent : substitut orphelin
      mesuré `"…a\uD83D"`, `"Awa Diallo"` deux lignes).
- [x] Suite `contact-identifiers.test.ts` VERTE après correctif ; témoin de
      non-régression (coupe propre `…😀`) vert avant ET après.
- [x] Suites `normalize` VERTES : le site exporté est byte-identique.
- [x] 40 suites / 1154 tests `src/__tests__/unit/utils` verts.
- [x] `tsc --noEmit` gateway : 0 erreur.
- [x] Aucune troisième copie du jeu de séparateurs (grep dépôt : seuls les deux
      sites, dérivant tous deux de la source unique).
