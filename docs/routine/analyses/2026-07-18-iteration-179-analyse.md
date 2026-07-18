# Iteration 179 — `getUserLanguageChoices` : codes de langue non normalisés (`pt-BR` → choix injélectable, divergence SSOT Prisme)

## Protocole (démarrage)
`main` @ `b36ffd7` (derniers merges : PR #2027/#2026 — android/feed media
gallery + collages adaptatifs). Branche `claude/brave-archimedes-5sz7mr` en
phase avec `origin/main` (0/0). Ce cycle prend **179**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/gateway/shared). Cible retenue : **Finding 3 du backlog explicite
de l'itération 178** — `getUserLanguageChoices`
(`apps/web/utils/user-language-preferences.ts`) émet des codes de langue
lowercasés mais **non normalisés**, divergeant de la source unique du Prisme
Linguistique (`resolveUserLanguage`/`normalizeLanguageCode`).

## Current state
`getUserLanguageChoices(user)` construit la liste des choix de langue affichés
dans les sélecteurs de traduction (`language-selector.tsx`,
`language-flag-selector.tsx`, `ConversationLayout`, `bubble-stream-page`). Il
émettait le `code` de chaque choix via un simple lowercase :

```ts
const systemCode = user.systemLanguage?.toLowerCase() || 'fr';
const regionalCode = user.regionalLanguage?.toLowerCase();
const customCode = user.customDestinationLanguage?.toLowerCase();
```

Les deux sélecteurs résolvent ensuite chaque choix contre le catalogue canonique :

```ts
choices.map(choice => SUPPORTED_LANGUAGES.find(lang => lang.code === choice.code))
       .filter(Boolean)   // ← un code introuvable est SILENCIEUSEMENT retiré
```

## Problems identified
1. **Choix silencieusement retiré du sélecteur.** Une préférence stockée avec un
   sous-tag de région/script (`'pt-BR'`, `'en-US'`, `'zh-Hant'` — cas réel : pref
   écrite par iOS `Locale.current.identifier` ou un `Accept-Language` web)
   produisait `code: 'pt-br'`, qui n'existe pas dans `SUPPORTED_LANGUAGES`
   (codes canoniques `'pt'`, `'en'`, `'zh'`). Le `.filter(Boolean)` des deux
   sélecteurs **supprimait alors le choix** : l'utilisateur ne pouvait plus
   sélectionner la langue qu'il avait pourtant configurée.
2. **Métadonnées (nom/drapeau) perdues.** Même pour le choix « système » toujours
   affiché, `findLanguageMeta('pt-br')` échouait → retombée sur 🇫🇷 « Français »
   au lieu de 🇧🇷/🇵🇹 « Portugais ».
3. **Divergence SSOT avec `resolveUserPreferredLanguage`.** Pour une pref
   `'pt-BR'`, `resolveUserPreferredLanguage(user)` renvoie `'pt'` (via
   `normalizeLanguageCode`) — la **cible de traduction réellement demandée** —
   tandis que le choix « système » du même utilisateur émettait `'pt-br'`. Les
   deux lectures de la même préférence, censées désigner la même langue,
   retournaient deux codes différents.

## Root cause
`getUserLanguageChoices` a été écrit avec un simple `.toLowerCase()`, jamais
rebranché sur `normalizeLanguageCode` (la SSOT qui réduit `'pt-BR'` → `'pt'`,
préserve les codes ISO 639-3 supportés `'bas'`, et rejette les codes
irréductibles inconnus). Le lowercase seul encode « casse uniforme » mais pas
« forme canonique » — insuffisant dès qu'un sous-tag BCP-47 est présent.

## Business / Technical impact
- **UX** : disparition d'une langue configurée du sélecteur de traduction —
  l'utilisateur ne peut pas choisir sa propre langue régionale/personnalisée si
  elle a été stockée avec un sous-tag. Régression silencieuse et déroutante.
- **Cohérence Prisme** : le choix « système » affiché diverge de la langue vers
  laquelle le contenu est réellement traduit (`resolveUserPreferredLanguage`),
  brisant l'invariant « une préférence = une langue ».
- **Réseau** : nul (défaut purement client-side, aucun appel supplémentaire).

## Risk assessment
Très faible. La signature (`(user) => LanguageChoice[]`) est inchangée.
`normalizeLanguageCode` est la SSOT déjà utilisée par `resolveUserLanguage`
(donc déjà dans le graphe d'import du module). Les comportements documentés sont
préservés (vérifiés par les 41 tests existants) :
- `systemLanguage` absent → `undefined` → code `'fr'`, 🇫🇷 « Français » (fallback
  historique intact) ;
- code 2-lettres inconnu (`'xx'`) → préservé tel quel (`normalizeLanguageCode`
  conserve les 2-lettres inconnus) ;
- casse mixte (`'EN'` → `'en'`) → identique.

## Correctif (TDD)
- **RED** : +5 tests (`__tests__/utils/user-language-preferences.test.ts`,
  bloc `region-subtag normalization`) — `'pt-BR'` système → code `'pt'` ;
  égalité `choices[0].code === resolveUserPreferredLanguage(user)` ;
  `'en-US'` régional → code `'en'` + méta `English` ; `'de-DE'` custom → `'de'` +
  `German` ; `'en'` + `'en-US'` → dédupliqués (longueur 1). Les 5 échouaient sur
  le code d'origine (reçu `'pt-br'`, `'en-us'`, …).
- **GREEN** : import de `normalizeLanguageCode` depuis
  `@meeshy/shared/utils/language-normalize` ; remplacement des trois
  `?.toLowerCase()` par `normalizeLanguageCode(...)`. Le meta-lookup du choix
  système passe la valeur normalisée (`systemNorm`, potentiellement `undefined`)
  pour préserver le fallback 🇫🇷 quand la pref est absente ; le code émis reste
  `systemNorm || 'fr'`.

## Validation criteria
- `__tests__/utils/user-language-preferences.test.ts` : **46/46** (41 existants +
  5 nouveaux).
- `__tests__/components/conversations/ConversationLayout.test.tsx` (consommateur
  de `getUserLanguageChoices`) : **18/18**.
- Sweep `jest -t "language"` : **706 tests / 72 suites** verts, 0 échec.
- `tsc --noEmit` : aucune erreur sur le fichier touché (le bruit tsc global
  ~1196 est un artefact d'environnement préexistant, non lié au changement) ;
  module `@meeshy/shared/utils/language-normalize` résolu (présent dans `dist`).

## Backlog (candidats consignés pour une itération future)
- **Finding 2 (iter-178)** : `routes/conversations/messages.ts:1178/1214` —
  `displayName: sender.displayName ?? sender.user?.displayName ?? null` laisse
  fuir `''` alors que l'`avatar` de la même ligne est déjà durci via
  `resolveParticipantAvatar`. À traiter via un resolver blank-aware partagé,
  APRÈS vérification que le client ne re-résout pas déjà via `getUserDisplayName`.
- F69 (`sanitizeFileName` overlong sans extension) : toujours latent, 0 appelant.
