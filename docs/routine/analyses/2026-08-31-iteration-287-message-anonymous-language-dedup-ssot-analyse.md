# Itération 287 — la branche ANONYME de `_extractConversationLanguages` rejoint la SSOT de déduplication de langues

Suite directe de l'itération 286 (`PostService.audienceLanguages` canonicalise ses
codes avant le `new Set`). Même campagne « une source de vérité par règle de
langue » (cycles 118→286), portée cette fois sur le résolveur de langues cibles du
**pipeline de messages** — `MessageTranslationService._extractConversationLanguages`
— dont la volumétrie (100k msg/s) dépasse celle des stories.

## État actuel (avant ce lot)

`_extractConversationLanguages` agrège les langues cibles NLLB d'une conversation
en additionnant DEUX branches dans un même `Set<string>` :

- **Branche INSCRIT** (participant `type: 'user'`) — passe par la SSOT ordonnée
  `resolveUserLanguagesOrdered`, dont chaque code traverse `normalizeInAppLanguage`.
  Cette fonction **strippe la région d'un code inconnu de `normalizeLanguageCode`** :
  `'yue-HK'` → `'yue'` (sous-tag primaire, re-validé `/^[a-z]{2,}$/`).
- **Branche ANONYME/BOT** (participant `type: 'anonymous' | 'bot'`) — normalisait
  EN LIGNE :

  ```ts
  languages.add(
    normalizeLanguageCode(participant.language) ?? participant.language.toLowerCase()
  );
  ```

  Pour un code inconnu région-taggé, `normalizeLanguageCode('yue-HK')` rend
  `undefined`, et le repli `.toLowerCase()` porte sur la chaîne ENTIÈRE :
  `'yue-HK'` → `'yue-hk'`.

## Problème identifié

Les deux branches alimentent le **même** `Set`. Pour une même langue réelle
inconnue-mais-région-taggée, elles produisent DEUX clés distinctes :

| entrée | branche inscrit | branche anonyme (avant) |
|---|---|---|
| `'yue-HK'` | `'yue'` | `'yue-hk'` |

Conséquences, toutes mesurées (RED : `[yue, yue-hk]`) :

1. **Déduplication ratée entre branches.** Un lecteur inscrit sur `'yue'` et un
   participant anonyme sur `'yue-HK'` comptent pour **deux** cibles au lieu d'une —
   le translator reçoit deux travaux ZMQ pour la même langue.
2. **Cible NLLB invalide émise.** `'yue-hk'` n'est pas un code que
   `LANGUAGE_MAPPINGS` reconnaît : le travail retombe silencieusement, ou pire, la
   traduction n'est jamais stockée sous une clé que le client relira — violation
   indirecte du Prisme (règle #1 : le lecteur retombe sur l'original).
3. **`_resolveTargetLanguages` ne rattrape rien en aval.** Il re-normalise avec le
   même idiome inline (`normalizeLanguageCode(raw) ?? raw.toLowerCase()`), donc
   `'yue-hk'` y survit ET échappe au filtre d'auto-traduction (source `'yue'` ≠
   `'yue-hk'`). Le défaut se corrige donc à la SOURCE, jamais en aval.

## Cause racine

La branche anonyme n'appelait pas la SSOT de canonicalisation-avec-dedup
`normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts:175`),
dont le doc-comment nomme EXACTEMENT ce cas : « employé partout où des codes
verbatim (… `participant.language` de lignes héritées) sont agrégés en une liste
ou dédupliqués — un `.toLowerCase()` brut compterait `'en'` et `'en-US'` comme
deux langues distinctes ». La branche inscrit y était déjà conforme (via
`normalizeInAppLanguage`, qui strippe la région) ; la branche anonyme en
divergeait en silence, avec un repli `.toLowerCase()` sur la chaîne ENTIÈRE.

Le commentaire au-dessus du site (« Adding it verbatim would inject an
uppercase/locale-cased target … a duplicated NLLB request ») ANNONÇAIT déjà la
règle — mais le code n'était qu'un DEMI-correctif : il traitait la casse et les
région-tags CONNUS (`'EN'` → `'en'`, `'ES-ES'` → `'es'`), pas les codes inconnus
région-taggés, exactement la fuite que la SSOT existe pour fermer.

## Impact

- **Technique** : requête ZMQ dupliquée + cible NLLB invalide pour toute
  conversation mêlant un inscrit et un participant anonyme/bot sur une langue
  inconnue région-taggée. CPU/GPU translator gaspillés.
- **Produit (Prisme, Complétude + Performance)** : la langue réelle peut ne PAS
  être servie (clé de stockage `'yue-hk'` vs clé de lecture `'yue'`), rétrogradant
  le lecteur sur l'original.
- **Sécurité** : nulle.

## Risque

Faible. Fonction PURE lue seule (aucun état, une seule requête Prisma). La
canonicalisation ne fait que RESSERRER l'ensemble sortant (jamais l'élargir) et
aligne la branche anonyme sur la branche inscrit qui utilise déjà la même règle.
Idempotence vérifiée sur les codes canoniques (`'ar'`, `'en'`, `'es'` inchangés ;
`'EN'` → `'en'`, `'ES-ES'` → `'es'` inchangés — 6 pins existants verts).

## Amélioration livrée

```ts
if (participant.language) {
  languages.add(normalizeLanguageForDedup(participant.language));
}
```

Import élargi : `normalizeLanguageForDedup` depuis
`@meeshy/shared/utils/language-normalize`.

## Bénéfices attendus

- Les deux branches produisent la MÊME clé canonique pour la même langue réelle —
  la déduplication du `Set` opère à travers les branches.
- Plus aucune cible région-taggée inconnue (`'yue-hk'`) émise vers le translator.
- UNE source de vérité de canonicalisation de plus rejoint la SSOT partagée, sur
  le chemin de plus forte volumétrie.

## Complexité d'implémentation

Triviale — 1 ligne de production, un import élargi, 1 nouveau pin de comportement.

## Critères de validation

- `message-translation-destinations.test.ts` : nouveau cas RED sur l'ancien code
  (`[yue, yue-hk]`), vert après le fix (`[yue]`) ; 6 pins existants inchangés.
- Suites `MessageTranslationService*` (139 tests) + destinations (7) vertes.
- `tsc --noEmit` gateway : 0 erreur.
- `normalizeLanguageForDedup` présent dans le dist shared (`.js` + `.d.ts`).

## Suivi (hors périmètre de ce lot)

`_resolveTargetLanguages` (l. 471) et `_normalizeSourceLanguage` (l. 502) portent
encore l'idiome inline `normalizeLanguageCode(x) ?? x.toLowerCase()`. Ils ne
souffrent PAS du défaut de dedup cross-branche (ils opèrent sur des valeurs
uniques déjà canonicalisées à la source par ce lot), et pour un code inconnu
région-taggé le translator retombe de toute façon sur `eng_Latn`. Alignement de
CONSISTANCE possible, valeur moindre — à ouvrir en issue si le balayage de la
campagne le retient.
