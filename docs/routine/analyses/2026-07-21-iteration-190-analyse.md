# Iteration 190 — `getLanguageInfo` (shared SSOT) : le sentinelle `'unknown'` / vacuité est testé sur le code **brut** alors que le reste de la fonction normalise (`toLowerCase().trim()`) → `'Unknown'` / `' unknown '` retombe sur le fallback globe `🌐` au lieu du défaut français

## Protocole (démarrage)
`main` @ `b1ab3c9` (derniers merges : #2254 android/profile presence SSOT ;
itération **189** `8cdf6c0` web — `validateMessageContent` mesure la longueur
après `trim`). Branche `claude/brave-archimedes-ereq4q` réinitialisée sur
`origin/main`. Ce cycle prend **190**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances `packages/shared` via `bun install`.
Harnais validé ce cycle : `packages/shared` vitest — **47 fichiers, 1384 tests**
verts (dont `languages.test.ts`, 56).

PRs ouvertes au démarrage : 24 PRs iOS (`laughing-thompson` swarm, tracks
a11y/i18n/design-system), toutes gérées par un autre swarm — **non touchées**
(aucune ne concerne la surface TypeScript de cette itération).

Sélection : **Priorité 1/continuité directe**. Les itérations 187/188/189 ont
appliqué la doctrine « normaliser une seule fois, de façon cohérente » aux utils
web (`initials.ts`, `truncate.ts`, `community-identifier.ts`,
`link-name-generator.ts`, `messaging-utils.ts`). Le même défaut de classe subsiste
dans la **SSOT partagée** `getLanguageInfo` — le point de résolution de langue le
plus consommé (rendu par message dans `BubbleMessageNormalView` /
`MessageActionsBar` / `EditMessageView`). Les items 189 « futurs » 1
(`getLanguageInfo` casse du `code`) et 3 (`validateMessageContent` en points de
code) ont été écartés — voir « Options écartées » ci-dessous.

## Current state
`packages/shared/utils/languages.ts` — `getLanguageInfo(code)` résout les
métadonnées d'une langue (name, flag, color, capacités TTS/STT). Contrat public
documenté et testé :
- `undefined` / `''` / `'   '` / `'unknown'` → **défaut français** (Prisme :
  détection impossible → langue par défaut).
- code supporté (insensible à la casse et aux espaces) → l'entrée du cache.
- code inconnu → fallback globe `🌐` (`name = code.toUpperCase()`).

```ts
if (!code || code.trim() === '' || code === 'unknown') {   // ← sentinelle sur le BRUT
  return languageCache.get('fr')!;
}
const normalizedCode = code.toLowerCase().trim();          // ← reste normalise
const found = languageCache.get(normalizedCode);
```

