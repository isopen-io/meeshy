# Iteration 185 — `compareFullNames` (gateway) : `normalizeName` supprime tout caractère non-latin → deux identités **identiques** en écriture non-latine (cyrillique/arabe/CJK) jugées `'different'`, la récupération de compte jamais proposée

## Protocole (démarrage)
`main` @ `7f85463` (derniers merges : #2146 gateway deviceCountry debounce borné +
`limit=0` plancher — itération **183**, #2173 sdk/story, #2167 ios/a11y). Branche
`claude/brave-archimedes-bpitnb` réinitialisée sur `origin/main`. Ce cycle prend
**185** (184 = helpers d'affichage de langue web, consigné).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared/web). Sélection : revue **Priorité 1** (fonctionnalités
récentes) — balayage des `utils/` gateway récemment ajoutés autour de la
récupération de compte téléphone. `name-similarity.ts` (comparaison d'identité pour
proposer la récupération d'un compte dormant) est un ajout serveur récent jamais
audité pour l'internationalisation, alors que l'arabe, le chinois et le cyrillique
sont des langues de première classe du produit (Prisme).

## Current state
`services/gateway/src/utils/name-similarity.ts` décide, quand un numéro de
téléphone appartient déjà à un compte dormant, si l'identité déclarée à
l'inscription est assez proche de celle du compte existant pour **proposer la
récupération** plutôt qu'un simple transfert. Le cœur est `normalizeName` (ligne 18) :

```ts
function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')          // retire les diacritiques (José → jose)
    .replace(/[^a-z0-9]+/g, ' ')     // ← ne garde QUE l'ASCII a-z0-9
    .replace(/\s+/g, ' ')
    .trim();
}
```

`compareFullNames` (ligne 62) :

```ts
const sortedA = tokenSortedFullName(a);
const sortedB = tokenSortedFullName(b);
if (!sortedA || !sortedB) return 'different';   // ligne 66
if (sortedA === sortedB) return 'exact';        // ligne 67
return diceCoefficient(sortedA, sortedB) >= 0.62 ? 'similar' : 'different';
```

`NFD` + suppression `\p{M}` ne folde que les diacritiques **latins** vers l'ASCII ;
il ne translittère PAS le cyrillique, l'arabe, l'hébreu, le grec ni le CJK. Le
`.replace(/[^a-z0-9]+/g, ' ')` final **supprime alors intégralement** tout caractère
non-latin. Toute identité écrite entièrement dans un script non-latin se normalise
donc en **chaîne vide**.

## Problems identified
1. **Deux identités identiques non-latines jugées `'different'`.** Pour
   `compareFullNames({firstName:'Владимир',lastName:'Путин'}, {même})` : les deux
   côtés se normalisent en `''`. La garde ligne 66 `if (!sortedA || !sortedB)` se
   déclenche **avant** la ligne 67 (`=== → 'exact'`) — retour **`'different'`**
   alors que les entrées sont octet-pour-octet identiques. Idem arabe
   (`أحمد علي`), chinois (`王伟`), grec, hébreu. La branche `'exact'` est
   **inatteignable** pour toute identité entièrement non-latine, et `'similar'`
   aussi (deux `''` → `diceCoefficient` retourne 0).
2. **Impact produit réel.** La fonction gouverne la **récupération de compte**
   (en-tête du fichier, lignes 2-7). Pour un utilisateur dont le nom déclaré est en
   écriture non-latine — arabe, chinois, cyrillique, toutes langues de première
   classe du Prisme — le contrôle qui devrait dire « correspondance exacte, proposer
   la récupération » dit **toujours** « différent » : la récupération n'est jamais
   offerte, même pour des noms strictement identiques. Un test d'égalité qui
   retourne « pas égal » pour des entrées identiques est un défaut de correction
   auto-évident, indépendant de toute intention i18n.
3. **Régression de test invisible.** `name-similarity.test.ts` ne couvre que du
   latin / latin-accentué (`José ≡ Jose`) + un cas « un côté vide ». Aucun cas
   cyrillique/arabe/CJK → le défaut passe entre les mailles.

## Root cause
La classe finale `[^a-z0-9]` traite la normalisation comme un problème **ASCII**.
Le pipeline `NFD` + `\p{M}` réalise correctement l'insensibilité aux accents
latins (le diacritique est décomposé puis retiré, la base ASCII survit), mais la
classe de conservation ASCII-only jette ensuite toute lettre non-latine — alors
que ces lettres sont précisément le contenu signifiant d'un nom non-latin. Le
défaut n'est donc **pas** l'ordre des gardes de `compareFullNames` (un simple
réordonnancement ferait passer deux noms cyrilliques **différents** — tous deux
`''` — pour `'exact'`, ce qui serait pire) : c'est la conservation ASCII-only.

## Business / Technical impact
- **UX / récupération de compte** : population non-négligeable (marchés
  arabophone, sinophone, russophone) systématiquement privée de la proposition de
  récupération de son propre compte dormant → friction, tickets support, perte de
  compte perçue.
- **Correction** : `compareFullNames` viole sa sémantique de base (`f(x, x)` doit
  être `'exact'`) sur tout un pan de l'espace d'entrée.
- **Risque** : nul — `name-similarity.ts` est un module pur, sans état, un seul
  point d'appel (flux de récupération). La correction ne change rien pour l'ASCII.

## Risk assessment
Très faible. Fonction pure, déterministe, testable trivialement. Le fix est une
substitution de classe de caractères (`[^a-z0-9]` → `[^\p{L}\p{N}]` avec flag `u`)
qui **préserve** le comportement latin existant (José → jose inchangé, tokens
Jean-Pierre inchangés) et **ajoute** la conservation des lettres/chiffres Unicode.
La garde chaîne-vide (ligne 66) reste correcte pour les entrées réellement
non-normalisables (emoji/ponctuation pure), qui n'atteignent de toute façon jamais
ce code (la validation `AuthSchemas.register` exige des lettres).

## Proposed improvements
1. Remplacer `.replace(/[^a-z0-9]+/g, ' ')` par `.replace(/[^\p{L}\p{N}]+/gu, ' ')`
   dans `normalizeName`.
2. **RED d'abord** : ajouter des cas cyrillique/arabe/CJK à `name-similarity.test.ts`
   — identiques → `'exact'`, typo proche → `'similar'`, non liés → `'different'` —
   qui échouent sur le code actuel puis passent après le fix.

## Expected benefits
- `compareFullNames` respecte `f(x, x) === 'exact'` sur **tous** les scripts.
- Récupération de compte proposée équitablement quelle que soit l'écriture du nom.
- Bigrammes de Sørensen–Dice opèrent sur le contenu réel des noms non-latins →
  détection de typo (`'similar'`) fonctionnelle hors ASCII.

## Implementation complexity
Triviale — une ligne modifiée + tests. Aucune dépendance, aucune migration.

## Validation criteria
- Nouveaux tests cyrillique/arabe/CJK : RED sur `origin/main`, GREEN après fix.
- Suite `name-similarity.test.ts` existante : inchangée, toujours verte (parité
  ASCII stricte).
- Suite gateway complète : aucune régression.

## Findings secondaires (non traités ce cycle — consignés)
- **`rate-limiter.ts:12`** : docstring annonce « Sliding window » alors que
  `MemoryStore`/`RedisStore` implémentent une **fenêtre fixe/tumbling** (burst
  double possible à cheval sur la frontière). Divergence doc-vs-code ; le
  comportement runtime est défendable → priorité moindre.
- **`notification-strings.ts:476`** : `lc.startsWith('zh') → 'zh-Hans'` mappe
  `zh-Hant` (traditionnel) et `zha` (Zhuang, 639-3) sur le chinois simplifié.
  Possiblement best-effort intentionnel (une seule variante chinoise supportée) →
  à confirmer avant de toucher.
