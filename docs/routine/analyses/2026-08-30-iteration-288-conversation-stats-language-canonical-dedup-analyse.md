# Itération 288 — `ConversationStatsService` canonicalise ses codes de langue avant de compter par bucket

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→287,
Prisme + `recipient-language.ts` + `normalizeLanguageForDedup` + `PostService.audienceLanguages`).
En balayant les résolveurs/agrégateurs de langue serveur NON couverts par la SSOT
de canonicalisation, un agrégateur de STATISTIQUES comptait ses buckets par langue
sur des codes **verbatim**, jamais canonicalisés : `ConversationStatsService`.

## État actuel (avant ce lot)

`services/gateway/src/services/ConversationStatsService.ts` compose deux cartes
`Record<langue, nombre>` — `messagesPerLanguage` et `participantsPerLanguage` —
servies dans `ConversationStats`, consommées par les clients (web `LanguageStats[]`)
pour afficher la répartition linguistique d'une conversation. Quatre sites bâtissaient
la clé sur un code BRUT :

```ts
// 1. groupBy des messages (assignation, jamais somme)
for (const row of messagesAgg) {
  messagesPerLanguage[row.originalLanguage] = row._count._all;
}
// 2. incrément à chaud (updateOnNewMessage)
stats.messagesPerLanguage[messageLanguage] = (…|| 0) + 1;
// 3. participants — conversation globale
participantsPerLanguage[u.systemLanguage] = (…|| 0) + 1;
// 4. participants — membres d'une conversation normale
participantsPerLanguage[m.user.systemLanguage] = (…|| 0) + 1;
```

## Problème identifié

`Message.originalLanguage` (`@default("fr")`) et `User.systemLanguage`
(`@default("en")`) sont **persistés verbatim** — aucune normalisation à l'écriture.
Les valeurs BCP-47 région-taguées ou en casse mixte produites par le web
(`Accept-Language`) et iOS (`Locale.current.identifier`) — `'en-US'`, `'pt-BR'`,
`'FR'`, `'fr_FR'` — atteignent donc ces compteurs intactes. Trois conséquences,
toutes mesurées par témoin RED :

1. **Une même langue se scinde en plusieurs buckets.** `'en'`, `'EN'` et `'en-US'`
   comptent pour TROIS langues distinctes ; `'fr'` et `'fr-FR'` pour deux. Le
   `languageCount` dérivé et la répartition affichée sont GONFLÉS.

2. **Le compte d'une langue est éclaté au lieu d'être sommé.** Une conversation où
   trois membres déclarent `'en'`, `'en-US'` et `'EN'` affiche « en: 1, en-US: 1,
   EN: 1 » au lieu de « en: 3 ».

3. **La carte `messagesPerLanguage` du groupBy ÉCRASAIT** (assignation `=`) : après
   canonicalisation, deux codes bruts distincts qui se replient sur la même clé
   doivent SOMMER leurs comptes, pas s'écraser — corrigé en `+= row._count._all`.

## Cause racine

L'agrégateur n'appelait pas la SSOT de canonicalisation-avec-dedup
(`normalizeLanguageForDedup`, `packages/shared/utils/language-normalize.ts`). C'est
le défaut exact déjà fermé sur l'agrégat `spokenLanguages` (`routes/anonymous.ts`,
dont le commentaire de correctif dit mot pour mot : un `.toLowerCase()` brut laisse
`'en-us' ≠ 'en'`, « stat gonflée ») — resté vivant sur cette jumelle-ci, un agrégat
de statistiques et non un résolveur de contenu, donc hors des énumérations
précédentes qui balayaient les résolveurs de Prisme.

## Impact

- **Technique** : `languageCount` et répartition linguistique faussés dès qu'un
  participant/message porte un code région-tagué (cas nominal : la locale appareil,
  rang 4 du Prisme, produit `'en-US'`/`'pt-BR'`).
- **Business** : l'indicateur de diversité linguistique d'une conversation (affiché
  côté web) sur-compte les langues et sous-compte chaque langue réelle.
- **Risque** : NUL sur la FORME de la sortie — `ConversationStats` est inchangé,
  seules les CLÉS des deux cartes deviennent canoniques. Les consommateurs
  (`ConversationHandler`, `MessageHandler`, `MeeshySocketIOManager`,
  `messagePostSaveEffects`, routes advanced-edit/delete) passent la carte telle
  quelle aux clients ; aucun ne clé sur une valeur brute.

## Correctif

SSOT unique importée ; un helper `canonicalStatLanguage` guarde le code vide/blanc
(préserve le bucket vide historique) et délègue à `normalizeLanguageForDedup` pour
tout code réel. Les quatre sites l'appellent ; le groupBy SOMME désormais.

## Critère de validation

`src/__tests__/unit/services/ConversationStatsService.test.ts` — quatre témoins,
tous prouvés ROUGES sous une canonicalisation neutralisée (`code => code`) :
- messages : `{en:3, en-US:4, EN:2, fr-FR:5}` → `{en:9, fr:5}` (somme + région)
- participants (membres) : `{en-US, EN, pt-BR}` → `{en:2, pt:1}`
- incrément à chaud : message `'en-US'` atterrit sur le bucket `'en'` existant → `{en:2}`
- participants (conversation globale, branche `user.findMany`) : `{fr, fr-FR, FR}` → `{fr:3}`

Gate : 64/64 (les deux suites `ConversationStatsService`) verts après correctif.

## Dimensions (treize)

- **Maintenabilité** (mûre) : UNE source de vérité de plus ralliée à la SSOT ; la
  jumelle divergente est supprimée.
- **Complétude** (mûre) : les quatre sites de comptage sont couverts, y compris le
  chemin à chaud et la conversation globale.
- **Cohérence** (mûre) : le comportement s'aligne sur `spokenLanguages` et
  `audienceLanguages`.

## Suivi (hors périmètre)

- `apps/web/hooks/useMessageTranslation.ts:163` — `languagesUsed` accumulé par
  `new Set` de codes source/cible bruts (stat locale d'affichage, persistée en
  local storage). Impact faible (client, non-Prisme) ; à trancher au prochain
  passage : aligner sur `normalizeLanguageForDedup` ou documenter l'écart.
- `AudioTranslateService`/`MessageTranslationService` (pipeline AUDIO) comparent
  `options.targetLanguages` verbatim aux clés stockées (dédup contournable par un
  client envoyant `'en-US'`). Classe distincte (cibles de traduction, pas
  agrégat) — issue séparée à ouvrir.
