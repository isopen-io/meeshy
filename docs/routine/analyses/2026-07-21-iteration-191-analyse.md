# Iteration 191 — `link-name-generator.ts` (web) : dette documentaire + code mort + assertions de test vacantes autour de la génération de noms de liens de partage

## Protocole (démarrage)
`main` @ `4f382b75` (derniers merges : #2255 shared/languages sentinelle
normalisé — itération **190** ; CI iOS App Store preflight). Branche
`claude/brave-archimedes-o1cs9t` alignée sur `origin/main`. Ce cycle prend
**191**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). PRs ouvertes au démarrage : swarm iOS a11y
(`laughing-thompson`, ex. #2261/#2263 CallView VoiceOver) — gérées par un autre
swarm, **non touchées** (aucune ne concerne la surface TypeScript).

Sélection : **Priorité 1 (feature récemment développée)**. `link-name-generator`
a été touché à l'itération 187 (adoption de `sliceCodePoints`, doctrine
« découper par point de code »). En repassant dessus, plusieurs artefacts de
dette exposés — item explicitement mis en file par l'itération 190 (« Future
improvements » : `MAX_LINK_NAME_LENGTH` déclaré-mais-inutilisé + docstring
d'en-tête mensongère). Feature **activement consommée** (3 sites réels :
`create-link-button.tsx`, `useLinkWizard.ts`, `links.service.ts`) et couverte
(`__tests__/utils/link-name-generator.test.ts`).

## Current state
`apps/web/utils/link-name-generator.ts` génère le nom par défaut d'un lien de
partage : `"{ChannelType} ({titre}) - {durée}"` (ex. `"Lien LinkedIn (Ma
conv…) - 7j"`). Fonctions pures, i18n sur 9 langues.

## Problems identified
1. **Constante morte `MAX_LINK_NAME_LENGTH = 32`** (ligne 24) — déclarée, jamais
   référencée. Le seul plafond réellement appliqué est `MAX_TOTAL_LENGTH = 60`
   (local à `generateLinkName`).
2. **Docstring d'en-tête mensongère** (lignes 1-6) : annonce
   `Format: "Canal [type] - [durée]"` et « Limite automatiquement à **32**
   caractères maximum ». Les deux sont faux : le format inclut le titre entre
   parenthèses, et le plafond effectif est 60. Doc en dérive directe avec le
   code — piège de maintenance (un lecteur qui fait confiance à l'en-tête
   raisonne sur un contrat inexistant).
3. **Switch vacant dans `getShortDuration`** (lignes 271-293) : quand
   `durationDays` est absent, un `switch (language)` de 9 branches (`fr`…`ar`)
   + `default` retourne **`'∞'` dans TOUS les cas**. Pure duplication morte —
   9 branches identiques là où une seule ligne suffit. Le symbole infini est
   volontairement universel (non localisé) ; le switch le maquille en décision
   par langue qui n'existe pas.
4. **Assertions de test vacantes** (`link-name-generator.test.ts` lignes 111 &
   234) : les tests « should use infinity symbol for no duration » et
   « should handle zero duration days » assertent `expect(result).toContain('')`.
   `toContain('')` est **toujours vrai** (la chaîne vide est incluse partout) —
   ces deux tests ne vérifient **rien**. Le symbole `'∞'` attendu a manifestement
   été perdu (encodage) à la rédaction. La branche « durée infinie » de
   `getShortDuration` — qu'on s'apprête à refactorer — n'était donc **pas
   réellement couverte**.

## Root causes
- (1)(2) Dérive doc/constante non nettoyée lors d'une évolution antérieure du
  format (passage de « 32 » à « titre + 60 »).
- (3) Sur-spécification défensive : un switch par langue anticipé pour un symbole
  qui s'est avéré universel, jamais collapsé.
- (4) Perte d'un caractère non-ASCII (`∞` → `''`) à l'écriture du test, masquant
  l'absence d'assertion.

