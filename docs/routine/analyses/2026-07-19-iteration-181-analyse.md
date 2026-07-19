# Iteration 181 — Statistique `spokenLanguages` + gate `allowedLanguages` du lien anonyme réimplémentent la normalisation de langue à la main (SSOT `normalizeLanguageCode` non branchée)

## Protocole (démarrage)
`main` @ `34c6745` (derniers merges : #2046 android/status mood-status,
#2044 web/i18n normalize language codes, #2042 android/feed comment mentions…).
Branche `claude/brave-archimedes-bsh0z6` réinitialisée sur `origin/main`. Ce cycle
prend **181**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Point de départ : revue d'ingénierie fraîche des
émetteurs de codes langue gateway restés hors SSOT (les backlogs 179/180 —
`MeeshySocketIOManager.ts:752`, F69 — étant marqués « à ne pas uniformiser sans
analyse dédiée » / « 0 appelant »).

## Current state
La route `GET /anonymous/link/:identifier`
(`services/gateway/src/routes/anonymous.ts`) renvoie une statistique
`stats.spokenLanguages` + `stats.languageCount` (langues distinctes parlées dans
la conversation, consommée par le web `JoinInfo` / `link-details-modal` et les
models `ShareLink` iOS/Android). Le set de langues était construit par
`.toLowerCase()` brut :

```ts
if (p.user.systemLanguage) languageSet.add(p.user.systemLanguage.toLowerCase());
if (p.user.regionalLanguage) languageSet.add(p.user.regionalLanguage.toLowerCase());
if (p.user.customDestinationLanguage) languageSet.add(p.user.customDestinationLanguage.toLowerCase());
// ...
if (p.language) languageSet.add(p.language.toLowerCase());
```

De même, le gate d'accès `POST /anonymous/join/:linkId` comparait chaque entrée
`allowedLanguages` par `.toLowerCase()` brut :

```ts
!shareLink.allowedLanguages.some((l) => l.toLowerCase() === body.language)
```

alors que `body.language` est **déjà** normalisé au boundary d'écriture du schema
(ligne ~27 : `normalizeLanguageCode(v) ?? v.toLowerCase()`).

`.toLowerCase()` met en minuscules mais **ne supprime pas** les sous-tags région
BCP-47. La forme canonique employée partout ailleurs (cibles de traduction,
mapping NLLB, `MessageTranslation.targetLanguage`, et le call-site voisin
`MessageTranslationService.ts:799` qui construit son set via
`normalizeLanguageCode(participant.language) ?? participant.language.toLowerCase()`)
est le code 2-lettres (ou ISO-639-3 supporté).

## Problems identified
1. **`spokenLanguages` sur-compte les variantes régionales.** Une conversation
   avec un participant `systemLanguage: 'pt-BR'` (issu de `Locale.current` iOS /
   `Accept-Language` web, persisté verbatim) et un autre `regionalLanguage: 'pt'`
   produisait `{'pt-br', 'pt'}` → `languageCount: 2` pour **une seule** langue. Un
   participant anonyme `language: 'en-US'` était compté `'en-us'` (code qui ne
   matche aucune traduction) au lieu de `'en'`. La statistique affichée sur
   l'écran de join sur-estime le nombre de langues et expose des tags
   non-canoniques (`pt-br`).
2. **Gate `allowedLanguages` rejette à tort (403) une langue légitime.** Un lien
   configuré avec `allowedLanguages: ['en-US']` (ou casse mixte `'EN'`) comparait
   `'en-us' === 'en'` (body normalisé) → `false` → **403 Langue non autorisée**
   pour un participant pourtant autorisé.
3. **Divergence de SSOT (dette).** Le même fichier normalise correctement au
   boundary d'écriture (ligne 27) et le call-site voisin
   `MessageTranslationService.ts:799` utilise l'idiome canonique, mais ces deux
   sites de **lecture/comparaison** réécrivaient la règle à la main — exactement le
   pattern uniformisé par les itérations 179 (avatar/displayName) et 180
   (`getUserLanguageChoices` web).

## Root cause
Ces deux sites (statistique + gate) réimplémentaient la « normalisation de code
langue » via `.toLowerCase()` au lieu de déléguer à la SSOT
`normalizeLanguageCode`, en violation directe de la règle du
`services/gateway/CLAUDE.md` : « Language Resolution — ALWAYS use the SSOT, NEVER
reimplement locally ». La normalisation manquait aux **deux derniers émetteurs de
codes langue** de la route anonyme.

## Business / Technical impact
- **UX (écran de join, tous clients)** : compte de langues gonflé + tags
  non-canoniques affichés dans les infos du lien.
- **Accès (bug fonctionnel)** : rejet 403 injustifié pour tout lien configuré avec
  une langue sous-taguée région ou en casse non-lowercase.
- **Cohérence** : les deux sites passent enfin par la même SSOT que le boundary
  d'écriture du même fichier et que `MessageTranslationService`.

## Risk assessment
Très faible. `normalizeLanguageCode` est idempotent et déjà en production partout
(y compris ligne 27 du même fichier). Le repli `?? value.toLowerCase()` préserve la
visibilité des codes inconnus/legacy (ex. `'ZZ'` → `'zz'`) — aucun code n'est
supprimé de la statistique. Type de retour des routes inchangé. Aucune requête
Prisma modifiée. Miroir strict d'un pattern déjà shippé.

## Proposed improvements / Correctif (TDD)
- **RED** : +4 tests (`anonymous.test.ts`) :
  - `spokenLanguages` : `'pt-BR' + 'EN' + 'pt' + 'en-US'` → `['en', 'pt']`,
    `languageCount: 2`.
  - garde de repli : `'ZZ'` (non supporté) → `['zz']` (jamais supprimé).
  - gate `allowedLanguages` : lien `['EN-US']`, langue `'en-US'` → **pas 403**.
  - (les 19 tests existants restent verts.)
- **GREEN** :
  1. `anonymous.ts` statistique — helper local `addLang` :
     `languageSet.add(normalizeLanguageCode(value) ?? value.toLowerCase())` appliqué
     aux 4 sources (`systemLanguage`/`regionalLanguage`/`customDestinationLanguage`/
     `language`).
  2. `anonymous.ts` gate — chaque entrée `allowedLanguages` passe par
     `normalizeLanguageCode(l) ?? l.toLowerCase()` avant comparaison à
     `body.language`.

## Expected benefits
- `spokenLanguages` / `languageCount` canoniques et dé-dupliqués par langue réelle.
- Gate `allowedLanguages` tolérant aux sous-tags région / casse mixte côté config.
- Parité stricte lecture ↔ écriture du même fichier ↔ `MessageTranslationService`.

## Implementation complexity
Faible — délégation à un helper existant sur 2 sites d'un même fichier.

## Validation criteria
- `services/gateway` : `anonymous.test.ts` **23/23** verts (4 nouveaux) ; RED
  confirmé (2 échecs sans le correctif source).
- `tsc --noEmit` : **0 erreur** sur `routes/anonymous.ts` (baseline pré-existante
  de 13 erreurs `auth/login.ts` + `auth/magic-link.ts`, hors périmètre, inchangée).

## Backlog (candidats consignés pour une itération future)
- `MeeshySocketIOManager.ts:752` — ordre de résolution différent
  (`username ?? displayName ?? …`, sémantique « présence key ») : hors périmètre,
  à ne PAS uniformiser sans analyse dédiée.
- F69 (`sanitizeFileName` overlong sans extension, `apps/web/utils/xss-protection.ts`)
  — bug logique réel avec test file mais **0 appelant** en production ; à traiter si
  un appelant apparaît.
