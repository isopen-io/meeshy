## Doubles de test partiels (#6296) — le risque réel est « classe exportée + `instanceof` externe », pas « classe exportée »

**Le fait mesuré** : #6294 a fermé un cas précis (`utils/withMutationLog`,
`MutationResultGone` laissée à `undefined` par un double partiel). #6296
demandait de mesurer si le motif dépasse ce seul module — il dépasse : 397
modules locaux du gateway sont totalement doublés (`jest.mock(path, () =>
({...}))` sans `jest.requireActual`), sur 2 592 sites ; 93 d'entre eux
exportent au moins une classe, candidate à `instanceof`.

**Ce qu'« exporte une classe » ne suffit pas à établir** : la plupart des 93
sont des classes de SERVICE (`CallService`, `MentionService`, `CacheStore`…),
jamais vérifiées par `instanceof` — le double les remplace par un `jest.fn()`
et c'est exactement l'usage voulu. Le risque #6294 est plus étroit : une
classe **exportée par le module M**, vérifiée par `instanceof` dans un fichier
**AUTRE que M**, alors qu'un test du second fichier double M en entier. Deux
productions réelles se rencontrent dans ce cas précis (throw dans un
collaborateur mocké, catch dans le fichier sous test) ; une classe
`instanceof`-vérifiée SEULEMENT à l'intérieur de son propre module ne peut pas
être exploitée de cette façon — la mocker en entier retire le throw ET le
catch ensemble.

**Vérifié un par un, ça donne CINQ modules à risque confirmé** (sur les
93 candidats) : `services/CallService.ts` (`CallAlreadyEndedError`, vérifiée
dans `AuthHandler.ts`/`CallEventsHandler.ts`/`calls-lifecycle.ts`),
`services/AgentHttpClient.ts` (`AgentUnavailableError`, dans
`routes/admin/agent-delivery-queue.ts`/`agent-configs.ts`),
`services/conversationPreferencesSync.ts`
(`ConversationPreferencesScopeError`, dans `routes/conversation-preferences.ts`),
`services/AudioTranslateService.ts` (`AudioTranslateError`, dans
`routes/voice/analysis.ts`/`translation.ts`), et
`routes/conversations/delete-for-me.ts`
(`ConversationDeleteForMeNotAParticipantError`, dans `routes/user-deletions.ts`).
`middleware/auth.ts` (108 doubles — le module le plus mocké de tous) est
l'exemple négatif qui a affiné la règle : `GuestAccessRevokedError` est lancée
ET vérifiée par `instanceof` uniquement DANS `middleware/auth.ts` lui-même ;
aucun autre fichier de production n'y touche. Un double total de ce module
retire les deux ensemble, donc le motif ne peut jamais s'y déclencher.

**Décision** : généraliser la garde de #6294 en un balayage PARAMÉTRÉ
(`__tests__/security/instanceof-checked-class-mock-completeness-{sweep,guard}.test.ts`)
plutôt que d'écrire un garde par module. Le balayage DÉRIVE lui-même la liste
des « modules sensibles » (classe exportée, `instanceof` externe) depuis le
code de production — jamais une liste à la main, pour la même raison que
`#4432`/`#4992` : une liste tenue à la main dérive. Les 48 sites de double
total des cinq modules confirmés étalent désormais
`...(jest.requireActual('<module>') as object)` — même patron que #6294.
Huit d'entre eux (tous `services/CallService.ts`, forme
`() => { class CallAlreadyEndedError extends Error {...} return {...}; }`)
RECONSTRUISAIENT déjà la classe à la main, sous le même nom, `extends Error`,
rendue dans l'objet exporté — alternative valide (Jest sert la MÊME classe
mockée au throw et au catch dans un seul registre de module) que le
balayage reconnaît et ne signale plus comme fautive.

**Ce qui reste ACCEPTÉ, par décision, pas par oubli** : les 88 autres modules
à classe restent des doubles totaux — aucune preuve de risque `instanceof`
externe ne les touche aujourd'hui. Le balayage est DÉRIVÉ du code : si un
futur commit fait vérifier l'une de leurs classes par `instanceof` depuis un
autre fichier, le module devient sensible automatiquement et la garde rougit
au prochain double qui l'omet — sans qu'il faille étendre une liste à la
main. La seconde moitié du périmètre de #6296 — un module dont une FONCTION
(pas une classe) est directement appelée en production depuis un autre
fichier — n'est pas couverte par ce balayage : elle exige de suivre les appels
de fonction, pas seulement `instanceof`, et une automatisation fiable n'a pas
été mesurée faisable dans ce lot. Suivi ouvert en issue séparée plutôt que
laissé tacite.

**Preuve** : RED prouvé avant correctif (48 offenders listés par le
balayage, `bun run test` sur la garde) ; GREEN après (`offenders()` rend
`[]`) ; `npx tsc --noEmit` gateway 0 erreur ; les 54 suites/1385 témoins
affectés (`CallEventsHandler*`, `MeeshySocketIOManager`, `calls-routes`,
`agent-*`, `AttachmentTranslateService`, `user-deletions-*`,
`conversation-index`, `message-new-producer-parity`) verts, aucune
régression.
