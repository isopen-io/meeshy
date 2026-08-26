# Itération 276 — Un témoin de parité pour l'ORDRE de résolution du Prisme (3 miroirs)

## État actuel

Le Prisme Linguistique se résout dans un ORDRE de priorité strict — c'est son
invariant central (`CLAUDE.md` racine, § « Résolution de langue ») :

1. `systemLanguage` — préférence in-app primaire
2. `regionalLanguage` — préférence in-app secondaire
3. `customDestinationLanguage` — override personnalisé
4. `deviceLocale` — locale appareil (Prisme étendu 2026-05-26)
5. `'fr'` — repli ultime

Cet ordre construit la liste ordonnée des langues préférées d'un lecteur, et vit
en TROIS exemplaires, un par client :

| plateforme | liste ordonnée | résolveur à valeur unique |
|---|---|---|
| TypeScript (SSOT) | `resolveUserLanguagesOrdered` (`utils/conversation-helpers.ts`) | `resolveUserLanguage` (même fichier) |
| Swift (iOS/SDK) | `MeeshyUser.preferredContentLanguages` (`Auth/AuthModels.swift`) | idem (repli `"fr"` sur liste vide) |
| Kotlin (Android) | `LanguageResolver.preferredContentLanguages` (`lang/LanguageResolver.kt`) | `LanguageResolver.resolveUserLanguage` |

## Problèmes identifiés

L'invariant « même ordre, trois miroirs » ne tenait que par des **doc-comments
jumeaux** : chacun des trois sites porte une variante de « Resolution order:
1. systemLanguage 2. regionalLanguage 3. customDestinationLanguage 4. deviceLocale
5. fr ». C'est exactement le trou « N miroirs, zéro témoin de parité »
(leçons 291/292, itérations 270 et 274) — les TABLES de normalisation
(`language-normalize-mirror-parity.test.ts`), le barème de présence
(`presence-mirror-parity.test.ts`), la palette de présence
(`presence-color-mirror-parity.test.ts`) et la SORTIE du résolveur d'aperçu
(`vectors/prism-preview.vectors.test.ts`) sont gardés, mais la CONSTRUCTION de la
liste préférée depuis les préférences utilisateur ne l'était pas.

C'est une distinction fine et c'est elle qui laissait le trou ouvert : les
vecteurs de `prism-preview` gardent le résolveur qui prend `preferredLanguages`
et rend un texte ; ils supposent la liste DÉJÀ construite. L'ordre dans lequel
cette liste se construit depuis `systemLanguage` / `regionalLanguage` / … n'était
attesté par aucun témoin.

## Causes racines

Un ORDRE dupliqué sans témoin dérive en silence : rien ne reliait la séquence des
`appendIfDistinct(...)` Swift à celle des `addDistinct(...)` Kotlin ni au tableau
`candidates` du SSOT TS. Deux dérives possibles, toutes deux invisibles en CI :

- **Permutation de rang** — `regionalLanguage` placé avant `systemLanguage` sur
  un seul client (un `switch`/`when`/chaîne `?:` recâblé).
- **Repli divergent** — un client repliant sur `'en'` là où les autres replient
  sur `'fr'` (mesuré : Android tient le repli dans la constante
  `FALLBACK_LANGUAGE`, iOS en littéral `"fr"`, TS en `return 'fr'`).

## Impact métier

L'ordre EST la règle produit : « un francophone avec un iPhone en anglais voit
TOUJOURS ses messages en français ». Une permutation qui ferait remonter
`deviceLocale` (rang 4) ou `regionalLanguage` (rang 2) devant `systemLanguage`
(rang 1) rétrograderait la langue PRIMAIRE du lecteur — la violation exacte du
Prisme (#3). Le même compte verrait alors deux langues différentes selon le
client, sans qu'aucun test ne rougisse.

## Impact technique

Aucun. Test seul, aucune ligne de production touchée.

## Évaluation du risque

- Correctif : **NUL** — un fichier de test ajouté, zéro production.
- Témoin : **FAIBLE** — test vitest pur lisant les sources Swift et Kotlin comme
  texte, et le SSOT TS par son COMPORTEMENT (sentinelles distinctes par rang).
  N'exige AUCUNE modification iOS/Android ni leurs toolchains (indisponibles dans
  ce conteneur).

