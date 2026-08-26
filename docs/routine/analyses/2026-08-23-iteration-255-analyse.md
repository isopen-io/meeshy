# Analyse — Itération 255 : deux réimplémentations web du Prisme rebranchées sur la SSOT

## Current state

Deux sites du web réduisent les préférences de langue d'un **autre participant**
à un seul code d'affichage (`languageCode`) — le code qui alimente la pastille
de langue (`LanguageOrb` / flag + nom natif) d'un contact et d'une conversation
directe :

```
apps/web/hooks/v2/use-contacts-v2.ts:53
  languageCode: user.systemLanguage || user.regionalLanguage || 'fr',

apps/web/utils/v2/transform-conversation.ts:120
  languageCode = otherUser?.systemLanguage || otherUser?.regionalLanguage || 'fr';
```

Cette échelle `systemLanguage || regionalLanguage || 'fr'` est une
**réimplémentation partielle** du Prisme Linguistique. La source de vérité —
`resolveUserLanguagesOrdered()` (`packages/shared/utils/conversation-helpers.ts`,
consommée déjà par `resolveParticipantLanguage`) — parcourt **quatre** niveaux
normalisés :

1. `systemLanguage`
2. `regionalLanguage`
3. `customDestinationLanguage`
4. `deviceLocale` (Prisme étendu 2026-05-26)

## Problems identified

1. **Deux niveaux du Prisme manquants.** Un utilisateur qui n'a configuré que
   `customDestinationLanguage` (niveau 3) ou dont seule la `deviceLocale`
   (niveau 4) est connue retombe à tort sur `'fr'`. Sa pastille affiche le
   drapeau français au lieu de sa vraie langue.
2. **Aucune normalisation.** Les préférences in-app sont persistées verbatim
   (`z.string().optional()`, aucune normalisation à l'écriture) : un
   `systemLanguage: 'EN'` (produit par une saisie/legacy en casse haute) ou
   `'pt-BR'` (BCP-47 région-tagué) atteint le resolver tel quel. L'échelle
   `||` le laisse brut, `'EN'` / `'pt-BR'`. La SSOT le canonicalise en `'en'` /
   `'pt'` via `normalizeInAppLanguage`.
3. **Violation directe de la règle SSOT du dépôt.** `CLAUDE.md` (Single Source
   of Truth) : « Language resolution: resolveUserLanguage() from
   packages/shared/. No reimplementation. » `apps/web/CLAUDE.md` répète la règle
   pour la résolution de langue. Ces deux sites la contournent.

## Root causes

Réimplémentation ad-hoc au moment d'écrire les transformers V2 (contact et
conversation) : besoin immédiat « un code de langue pour la pastille », résolu en
ligne avec les deux champs les plus visibles, sans passer par le helper partagé.
Même patron que les itérations SSOT précédentes (getUserDisplayName, flags), à
ceci près qu'ici c'est la résolution de LANGUE — le cœur du Prisme.

## Business impact

Faible mais réel et user-visible. La normalisation est déjà rattrapée en aval par
`getFlag`/`getLanguageName` (`components/v2/flags.ts`, qui appellent
`normalizeLanguageCode`), donc le drapeau des cas `'EN'`/`'pt-BR'` reste correct
sur le chemin `LanguageOrb`. Le défaut RÉSIDUEL user-visible est le niveau 3/4
manquant : un contact qui ne configure que sa langue de destination
personnalisée s'affiche « français » pour tout autre utilisateur. Le gain
principal est de **convergence** : un seul endroit décide de la résolution, et
toute évolution future du Prisme (un 5e niveau) s'applique automatiquement à ces
deux surfaces.

## Technical impact

- −2 réimplémentations du Prisme, +1 import de la SSOT sur chaque site.
- Les deux surfaces héritent désormais des 4 niveaux + normalisation, sans
  duplication de l'échelle.
- Repli terminal `'fr'` préservé à l'identique (`?? 'fr'`), zéro régression sur
  les codes déjà canoniques (`resolveUserLanguagesOrdered` est idempotente).

## Risk assessment

Très faible. `resolveUserLanguagesOrdered` est déjà la SSOT couverte par ses
propres tests et consommée en production (`resolveParticipantLanguage`, iOS,
Android). Le contrat de retour préservé : top de la liste ordonnée, sinon `'fr'`
— strictement un sur-ensemble de l'ancien comportement (mêmes deux premiers
niveaux, deux niveaux ajoutés, normalisation ajoutée). Le test existant
`languageCode: 'ja'` reste vert. Les 4 champs (`systemLanguage`,
`regionalLanguage`, `customDestinationLanguage?`, `deviceLocale?`) sont tous
déclarés sur `SocketIOUser` (= `User`), donc aucun cast.

## Proposed improvements (implemented)

1. `use-contacts-v2.ts` : `resolveUserLanguagesOrdered(user, { deviceLocale:
   user.deviceLocale })[0] ?? 'fr'`.
2. `transform-conversation.ts` : idem sur `otherUser`, gardé sur la présence de
   `otherUser` (le cas groupe reste `'multi'`, inchangé).

Résolution par CONSOLIDATION (pas suppression) : contrairement aux séries
250–254 (code mort), ici les deux sites sont VIVANTS et rendus à l'écran — ils se
corrigent en les rebranchant sur la SSOT, pas en les retirant.

## Expected benefits

- Le Prisme complet (4 niveaux + normalisation) sur les pastilles de langue des
  contacts et des conversations directes.
- Un seul décideur de résolution ; les futures évolutions du Prisme s'y
  propagent gratuitement.
- Deux réimplémentations de moins à maintenir en parité avec la SSOT.

## Implementation complexity

Triviale : deux imports, deux expressions. TDD RED→GREEN sur les deux suites
existantes.

## Validation criteria

- Tests RED d'abord (custom-destination-only → `'fr'`, `'EN'`/`'pt-BR'` bruts),
  puis GREEN après fix. ✅
- `transform-conversation.test.ts` + `use-contacts-v2.test.tsx` verts (39). ✅
- Aucune régression : `utils/v2` + `hooks/v2` + `__tests__/utils` (52 suites,
  1236 tests) verts. ✅
- `tsc --noEmit` : mes 4 fichiers n'ajoutent aucune erreur (baseline dépôt
  inchangée). ✅

## Suivi — série SSOT / convergence

Les sites SENDER (`transformers.service.ts:205`,
`meeshy-socketio.service.ts:524`) NE sont PAS des réimplémentations du Prisme :
ils reconstruisent les CHAMPS `systemLanguage`/`regionalLanguage` structurés d'un
`sender` (passthrough de champ avec repli), pas un code résolu unique — hors
scope, laissés intacts à dessein.