## Problems identified
1. **Incohérence de mesure du sentinelle → `'unknown'` casé/espacé rate le défaut
   français.** Le check de vacuité + sentinelle opère sur la chaîne **brute**
   (`code === 'unknown'`), alors que le lookup et le fallback opèrent sur la
   chaîne **normalisée**. Conséquence :
   - `getLanguageInfo('Unknown').code` → **`'unknown'`** (fallback globe,
     `name: 'UNKNOWN'`) au lieu de `'fr'`.
   - `getLanguageInfo('UNKNOWN')` → idem.
   - `getLanguageInfo('  unknown  ')` → idem (les espaces contournent
     `code === 'unknown'` ET la garde `code.trim() === ''` ne matche pas non plus
     puisque le trim n'est pas vide).
   La fonction expose pourtant explicitement une intention d'insensibilité casse
   (test « should handle case insensitivity », `'FR'` → `'fr'`) et espaces (test
   « should trim whitespace », `'  en  '` → `'en'`). Le sentinelle échappait à
   cette intention.
2. **Aucune couverture du sentinelle non-canonique.** Seule la forme exacte
   `'unknown'` (minuscule, sans espace) était testée — la variation de casse /
   whitespace passait entre les mailles.

## Root causes
Deux mesures de la même grandeur (« forme canonique du code ») sur deux
représentations : brute pour le sentinelle, normalisée pour le lookup/fallback.
Le sentinelle doit tester la forme **normalisée**, seule représentation que la
fonction utilise ensuite. Défaut de la même classe que ceux corrigés aux
itérations 187–189 (mesurer une propriété sur la représentation réellement
utilisée en aval).

## Business impact
`getLanguageInfo` est la SSOT de résolution de langue consommée à chaque rendu de
bulle de message (badge langue original, sélecteur de traductions). Un
`originalLanguage`/`sourceLanguage` persisté ou reçu sous une forme non-canonique
(`'Unknown'`, ou avec un espace de sérialisation) afficherait un badge globe `🌐`
« UNKNOWN » au lieu du drapeau français attendu — bruit visuel direct dans le
fil, en violation du Prisme (le contenu à langue indéterminée doit retomber
proprement sur la langue par défaut, pas afficher un artefact d'erreur).

## Technical impact
Surface minimale (1 fonction pure, 1 fichier). Aligne le sentinelle sur la
normalisation déjà présente — élimine une classe entière de non-résolutions du
défaut français. **Zéro duplication ajoutée**, aucune signature/type modifié.

## Risk assessment
Minimal. Fonction pure sans effet de bord. Le seul changement observable est
l'**élargissement** du défaut français aux formes casées/espacées de `'unknown'`
et de vacuité — jamais l'inverse. Vérification exhaustive du contrat existant :
- `undefined` → `normalizedCode = ''` → français ✓ (inchangé)
- `''` / `'   '` → `''` → français ✓ (inchangé — `'   '.trim() === ''`)
- `'unknown'` → `'unknown'` → français ✓ (inchangé)
- `'FR'` / `'  en  '` → `'fr'` / `'en'` → trouvé ✓ (inchangé)
- `'xyz'` → `'xyz'` → fallback globe ✓ (inchangé)
- `'Unknown'` / `'  unknown  '` → `'unknown'` → **français** (corrigé).

## Proposed improvements
Extraire `const normalizedCode = code?.toLowerCase().trim() ?? ''` **avant** le
sentinelle, puis tester `normalizedCode === '' || normalizedCode === 'unknown'`.
Une seule représentation mesurée partout.

## Expected benefits
- `'Unknown'` / `'UNKNOWN'` / `' unknown '` retombent sur le défaut français,
  conformément au contrat implicite (insensibilité casse + espaces).
- Cohérence interne : vacuité, sentinelle, lookup et fallback mesurent tous la
  forme normalisée.
- Continue la doctrine « normaliser une fois » sur la dernière fonction de
  résolution de langue live encore porteuse du défaut.

## Implementation complexity
Triviale — 3 lignes réorganisées, aucune signature/type changé, aucune migration.

## Validation criteria
- RED → GREEN prouvé sur `languages.test.ts` (2 nouveaux tests : casse +
  whitespace du sentinelle échouent sans le correctif, passent avec).
- 56/56 sur `languages.test.ts`, **1384/1384** sur les 47 fichiers vitest de
  `packages/shared`.
- `tsc --noEmit` : aucune erreur sur `utils/languages.ts`.

## Options écartées ce cycle
- **Item 189-futur 1** (`language-utils.ts:166` web `getLanguageInfo` renvoie
  `code` verbatim vs `name`/`flag` normalisés) : **faible valeur** — ses seuls
  consommateurs (`getAllSupportedLanguages`, `searchLanguages`) passent des codes
  déjà minuscules (`Object.keys(LANGUAGE_NAMES)`) ; les composants message
  importent la SSOT shared, pas cet util. Différé.
- **Item 189-futur 3** (`validateMessageContent` en points de code plutôt qu'en
  unités UTF-16) : **introduirait une divergence client/serveur**. Le gateway
  (`message-limits.ts:37`, `MessageValidator.ts:41`) borne aussi en
  `content.length` (UTF-16). Passer le client en points de code ferait accepter
  côté client des messages que le serveur rejette. À ne PAS faire sans changement
  gateway coordonné (bornes différentes : 1024 client vs 4000 gateway + limites
  modérateur). Correctement différé.

## Future improvements (itération 191+)
- **`MAX_LINK_NAME_LENGTH`** (`apps/web/utils/link-name-generator.ts:24`) :
  constante déclarée-mais-inutilisée + docstring d'en-tête annonce « 32
  caractères » alors que le code plafonne à `MAX_TOTAL_LENGTH = 60`. Nettoyage
  documentaire / dead-code (pas un mauvais output). Candidat propre à faible
  risque.
- **`getLanguageInfo` (shared)** : le fallback reconstruit un objet littéral à
  chaque appel pour un code inconnu ; `MessageActionsBar` appelle
  `getLanguageInfo(originalLanguage)` plusieurs fois inline par rendu. Micro-perf
  (mémoïsation possible) — à évaluer si un profil le justifie.
- **`'unknown'` sentinelle miroir** : vérifier que les miroirs iOS/Android de
  résolution de langue traitent `'unknown'` de façon casse-insensible (parité
  cross-plateforme).
