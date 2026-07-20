# Iteration 182 — `PostTranslationService` ne normalise pas `originalLanguage` → un code source régional (`en-US`, `pt-BR`, `EN`) défait la garde « ne pas traduire vers la langue source »

## Protocole (démarrage)
`main` @ `b48eee44` (derniers merges : #2075/#2073/#2070 android/status realtime,
#2068 android/status L2 cache, #2057 gateway/device-locale bounded cache — iter
181). Branche `claude/brave-archimedes-pqqa0p` réinitialisée sur `origin/main`.
Ce cycle prend **182**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared/web). Point de départ : **revue Priorité 1**
(fonctionnalités récentes) sur le dispatcher de traduction posts/comments —
thème langue/normalisation (continuité directe des itér. 176/180 qui ont
uniformisé les *autres* resolvers du Prisme, mais PAS ce dispatcher).

## Current state
`services/gateway/src/services/posts/PostTranslationService.ts` orchestre la
traduction texte des posts et commentaires via ZMQ vers les 5 langues top
(`TOP_LANGUAGES = ['fr','en','es','ar','pt']`, codes 2-lettres lowercase). Les
3 points d'entrée dérivaient la langue source SANS normalisation :

```ts
// translatePost / translateComment
const sourceLang = originalLanguage ?? detectLanguage(content);
const targetLanguages = TOP_LANGUAGES.filter(l => l !== sourceLang);

// translateOnDemand
const sourceLang = post.originalLanguage ?? detectLanguage(post.content);
if (sourceLang === targetLanguage) return;          // garde same-language
if (translations?.[targetLanguage]) return;         // garde cache
```

`detectLanguage` retourne toujours un code 2-lettres canonique, donc le chemin
détection est sain. **Le seul chemin non normalisé est le code fourni par le
client.**

