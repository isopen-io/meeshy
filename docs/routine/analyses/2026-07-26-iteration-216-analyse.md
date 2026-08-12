# Iteration 216 — Filtre d'auto-traduction : comparaison de langue non normalisée et sensible à la casse → auto-traduction NLLB `fr → fr` qui corrompt le texte

## Protocole (démarrage)
`main` @ `208daa58` (dernier commit : feat android/auth registration nav-chrome). Branche
`claude/brave-archimedes-ujrvyv` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install` (le postinstall prisma/turbo est bloqué par le proxy),
`packages/shared/dist` reconstruit via `tsc`, `prisma generate --generator client` OK → harnais
jest gateway vert (smoke `PresenceVisibilityService` 16/16).

PRs ouvertes au démarrage — **audit anti-doublon** :
- **#2305, #2307, #2309, #2311, #2313, #2315, #2317, #2320** : vague web/gateway
  **display-name + language-display + file-size + read-tracking**. Surface : `apps/web/**`,
  `services/gateway/src/services/MessageReadStatusService.ts`.
- **#2319, #2275** : iOS (NavigationStack, a11y). Hors surface TypeScript.

Cette itération **pivote hors du swarm** (display-name / affichage de langue) vers un défaut de
**correctness dans le routage des traductions**, gateway-only, sur un fichier qu'**aucune PR
ouverte ne touche** (`MessageTranslationService.ts`). Zéro chevauchement de fichier.

## Sélection : **Priorité — correctness + Single Source of Truth (couche traduction gateway)**

Le filtre « ne pas traduire un message dans sa propre langue » comparait `message.originalLanguage`
(**stocké verbatim** — les clients envoient `Locale.current`, ex. `'fr-FR'`, `'FR'`) aux langues
cibles (**déjà normalisées lowercase** par `_extractConversationLanguages` → SSOT
`normalizeLanguageCode`) via un `===` **brut, sensible à la casse et aux tags BCP-47**.

## Current state (avant correctif)

Deux copies identiques du filtre — `_processTranslationsAsync:431-437` et
`_processRetranslationAsync:576-582` :
```ts
const filteredTargetLanguages = targetLanguages.filter(targetLang => {
  const sourceLang = message.originalLanguage;
  if (sourceLang && sourceLang !== 'auto' && sourceLang === targetLang) { // ← brut
    return false;
  }
  return true;
});
```

Et le chemin **cible explicite client** passe le code **brut** sans normalisation
(`:419-421`, `:564-566`) :
```ts
if (targetLanguage) {
  targetLanguages = [targetLanguage]; // ← 'EN' / 'en-US' non canonicalisés
}
```

## Problems identified

1. **Bug de correctness réel — auto-traduction `fr → fr`.** Un message avec
   `originalLanguage: 'fr-FR'` (ou `'FR'`) dans une conversation dont la cible normalisée est `['fr']` :
   `'fr-FR' === 'fr'` = `false` → la langue **n'est pas filtrée** → le gateway envoie une requête
   NLLB `fr → fr`. Un aller-retour NLLB **altère le texte** et stocke une fausse « traduction » du
   message de l'utilisateur. (Que l'équipe traite déjà l'aller-retour `fr → fr` comme un défaut est
   documenté dans `PostService.storyCaptionSourceFilter.test.ts:9`.)
2. **Clé de stockage non canonique (chemin cible client).** `targetLanguage: 'EN'` / `'en-US'`
   traverse verbatim jusqu'à la requête ZMQ et à la clé `MessageTranslation`. La même cible logique
   (`en`) est alors stockée sous deux clés selon le chemin — un lecteur cherchant `'en'` normalisé
   rate la traduction (violation de la règle #1 du Prisme : repli sur l'original).
3. **Duplication.** Le filtre buggé existait en **deux copies** strictement identiques → un correctif
   sur une seule ne protège pas l'autre.

## Root causes
- `message.originalLanguage` est persisté sans normalisation (`MessagingService.ts:181` :
  `request.originalLanguage?.trim()` uniquement), alors que les cibles le sont — asymétrie non
  couverte par le `===` brut.
- Le chemin cible client court-circuite la normalisation appliquée par `_extractConversationLanguages`.

## Business impact
- Corruption silencieuse du contenu utilisateur (fausse traduction stockée sur son propre message).
- Requêtes NLLB inutiles (coût CPU/GPU translator) sur chaque message dont la locale source porte un
  tag région/casse — cas **fréquent** post-i18n (iOS `Locale.current.identifier`).

## Technical impact
- Convergence sur le SSOT `normalizeLanguageCode` déjà importé (`:31`), déjà utilisé par la branche
  participant anonyme de `_extractConversationLanguages` (`:773`).
- Suppression de la duplication : un helper unique `_resolveTargetLanguages`.

## Risk assessment
Faible. `normalizeLanguageCode(x) ?? x` est **idempotent** sur les codes déjà canoniques
(`'fr'→'fr'`, `'de'→'de'`) — les 233 tests `MessageTranslationService` (dont
`audio.test.ts:697` qui asserte `targetLanguages: ['de']`) restent verts. Le garde `!== 'auto'`
(détection de langue) est préservé.

## Proposed improvements
Helper privé `_resolveTargetLanguages(originalLanguage, targetLanguages)` qui :
1. normalise chaque cible via `normalizeLanguageCode` (couvre le chemin client brut) ;
2. normalise la source (hors `'auto'`) ;
3. retire les cibles égales à la source **sur les formes normalisées**.
Les deux méthodes délèguent à ce helper.

## Expected benefits
- Fin des auto-traductions `fr → fr` (texte préservé, requêtes NLLB économisées).
- Clés de stockage `MessageTranslation` canoniques quel que soit le chemin → zéro miss du Prisme.

## Implementation complexity
Faible : +1 helper (~18 lignes), 2 sites réécrits (−12 lignes de filtre inline), 3 tests RED→GREEN.

## Validation criteria
- RED prouvé (source non patchée) : `originalLanguage:'fr-FR'`/`'FR'` cible `'fr'` → requête envoyée ;
  cible client `'EN'` → `targetLanguages:['EN']`.
- GREEN : requête **non** envoyée sur les deux premiers ; `targetLanguages:['en']` sur le troisième.
- Non-régression : 233/233 `MessageTranslationService`, 1049/1049 sur `translation|storyCaption`,
  `tsc --noEmit` gateway 0 erreur.

## Future Considerations
- `MessagingService.ts:181` pourrait normaliser `originalLanguage` **à l'écriture** (source unique en
  base) — plus large, à isoler (impacte le stockage historique).
- `routes/anonymous.ts:919-934` : agrégat `spokenLanguages`/`languageCount` de l'aperçu de lien
  partagé dédupe via `.toLowerCase()` brut au lieu de `normalizeLanguageCode` (`'en'` + `'en-US'`
  comptés deux fois). Candidat prochaine itération (stat publique, impact faible-moyen).