## Business impact
Indirect mais réel : la génération de noms de liens est la **valeur par défaut**
proposée à l'utilisateur qui crée un lien de partage (LinkedIn/WhatsApp/…). Une
doc mensongère et du code mort augmentent le risque de régression lors des
prochaines évolutions i18n du format. Les assertions vacantes laissaient la
branche « lien sans expiration » (`durationDays` absent → `'∞'`) non gardée —
une régression y serait passée verte.

## Technical impact
Surface strictement localisée (1 util + son fichier de test). Aucune signature,
aucun type, aucun comportement de sortie modifié. Réduction nette de LOC morte
(switch 9→1) et alignement doc↔code. Renforce la couverture réelle de la branche
infinie.

## Risk assessment
Minimal. Refactor à comportement **prouvé identique** : `getShortDuration`
retourne `'∞'` pour toute langue quand `durationDays` est falsy, avant comme
après. Les tests renforcés (`toContain('∞')`) passent sur le code **actuel**
(le `'∞'` est déjà émis) — ils gardent donc le comportement pendant le collapse
du switch. Aucun consommateur n'observe `MAX_LINK_NAME_LENGTH` (grep : 0 hit hors
déclaration).

## Proposed improvements
1. Supprimer la constante morte `MAX_LINK_NAME_LENGTH`.
2. Réécrire la docstring d'en-tête pour refléter le format réel
   (`"{ChannelType} ({titre}) - {durée}"`) et le plafond réel (60, titre borné à
   20).
3. Collapser le `switch` vacant de la branche sans durée en un unique
   `return '∞'` (avec commentaire : symbole universel, non localisé).
4. Corriger les 2 assertions vacantes → `toContain('∞')` (couverture réelle de la
   branche infinie), en RED→GREEN prouvé.

## Expected benefits
- Doc↔code cohérents : plus aucun contrat fantôme dans l'en-tête.
- −~20 LOC mortes ; intention (« ∞ est universel ») rendue explicite.
- Branche « lien sans expiration » réellement gardée par le test.
- Continue la doctrine « une seule représentation / pas de duplication muette »
  des itérations 187-190, appliquée cette fois au niveau structure/tests.

## Implementation complexity
Triviale — suppressions + réécriture doc + collapse switch + 2 assertions.
Aucune migration, aucun changement d'API.

## Validation criteria
- RED prouvé : `toContain('∞')` échouerait si `getShortDuration` cessait
  d'émettre `'∞'` (garde le collapse).
- GREEN : suite `link-name-generator.test.ts` verte (assertions renforcées).
- `tsc --noEmit` : aucune erreur nouvelle sur `utils/link-name-generator.ts`.
- Aucune sortie de `generateLinkName` modifiée (comportement identique).

## Options écartées ce cycle
- **Supprimer le plafond `MAX_TOTAL_LENGTH = 60`** (quasi-inatteignable vu le
  pré-plafond du titre à 20) : **conservé** — filet défensif légitime si les
  bornes d'entrée (durée, nom de contexte) évoluent. Le retirer réduirait la
  robustesse sans gain.
- **`getLinkWord` / second switch de durée** : réellement utilisés / réellement
  par-langue (`7j`/`7d`/`7T`/`7天`…) — pas de la dette. Non touchés.

## Future improvements (itération 192+)
- **`getLanguageInfo` (shared) mémoïsation** (reporté de 190) : le fallback
  reconstruit un littéral par appel pour un code inconnu ; à évaluer si un profil
  le justifie.
- **Parité sentinelle `'unknown'` iOS/Android** (reporté de 190) : vérifier
  l'insensibilité à la casse côté miroirs.
- **`link-name-generator` i18n `getShortDuration`** : le symbole `'∞'` non
  localisé est correct, mais l'ordre RTL (`ar`) du nom complet
  `"{ctx} ({titre}) - {durée}"` pourrait justifier un audit BiDi si un rendu RTL
  concret l'expose.