## Problems identified
1. **Garde « ne pas traduire vers la source » défaite (correctness + gaspillage).**
   Le schéma Zod de création de post autorise `originalLanguage:
   z.string().min(2).max(5)` — donc `'en-US'`, `'pt-BR'`, `'fr_FR'`, ou même
   `'EN'` (majuscule) passent la validation et sont stockés **verbatim**
   (`PostService.ts:117`, aucune normalisation à l'écriture), puis atteignent le
   dispatcher tels quels. `['fr','en','es','ar','pt'].filter(l => l !== 'en-US')`
   **ne retire pas `'en'`** → le post anglais est traduit **vers l'anglais**
   (job NLLB en→en inutile, un par post/commentaire concerné — coût GPU réel à
   l'échelle 100k+).
2. **Traduction redondante stockée comme cible + violation du Prisme.** Le
   résultat en→en est persisté sous `translations['en']`
   (`handlePostTranslationCompleted:238`), alors que `post.originalLanguage`
   reste `'en-US'`. Comme `'en-US' !== 'en'`, la langue d'origine réapparaît
   comme une **fausse « traduction »** dans l'UI Prisme, et un lecteur anglophone
   se voit servir le round-trip NLLB `translations['en']` **au lieu du texte
   original authoré** — exactement l'anti-pattern que le Prisme interdit
   (règle critique #1).
3. **`translateOnDemand` : gardes same-language ET cache manquées.** Le schéma
   on-demand (`TranslatePostSchema.targetLanguage: z.string().min(2).max(5)`)
   admet aussi un code régional. Pour `post.originalLanguage='en-US'` +
   `targetLanguage='en'`, `'en-US' === 'en'` est faux → la garde ne skippe pas →
   re-traduction en→en. Et pour un `targetLanguage='pt-BR'` alors que
   `translations['pt']` existe déjà, `translations['pt-BR']` est `undefined` →
   re-traduction déjà en cache, stockée sous une clé divergente `'pt-BR'`.

## Root cause
Le dispatcher réimplémentait la dérivation de langue à la main sans déléguer à la
SSOT `normalizeLanguageCode` (`@meeshy/shared/utils/language-normalize`) — le même
oubli que les itér. 176/180 ont corrigé pour `resolveUserLanguage` /
`getUserLanguageChoices`. La normalisation manquait au **dernier site serveur**
qui compare un code de langue fourni par le client à un ensemble de codes
canoniques.

## Business / Technical impact
- **Coût GPU / réseau (translator)** : un job de traduction en→en (ou pt→pt, …)
  totalement inutile par post/commentaire dont le client a envoyé un code
  régional. iOS envoie `Locale.current.identifier` (`en-US`, `fr-FR`), le web
  `Accept-Language` — cas réels, pas hypothétiques.
- **UX / Prisme** : un lecteur dans la langue source voit une re-traduction
  NLLB dégradée au lieu du texte original — violation directe de la philosophie
  produit.
- **Cohérence des données** : clés `translations` divergentes (`'en'` +
  `'en-US'`, `'pt'` + `'pt-BR'`) qui gonflent le document et faussent les
  vérifications de cache en aval.
- **Correctness** : inchangée pour les codes déjà canoniques (2-lettres
  lowercase) — parité stricte, `normalizeLanguageCode('en') === 'en'`.

## Risk assessment
Très faible. Aucune signature publique modifiée. `normalizeLanguageCode` est un
no-op sur un code déjà canonique et retombe sur `detectLanguage(content)` (source)
ou le code brut (cible) quand il ne sait pas canoniser — zéro régression pour les
41 tests préexistants. Le seul changement observable est **positif** : un code
régional est désormais réduit à sa forme canonique avant filtrage/cache/ZMQ.

## Proposed improvements / Correctif (TDD)
- **RED** : +7 tests (`PostTranslationService.test.ts`, bloc « language-code
  normalization (Prisme SSOT) ») couvrant : `translatePost` avec `'en-US'` et
  `'EN'` ; `translateComment` avec `'pt-BR'` ; `translateOnDemand` source
  régionale skippée, cible régionale vs source, cible régionale vs cache, et
  envoi ZMQ de la cible **normalisée**.
- **GREEN** :
  1. `import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize'`.
  2. `translatePost` / `translateComment` :
     `const sourceLang = normalizeLanguageCode(originalLanguage) ?? detectLanguage(content);`
  3. `translateOnDemand` : normaliser **source ET cible**
     (`const target = normalizeLanguageCode(targetLanguage) ?? targetLanguage;`),
     puis utiliser `target` dans la garde same-language, la garde cache, l'appel
     ZMQ (`[target]`) et les logs — la clé `translations.<code>` persistée reste
     ainsi canonique.

## Expected benefits
- Suppression d'une classe de jobs de traduction inutiles (source→source) sur le
  chemin posts/commentaires.
- Respect strict du Prisme : la langue source n'est jamais servie comme une
  traduction.
- Clés `translations` canoniques et uniques — cache fiable, document compact.

## Implementation complexity
Faible — 1 import + 3 dérivations de langue normalisées dans un seul fichier déjà
couvert par tests.

## Validation criteria
- `services/gateway` : `PostTranslationService.test.ts` **48/48** verts (7
  nouveaux, 41 préexistants inchangés).
- Suites `src/services/posts` + `src/routes/posts` : **232/232** verts.
- `tsc --noEmit` gateway : **0** erreur.

## Backlog (candidats consignés pour une itération future)
- **F182-A (cosmétique)** : `apps/web/lib/status-transforms.ts:24,27` +
  `story-transforms.ts:301,304` émettent `languageName: languageCode` (lowercase
  brut) là où tous les autres appelants de `TranslationToggle` passent
  `languageCode.toUpperCase()`. Purement visuel (label de code dans le picker de
  traduction Mood/Story). Un test existant (`status-transforms.test.ts:70-71`)
  **codifie** le comportement lowercase → à mettre à jour en même temps.
- **F182-B (i18n)** : `apps/web/components/v2/StatusBar.tsx:40` — fallback
  hardcodé `'Expire'` non localisé quand `formatTimeRemaining` renvoie `null`
  (statut expirant live in-view). Router via le `useI18n('components')` déjà
  présent. Basse fréquence (le gateway filtre les statuts expirés côté serveur).
