# Analyse — Itération 278 : la cible de traduction d'un participant anonyme passe par la SSOT de dédup

## État courant

`MessageTranslationService._extractConversationLanguages` (alias
`getConversationLanguages`) construit l'ENSEMBLE des langues cibles vers
lesquelles un message de la conversation sera traduit (NLLB). Il balaie les
participants et fusionne, pour chacun, ses langues dans un `Set` :

- **Participant inscrit** (`type === 'user'`) : via
  `resolveUserLanguagesOrdered(u, { deviceLocale })`
  (`packages/shared/utils/conversation-helpers.ts`). Les trois préférences in-app
  passent par `normalizeInAppLanguage`, dont le repli **strippe la région**
  (`'fil-PH'` → `'fil'`, `code.split(/[-_]/)[0]`) pour tout code que
  `normalizeLanguageCode` ne sait pas réduire.
- **Participant anonyme / bot** : via un repli INLINE
  `normalizeLanguageCode(participant.language) ?? participant.language.toLowerCase()`.

## Problème identifié

Le repli inline de la branche anonyme **ne strippe PAS la région** pour un code
IRRÉDUCTIBLE (ISO 639-3 sans entrée catalogue Meeshy : `fil` Filipino, `yue`
Cantonais…). `normalizeLanguageCode('fil-PH')` rend `undefined`, donc le repli
`'fil-PH'.toLowerCase()` = `'fil-ph'` — le tag de région SURVIT.

La branche inscrite, pour la même valeur (`systemLanguage: 'fil-PH'`), contribue
`'fil'`. **Deux formes divergentes de la MÊME langue** entrent alors dans
l'ensemble des cibles : `['fil', 'fil-ph']`.

## Cause racine

Le commentaire du site déclare « Normalise like the registered branch » et
nomme exactement la collision à éviter (« a duplicated NLLB request and a Prisme
rule #1 miss »), mais le correctif choisi — `normalizeLanguageCode(x) ??
x.toLowerCase()` — ne couvre que les codes RÉDUCTIBLES (`'EN'` → `'en'`,
`'ES-ES'` → `'es'`). Il rate la classe des codes irréductibles région-tagués, où
`normalizeLanguageCode` rend `undefined` et où le `.toLowerCase()` conserve la
chaîne entière. C'est un repli RÉÉCRIT à la main là où une SSOT existe.

`normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`) est
précisément la SSOT du couple « normalisation-avec-repli employé partout où des
codes verbatim sont agrégés en une liste ou dédupliqués » — son repli strippe la
région pour TOUT code (`'fil-PH'` → `'fil'`). Le jumeau EXACT de cette
agrégation, `anonymous.ts:947` (`spokenLanguages`), l'utilise déjà :
`if (p.language) languageSet.add(normalizeLanguageForDedup(p.language))`.

## Impact métier

Un participant anonyme sur une locale irréductible région-taguée (`fil-PH`,
`yue-HK`) provoque une requête de traduction NLLB vers une cible (`fil-ph`) qui
n'existe pas dans la table `LANGUAGE_MAPPINGS` du translator et ne matche jamais
la clé lowercase-canonique du store `MessageTranslation`. Conséquences :

- **Requête NLLB gaspillée** (coût CPU/GPU translator) vers une cible morte.
- **Prisme rule #1 miss** : le lecteur retombe sur l'original faute de
  traduction sous la bonne clé.
- **Incohérence de cardinalité** : la même langue compte pour deux cibles.

Piège armé plus que panne massive (les locales concernées sont minoritaires),
mais exactement la classe de collision silencieuse que le dépôt corrige déjà
partout ailleurs pour `fil`/`swe` (cf. `language-normalize.ts`).

## Impact technique

Dette de cohérence : un repli de langue réécrit à la main diverge de la SSOT et
de son jumeau (`anonymous.ts`), dans la MÊME fonction que la branche inscrite qui,
elle, strippe la région. Dimension 11 (maintenabilité — UNE source par règle) et
dimension 1 (sécurité/justesse — ce qui part À CÔTÉ de la valeur nominale).

## Évaluation du risque

Très faible. Pour tout code NON région-tagué et tout code région-tagué
RÉDUCTIBLE, `normalizeLanguageForDedup(x)` rend une sortie IDENTIQUE au repli
actuel (`normalizeLanguageCode` réussit à l'identique, ou le strip de région est
un no-op faute de tag). La seule différence de comportement est la classe
irréductible région-taguée — strictement le correctif du bug. Zéro régression sur
le comportement existant, prouvé par les 6 tests pré-existants restés verts.

## Amélioration proposée

Remplacer, à `MessageTranslationService.ts:909`, le repli inline par la SSOT :

```ts
languages.add(normalizeLanguageForDedup(participant.language));
```

## Bénéfices attendus

- Branche anonyme et branche inscrite région-strippent à l'identique : une langue
  ne contribue plus jamais deux cibles divergentes.
- La règle vit à UN seul endroit (SSOT), alignée sur son jumeau `anonymous.ts`.
- Aucune requête NLLB vers une cible région-taguée morte.

## Complexité d'implémentation

Triviale : un import élargi (`normalizeLanguageForDedup`) + une ligne changée +
commentaire mis à jour. Un test de comportement ajouté.

## Critères de validation

- Test RED PROUVÉ : sous le code actuel, un anonyme `fil-PH` + un inscrit
  `systemLanguage: 'fil-PH'` rendent `['fil', 'fil-ph']` (le témoin attend
  `['fil']`) → ROUGE.
- Après correctif : `['fil']` → VERT. Les 6 tests pré-existants (dont le cas
  RÉDUCTIBLE `'EN'`/`'ES-ES'`) restent verts (7/7).
- Suites sœurs `MessageTranslationService.branches` + `.audio` vertes (183/183).
- `tsc --noEmit` gateway : 0 erreur.
