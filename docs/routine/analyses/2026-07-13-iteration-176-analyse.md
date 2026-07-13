# Iteration 176 — `getTranslationFromJSON` : résolution de langue insensible à la casse (dette iter-130)

## Protocole (démarrage)
`main` @ `819fcd9` (dernier merge : PR #1904 — android/time relative-time SSOT).
Branche `claude/brave-archimedes-gnjs8h` réinitialisée sur `origin/main` (0/0).
PRs ouvertes laissées intactes (autres sessions) : #1903 (web story/status name),
#1902 (android media gallery), #1901 (gateway phone normalize), #1897 (gateway
reactions catch), #1842 (dependabot TS 6→7, risqué). Ce cycle prend **176**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/gateway/shared). Candidat retenu : dette technique **tracée
depuis iter-130** dans les notes d'itération (`getTranslationFromJSON` lookup
casse-sensible), au cœur de la résolution du Prisme Linguistique côté gateway.

## Symptôme
`getTranslationFromJSON()` (`services/gateway/src/utils/translation-transformer.ts`)
résolvait la traduction pour une langue cible par un **accès direct par clé** :

```ts
if (!translations || !translations[targetLanguage]) return undefined;
const data = translations[targetLanguage];
```

Un appel `getTranslationFromJSON(id, { en: {...} }, 'EN')` (ou `'En'`) renvoyait
`undefined` alors que la traduction anglaise existe. La casse de la langue
demandée devait matcher **exactement** la casse de la clé stockée.

## Cause racine — asymétrie avec le sibling
Le module expose deux fonctions de lecture des traductions JSON :

- `transformTranslationsToArray` — **normalise déjà** la comparaison via
  `langFilter.has(lang.toLowerCase())` (docstring : « Comparaison insensible à
  la casse »), introduit lors du filtrage bandwidth opt-in.
- `getTranslationFromJSON` — restée sur l'accès direct par clé exacte.