## Améliorations proposées

Ajouter `packages/shared/__tests__/language-resolution-order-parity.test.ts`,
jumeau des témoins de barème/couleur/normalisation, qui vérifie :

1. **Ordre de référence (comportemental)** — `resolveUserLanguagesOrdered` du
   SSOT TS, alimenté de sentinelles distinctes (`aa`/`bb`/`cc`/`dd`), sort dans
   l'ordre `[systemLanguage, regionalLanguage, customDestinationLanguage,
   deviceLocale]`. L'ordre de référence est LU du SSOT, jamais recopié.
2. **Rang unique** — sans le rang 1, `resolveUserLanguage` descend au rang 2 (un
   témoin de rang s'écrit sur un rang AUTRE que le premier — leçon 261).
3. **Repli TS** — `resolveUserLanguage({})` → `'fr'`, `resolveUserLanguagesOrdered({})` → `[]`.
4. **Ordre Swift** — la séquence des `appendIfDistinct(...)` de
   `preferredContentLanguages` classe les rangs dans l'ordre canonique ; repli
   `preferred.append("fr")` présent.
5. **Ordre Kotlin** — la séquence des `addDistinct(...)` de
   `preferredContentLanguages`, ET la chaîne `?:` de `resolveUserLanguage`
   (corps d'expression, isolé sans compteur d'accolades), dans l'ordre canonique.
6. **Repli Kotlin** — `FALLBACK_LANGUAGE = "fr"`.

## Bénéfices attendus

- Trou de parité fermé : l'ordre de résolution — l'invariant central du Prisme —
  est désormais rejoué sur les trois miroirs.
- Une future dérive (rang permuté, repli changé) fait rougir la CI sur
  `packages/shared`, quel que soit le seul site fautif.

## Complexité d'implémentation

Faible. ~1 fichier de test, deux extracteurs de source (compteur d'accolades pour
les corps `{ … }`, isolation d'expression pour le corps `=` sans accolades de
Kotlin), chacun avec message d'erreur explicite si la forme change.

## Critères de validation

- Les 7 cas passent au VERT sur l'état d'origine.
- Contre-épreuves (PROUVÉES) rougissent, chacune sur SON test :
  - iOS : `appendIfDistinct(regionalLanguage)`/`(customDestinationLanguage)` permutés → test Swift rouge.
  - Android `preferredContentLanguages` : `addDistinct(systemLanguage)`/`(regionalLanguage)` permutés → test Kotlin rouge.
  - Android `resolveUserLanguage` : `systemLanguage`/`regionalLanguage` permutés dans la chaîne `?:` → test resolveUserLanguage rouge SEUL.
  - Android `FALLBACK_LANGUAGE = "en"` → test de repli Kotlin rouge.
  - SSOT TS : `candidates` `systemLanguage`/`regionalLanguage` permutés → contre-épreuve comportementale rouge.
- Suite `packages/shared` complète verte (113 fichiers / 2691 tests).

## Note de méthode (leçon reprise en cours de route)

Le premier extracteur Kotlin utilisait le compteur d'accolades pour
`resolveUserLanguage` — une fonction à CORPS D'EXPRESSION (`=` + chaîne `?:`, sans
`{}`). Il lisait donc le corps de la fonction SUIVANTE
(`preferredContentLanguages`), et le test « passait » en attestant la mauvaise
unité — précisément le « témoin qui atteste une copie » que
`services/gateway/CLAUDE.md` proscrit. Découvert en prouvant le ROUGE : une
permutation dans `preferredContentLanguages` faisait tomber DEUX tests au lieu
d'un. Corrigé par un extracteur d'expression dédié ; re-prouvé qu'une permutation
DANS `resolveUserLanguage` seul fait tomber SON test seul. **Prouver le ROUGE
n'est pas une formalité de fin : c'est ce qui a révélé que le témoin visait à
côté.**
