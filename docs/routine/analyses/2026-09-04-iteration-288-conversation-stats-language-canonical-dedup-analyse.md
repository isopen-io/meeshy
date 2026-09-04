# Itération 288 — `ConversationStatsService` canonicalise ses codes de langue avant de compter (les DEUX cartes, et le jumeau incrémental)

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→287,
Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`). L'itération 287 a
corrigé `PostService.audienceLanguages` (dédup des cibles NLLB d'une story) ; ce
lot corrige son FRÈRE encore vivant : les deux agrégats par langue des
statistiques de conversation, qui comptent sur des codes **verbatim** jamais
canonicalisés.

## État actuel (avant ce lot)

`ConversationStatsService` (`services/gateway/src/services/ConversationStatsService.ts`)
n'importait aucune SSOT de langue. Trois sites d'écriture, tous sur des colonnes
persistées telles quelles :

```ts
// computeStats — messagesPerLanguage (groupBy sur originalLanguage brut)
for (const row of messagesAgg) {
  messagesPerLanguage[row.originalLanguage] = row._count._all;
}

// computeStats — participantsPerLanguage (branche globale + branche participants)
participantsPerLanguage[u.systemLanguage] = (participantsPerLanguage[u.systemLanguage] || 0) + 1;
// ...
const lang = m.user.systemLanguage;
participantsPerLanguage[lang] = (participantsPerLanguage[lang] || 0) + 1;