Les deux fonctions lisent la **même** structure `Message.translations`, mais
appliquaient deux sémantiques de résolution différentes. Rien ne garantit une
casse homogène des clés de langue en base (codes ISO écrits `en`/`EN`/`en-US`
selon la source d'écriture), donc un consommateur qui passe une langue résolue
du Prisme dans une casse différente de celle stockée obtenait un faux négatif —
et retombait, à tort, sur le contenu original.

## Correctif (TDD)
- **RED** : 4 tests ajoutés (`utils/__tests__/translation-transformer.test.ts`) :
  requête upper-case → match ; store upper-case + requête lower → clé retournée
  canonique (stockée) ; préférence au match exact quand les deux casses coexistent ;
  aucun match sous aucune casse → `undefined`. Confirmé : les 2 tests de match
  insensible échouent sur le code d'origine (`Received: undefined`), les 2 autres
  (préférence exact-case, `DE` absent) passaient déjà.
- **GREEN** : résolution en deux temps —
  1. **Fast path** : `translations[targetLanguage]` (match exact préservé, coût et
     comportement historique intacts).
  2. **Fallback** : `Object.keys(...).find(lang => lang.toLowerCase() === target)`.
  La clé retenue (`matchedKey`) sert de représentation canonique : `id`
  (`${messageId}-${matchedKey}`) et `targetLanguage` reflètent la **clé stockée**,
  exactement comme `transformTranslationsToArray` retourne `lang`.

## Vérification
- `translation-transformer.test` (les 2 suites : co-localisée + `__tests__/unit`) :
  **38/38 verts** (34 existants + 4 nouveaux).
- `tsc --noEmit -p tsconfig.json` : **aucune erreur** sur `translation-transformer.ts`
  (aucune nouvelle erreur introduite).

## Impact
- **Correction** : la lecture d'une traduction devient robuste à la casse du code
  de langue, cohérente avec la voie array du même module → un client du Prisme ne
  tombe plus sur l'original par simple divergence `en`/`EN`.
- **Cohérence (SSOT)** : les deux lectures de `Message.translations` partagent
  désormais la même sémantique de matching de langue.
- **Périmètre** : un seul fichier + son test. Fast path exact-case inchangé → zéro
  régression sur les 34 tests existants et sur tous les appels exact-case.

## Notes
- `getTranslationFromJSON` est une API publique du module **sans consommateur de
  production actuel** (utilitaire exporté + testé) : le correctif est une
  consolidation de cohérence/robustesse latente, à risque nul pour les chemins
  chauds (`transformTranslationsToArray`, lui déjà correct).
- Candidats tech-debt connexes toujours tracés hors périmètre :
  `sanitizeFileName` overlong sans extension (F69).
# Iteration 177 — `resolveParticipantAvatar` : `??` laisse fuir la chaîne vide (avatar local `''` → `<img src="">` au lieu du fallback compte)

## Protocole (démarrage)
`main` @ `1cda66f` (dernier merge : PR #1924 — android/chat message ordering SSOT).
Branche `claude/brave-archimedes-tdzs6r` réinitialisée sur `origin/main` (0/0).
Ce cycle prend **176**.

PRs ouvertes laissées intactes (périmètres à ne pas toucher) : la vague
Dependabot #1905..#1922 (bumps deps web/gateway/translator) et #1842 (TS 6→7).
Aucune ne touche `packages/shared/utils/participant-helpers.ts`.

Cible retenue : **le backlog explicite consigné par l'itération 175** —
`resolveParticipantAvatar` porte la MÊME faiblesse chaîne-vide que les mappers
story/status corrigés au cycle précédent, mais côté **source unique partagée**
(gateway), sur un chemin chaud (avatar de chaque `sender`/participant sérialisé
par les routes conversations + `MessageReadStatusService`).

Environnement : Linux, aucune toolchain Swift/Xcode → surface testable =
TypeScript. `packages/shared` : vitest, 46 suites / 1356 tests.

## Current state
`resolveParticipantAvatar` est la **source unique** de résolution de l'avatar
d'un participant (avatar local par conversation → avatar du compte lié → `null`).
Utilisée sur 10 sites gateway hot-path :
`routes/conversations/{core,search,messages,participants}.ts` (avatar de chaque
`sender`, `replySender`, `original.sender`, participant listé) et
`services/MessageReadStatusService.ts` (avatarURL des lecteurs). Implémentation :

```ts
participant?.avatar ?? participant?.user?.avatar ?? null;
```

## Problems identified
1. **Chaîne vide qui fuit → `<img src="">`.** `??` ne bascule que sur
   `null`/`undefined`. Un participant avec `avatar: ''` (cas réel : avatar
   par-conversation effacé, ou champ vide en base) renvoyait `''` au lieu de
   retomber sur l'avatar du **compte** (`user.avatar`). Le client rendait alors
   un `<img src="">` — que le navigateur résout en **rechargeant l'URL de la page
   courante** (requête réseau parasite + image cassée), exactement le défaut
   corrigé côté web à l'itération 175 (story/status transforms).
2. **Ordre de fallback court-circuité.** Pire qu'une simple valeur vide : la
   présence d'un `avatar: ''` local **masquait** un `user.avatar` valide. Un
   utilisateur avec une photo de compte parfaitement bonne apparaissait sans
   avatar dès qu'un avatar local vide traînait.
3. **Divergence avec la règle produit déjà unifiée.** L'itération 175 a acté que
   « valeur absente = null/undefined **OU vide/blanc** » pour l'identité affichée
   (nom via `getUserDisplayName` avec `.trim()`). L'avatar de cette même source
   unique restait sur la sémantique `??` incohérente.

## Root cause
`??` encode « absent = null/undefined », mais la règle métier d'un avatar est
« absent = null/undefined **OU chaîne blanche** » (une URL vide n'est pas une
URL). Les deux ne coïncident pas ; la coalescence brute laissait donc passer le
cas vide et cassait l'ordre de priorité local→compte.

## Business / Technical impact
- **UX** : perte d'avatar sur des participants/expéditeurs disposant pourtant
  d'une photo de compte, dès qu'un avatar local vide existe — incohérence
  visible partout où la gateway sérialise un `sender`.
- **Réseau** : `<img src="">` déclenche une requête parasite par avatar concerné
  (rechargement de la page courante).
- **Dette** : dernier point de fuite chaîne-vide de la résolution d'identité,
  désormais aligné sur la décision produit unifiée en 175.

## Risk assessment
Très faible. La **signature et le type de retour sont inchangés**
(`string | null`) — aucun des 10 consommateurs gateway n'est impacté. Le seul
changement de comportement (`''`/blanc → fallback compte, puis `null`) est
strictement une amélioration et ne peut pas produire d'avatar là où il n'y en
avait pas légitimement.

## Correctif (TDD)
- **RED** : +2 tests dans `__tests__/utils/participant-helpers.test.ts`
  (avatar local `''`/`'   '` → fallback `user.avatar` ; deux valeurs blanches →
  `null`). Vérifié : les 2 échouent sur le code d'origine (`Received: ""`), les
  6 existants passent.
- **GREEN** : helper local `isNonBlankAvatar` (type guard `typeof === 'string' &&
  trim() !== ''`) + résolution par `[local, compte].find(isNonBlankAvatar) ?? null`.
  Pas de boucle, immuable, composition — conforme au style du repo.

## Validation criteria
- `__tests__/utils/participant-helpers.test.ts` : 8/8.
- Suite `packages/shared` complète : **46 suites / 1356 tests** verts.
- `bun run build` (tsc `--project`) : **exit 0**, `dist` régénéré.

## Backlog (candidats consignés pour une itération future)
- Aucun nouveau point chaîne-vide identifié sur la résolution d'identité après ce
  cycle. La règle « absent = null/undefined OU blanc » est désormais homogène
  entre web (`getUserDisplayName`, story/status) et shared
  (`resolveParticipantAvatar`).
