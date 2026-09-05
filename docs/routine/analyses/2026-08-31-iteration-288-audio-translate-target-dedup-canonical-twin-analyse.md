# Itération 288 — les deux services de traduction audio dédupliquent leurs cibles NLLB sur des codes canonicalisés

Suite directe de la campagne « une source de vérité par règle de langue »
(cycles 118→287, Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`).
L'itération 287 a canonicalisé `PostService.audienceLanguages` ; ce lot ferme les
**deux derniers diffeurs de cibles de traduction verbatim** du gateway,
identifiés en balayant les sites qui construisent une liste de langues cibles
NLLB sans passer par la SSOT `normalizeLanguageForDedup`.

## État actuel (avant ce lot)

`AttachmentTranslateService.processAudioAttachment` et
`AudioTranslateService.translateAndSave` sont des **jumeaux** : chacun diffe la
liste de cibles DEMANDÉE par le client contre les clés de traduction DÉJÀ
STOCKÉES pour n'envoyer au translator que le manquant, et pour filtrer le cache.
Les deux le faisaient VERBATIM :

```ts
const existingLanguages = new Set(existingTranslations.map(t => t.targetLanguage));
const languagesToTranslate = options.targetLanguages.filter(lang => !existingLanguages.has(lang));
// …plus, en retour de cache :
existingTranslations.filter(t => options.targetLanguages.includes(t.targetLanguage))
```

`options.targetLanguages` arrive verbatim du corps client (schéma
`array<string>` sans transform), et les clés de `existingTranslations` sont les
clés brutes de la carte `MessageAttachment.translations`.

## Problèmes identifiés (tous mesurés par témoin RED)

1. **Une cible région-taguée ne matche jamais la clé canonique du store.** Un
   client émettant `'en-US'` (`Accept-Language`) ou `'FR'` (casse mixte) ne
   trouve jamais la traduction `'en'` / `'fr'` déjà stockée : requête NLLB
   redondante (le poste le plus cher du pipeline) ET filtre de cache qui ne rend
   jamais la ligne existante à l'appelant.
2. **Deux variantes d'une même langue comptent pour deux cibles.** `'fr'` et
   `'fr-FR'` dans une même demande produisent deux travaux de traduction pour un
   seul résultat.
3. **Repli de forme faible sur les codes irréductibles.** La branche anonyme de
   `MessageTranslationService` inlinait déjà un demi-`normalizeLanguageForDedup`
   (`normalizeLanguageCode(x) ?? x.toLowerCase()`), mais SANS le strip région du
   repli — `'yue-HK'` restait `'yue-hk'`. La SSOT strippe la région pour TOUT
   code (`'yue-HK'` → `'yue'`).

Preuve RED (logique verbatim d'avant) :

| entrée | ancien `missing` | attendu |
|---|---|---|
| `['en-US']` vs `['en']` | `['en-US']` | `[]` |
| `['FR']` vs `['fr']` | `['FR']` | `[]` |
| `['fr','fr-FR','FR']` vs `[]` | `['fr','fr-FR','FR']` | `['fr']` |
| `['yue-HK']` vs `['yue']` | `['yue-HK']` | `[]` |

## Cause racine

Les deux sites ne passaient pas par la SSOT `normalizeLanguageForDedup`
(`packages/shared/utils/language-normalize.ts`), dont le doc-comment nomme
exactement ce cas : « un `.toLowerCase()` brut compterait `'en'` et `'en-US'`
comme deux langues distinctes ». Le reste du répertoire de résolveurs
(aperçu de liste, bannière, `anonymous.ts` `spokenLanguages`, `audienceLanguages`
au cycle 287) passe déjà par cette SSOT ; ces deux jumeaux en divergeaient en
silence.

## Impact métier

Gaspillage de calcul ML (traductions audio dupliquées et cibles région-taguées
invalides envoyées au translator) et, côté cache, une traduction déjà présente
non rendue au client qui la redemande sous une variante régionale — l'utilisateur
attend une re-traduction pour un contenu déjà traduit. Dimensions 2 (Performance)
et 13 (Complétude) du `CLAUDE.md`.

## Impact technique

Surface minimale : un helper pur nouveau (`utils/translation-targets.ts`,
raccord sur la SSOT, patron `recipient-language.ts`) et quatre sites de
substitution (`languagesToTranslate` + trois filtres de cache) répartis sur les
deux services. Aucun schéma, aucune requête, aucune frontière réseau touchée. Les
codes envoyés au translator deviennent canoniques — ce que `ZmqRequestSender`
faisait déjà côté fil, désormais fait aussi au dédup.

## Évaluation du risque

Très faible. `normalizeLanguageForDedup` est déterministe et déjà consommée par
une dizaine de sites. La détection ne peut que CONVERGER (des variantes
s'effondrent sur leur langue) — jamais introduire une cible qu'un code canonique
n'aurait pas produite. Les deux jumeaux sont convergés dans le MÊME lot via un
helper unique, fermant le risque « une jumelle corrigée, l'autre oubliée » que le
`CLAUDE.md` documente (« Cette entité a-t-elle une JUMELLE ? »).

## Améliorations proposées (implémentées)

- `diffTranslationTargets(requested, existing)` — helper pur composant la SSOT,
  rendant `{ missing, wasRequested }` (cibles canoniques manquantes + prédicat de
  filtre de cache canonique).
- Les DEUX services l'appellent : `languagesToTranslate = diff.missing`, et les
  trois filtres de cache (`AttachmentTranslateService` cache-hit + merge sync,
  `AudioTranslateService` merge) passent par `diff.wasRequested`.
- 9 témoins pour le helper (`utils/__tests__/translation-targets.test.ts`).

## Critères de validation

- RED prouvé : la logique verbatim rend les cibles région-taguées/dupliquées
  ci-dessus (mesuré par `node -e`).
- GREEN : 136/136 sur les trois suites
  (`translation-targets` + `AttachmentTranslateService` + `AudioTranslateService`).
- `tsc --noEmit` du gateway : EXIT=0.
- Aucune comparaison verbatim résiduelle (grep `existingLanguages` /
  `options.targetLanguages.(includes|filter)` : vide sur les deux fichiers).

## Suivi (hors périmètre)

- La branche anonyme de `MessageTranslationService._extractConversationLanguages`
  (ligne 907) inline `normalizeLanguageCode(x) ?? x.toLowerCase()` — un demi-
  `normalizeLanguageForDedup` sans strip région du repli. Divergence étroite
  (seulement les codes région-tagués irréductibles d'un participant anonyme) ;
  à aligner sur la SSOT au prochain passage sur ce fichier.