// updateOnNewMessage — jumeau incrémental, langue reçue de l'appelant
stats.messagesPerLanguage[messageLanguage] = (stats.messagesPerLanguage[messageLanguage] || 0) + 1;
```

Ces deux cartes sont **servies** aux clients : l'événement socket
`conversation:stats` (`ConversationStatsEventData.messagesPerLanguage` /
`.participantsPerLanguage`, `packages/shared/types/socketio-events/conversation.ts`)
est consommé par le web (`apps/web/hooks/use-stream-socket.ts:271-282`, qui projette
chaque carte en lignes de répartition par langue, et `use-conversation-stats.ts`).

## Problème identifié

`Message.originalLanguage` et `User.systemLanguage` sont **persistés verbatim**
(`z.string().optional()`, aucune normalisation à l'écriture — même provenance que
`PostService.audienceLanguages` documente). Les valeurs BCP-47 région-taguées ou
en casse mixte produites par le web (`Accept-Language`) et iOS
(`Locale.current.identifier`) — `'en-US'`, `'pt-BR'`, `'FR'`, `'fr_FR'` — atteignent
donc ces agrégats intactes. Trois conséquences, toutes mesurées par témoin RED :

1. **Les variantes régionales comptent comme des langues DISTINCTES.** `'fr'`,
   `'fr-FR'` et `'FR'` produisent **trois** entrées de carte au lieu d'une ; le web
   affiche trois lignes de répartition pour la même langue, chacune avec un compte
   partiel. Un `groupBy` sur `originalLanguage` rend une ligne par variante.

2. **Le jumeau incrémental DIVERGE du recompute complet.** `updateOnNewMessage`
   reçoit la langue brute de ses TROIS appelants (`messagePostSaveEffects.ts`,
   `MeeshySocketIOManager.ts`, `MessageHandler.ts` — tous passent `originalLanguage`
   ou `originalLanguage || 'fr'`). Un message étiqueté `'fr-FR'` ouvrait un seau
   `'fr-fr'` À CÔTÉ du seau `'fr'` que le recompute complet aurait fondu : la carte
   affichée dépendait du dernier chemin exécuté (incrément vs recompute au TTL).

3. **Une langue absente devenait un seau `"null"`.** La branche globale
   (`user.findMany`) n'avait aucune garde de nullité — `participantsPerLanguage[null]`
   coerce en clé `"null"` ; la branche participants gardait `if (m.user)` mais lisait
   quand même `m.user.systemLanguage` nullable. Un utilisateur sans langue comptait
   comme une « langue » fantôme.

## Cause racine

Aucun des trois sites n'appelait la SSOT `normalizeLanguageForDedup`
(`packages/shared/utils/language-normalize.ts`), dont le doc-comment nomme
exactement ce cas : « SSOT unique … partout où des codes verbatim … sont agrégés
en une liste ou dédupliqués — un `.toLowerCase()` brut compterait `'en'` et
`'en-US'` comme deux langues distinctes ». Le reste du répertoire (aperçu de liste,
bannière, `recipient-language`, `anonymous.ts` `spokenLanguages`, `audienceLanguages`)
passe déjà par cette SSOT ; ce service en divergeait en silence.

## Impact métier

Répartition par langue FAUSSE dans les statistiques de conversation servies au
web : une conversation où l'audience francophone se répartit sur `'fr'`, `'fr-FR'`
et `'FR'` affiche trois langues au lieu d'une, chacune sous-comptée, et un compte de
participants gonflé d'un seau `"null"` pour les comptes sans préférence. Dimensions
6 (Cohérence), 11 (Maintenabilité — jumelles divergentes) et 13 (Complétude) du
`CLAUDE.md`.

## Impact technique

Surface minimale : un import de SSOT + quatre sites de comptage passés en
`normalizeLanguageForDedup` avec **accumulation** (deux lignes de `groupBy` peuvent
désormais tomber sur la même clé canonique) et **saut des valeurs vides/nulles**.
Aucun schéma, aucune requête, aucune frontière réseau touchée. La ligne 320
(`systemLanguage: u.systemLanguage || 'fr'` de l'instantané `onlineUsers`) est un
passe-plat d'AFFICHAGE d'une valeur UNIQUE, pas un agrégat/dedup — laissée hors
périmètre (voir « Améliorations futures »).

## Évaluation du risque

Très faible. `normalizeLanguageForDedup` est déjà consommée par une dizaine de sites
du gateway et rend un code canonique déterministe et idempotent sur un code déjà
canonique. La transformation ne peut que CONVERGER (des variantes s'effondrent sur
leur langue) — jamais introduire une langue que l'ancien code n'aurait pas produite.
Les 60 témoins existants du service (qui n'utilisent que des codes canoniques
`'fr'`/`'en'`/`'es'`/`'de'`) restent verts, prouvant l'idempotence.

## Améliorations proposées (implémentées)

- `computeStats` : `messagesPerLanguage` et `participantsPerLanguage` (branches
  globale ET participants) canonicalisent chaque code via `normalizeLanguageForDedup`
  avant comptage, ACCUMULENT sur la clé canonique, et sautent les valeurs
  vides/nulles.
- `updateOnNewMessage` : canonicalise `messageLanguage` avec la MÊME SSOT avant
  d'incrémenter — le jumeau incrémental ne peut plus diverger du recompute.
- Cinq témoins ajoutés (`ConversationStatsService.languageCanonical.test.ts`) :
  fold des variantes de `originalLanguage`, saut des langues vides/nulles, fold des
  variantes de `systemLanguage` (branches participants ET globale), et parité du
  jumeau incrémental (`'fr-FR'` bump le seau `'fr'`).

## Critères de validation

- RED prouvé : les 5 nouveaux témoins échouent contre l'implémentation verbatim
  (ex. `{ fr: 5, 'fr-FR': 1 }` au lieu de `{ fr: 6 }`).
- GREEN : 65/65 témoins des trois suites `ConversationStatsService*`.
- Non-régression : 241/241 sur `messagePostSaveEffects|ConversationHandler|MessageHandler.core`
  (consommateurs du service).
- `tsc --noEmit` du gateway : EXIT=0.

## Améliorations futures (suivi — non traitées ici)

Autres divergences de langue relevées par le balayage de ce cycle, non corrigées
pour garder la surface minimale (candidates d'itérations suivantes) :

- **`ZmqRequestSender.sendTranslationRequest:85`** — dédup des langues cibles ZMQ
  par `.toLowerCase()` brut, alors que le helper `canonicalLanguage` du même fichier
  et le jeu `pendingLanguages` (ligne 121) utilisent la SSOT. **Piège armé** (non
  live aujourd'hui : les appelants de production canonicalisent en amont via
  `_resolveTargetLanguages` ; le seul chemin verbatim, `translateTextDirectly`, n'a
  aucun appelant de production). À aligner sur `canonicalLanguage` (frontière
  d'envoi = bonne place pour la SSOT).
- **Filtre de bande passante REST** (`messages-list.ts:213`,
  `translation-transformer.ts:48-53`, `messages-list-query.ts:57/123`) — jumeau REST
  du chemin socket déjà corrigé (`message-payload-filter.ts` `normalizeGroupLanguage`),
  resté au `.toLowerCase()` brut sous un commentaire qui affirme « Normalisé ».
  Paramètre client, sévérité moindre.
- **`admin/languages.ts:198-213` et `admin/broadcasts.ts:316-330`** — `groupBy`
  admin par `systemLanguage` : les variantes régionales apparaissent en lignes
  distinctes dans les analytics admin.
