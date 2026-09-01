# Itération 287 — le dispatch gateway→translator canonicalise ses langues cibles (dernier point avant le fil)

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→286,
Prisme + `recipient-language.ts` + `PostService.audienceLanguages`). L'itération 286
a canonicalisé le dernier résolveur d'audience PUR ; ce lot ferme le dernier
CHEMIN de dispatch — `ZmqRequestSender`, le point unique par lequel toute requête
de traduction/audio quitte le gateway pour le translator.

## État actuel (avant ce lot)

`ZmqRequestSender` porte TROIS méthodes qui posent des langues cibles sur le fil ZMQ :

```ts
// sendTranslationRequest (texte)
const uniqueTargetLanguages = [...new Set(request.targetLanguages.map(l => l.toLowerCase()))];
// … targetLanguages: uniqueTargetLanguages  → fil
// … pendingLanguages: new Set(uniqueTargetLanguages.map(canonicalLanguage))  → suivi

// sendAudioProcessRequest (audio)
targetLanguages: request.targetLanguages,   // ← VERBATIM, aucun dedup, aucune canonicalisation

// sendStoryTextObjectRequest (story textObject)
targetLanguages: params.targetLanguages,    // ← VERBATIM
```

Le helper `canonicalLanguage` (SSOT `normalizeLanguageCode`) existe déjà dans le
fichier, mais n'était appliqué qu'au SUIVI (`pendingLanguages`), jamais au FIL.
Son doc-comment rationalisait même le dispatch verbatim : « Les cibles partent
telles que l'appelant les donne (`'EN'`, `'pt-BR'`) et le translator rend la
sienne ».

## Problème identifié

Côté translator, la cible est résolue par un `dict.get` BRUT keyé sur les codes
canoniques :

```python
# services/translator/src/services/translation_ml/translator_engine.py:402
nllb_target = self.lang_codes.get(target_lang, 'fra_Latn')
```

`LANGUAGE_MAPPINGS` est keyé par `'en'`, `'fr'`, `'pt'`… — jamais par une variante
région-taggée. Un code `'pt-BR'`, `'en-US'`, `'FR'` ou `'fr-FR'` absent de la table
retombe donc **SILENCIEUSEMENT sur `'fra_Latn'`** : NLLB traduit vers le FRANÇAIS
quelle que soit la langue demandée — exactement la classe de collision que le
commentaire du fichier (l. 194-197) décrit déjà pour la source. Trois conséquences,
toutes mesurées :

1. **Une cible région-taggée produit du FRANÇAIS.** Un destinataire dont le
   `systemLanguage` ou `participant.language` est persisté `'pt-BR'` (iOS
   `Locale.current`) ou `'en-US'` (web `Accept-Language`) recevait une traduction
   française étiquetée portugaise/anglaise — violation directe du Prisme.

2. **Le fil et le suivi DIVERGENT.** `uniqueTargetLanguages` (lowercase brut) part
   sur le fil, pendant que `pendingLanguages` est bâti canonique. `['fr','fr-FR']`
   ⇒ le fil porte `['fr','fr-fr']` (deux jobs NLLB), le suivi porte `{'fr'}` (une
   entrée) : le worker pool ML fait un travail dupliqué que le suivi ignore.

3. **Deux variantes dédupliquent comme des langues DISTINCTES.** `new Set` sur des
   chaînes brutes tient `'fr'`, `'fr-FR'` et `'FR'` pour trois cibles.

Le chemin LIVE : `POST /attachments/:id/translate` accepte
`body.targetLanguages: { type: 'array', items: { type: 'string' } }` — aucune
normalisation, aucun enum — et le passe verbatim par `AttachmentTranslateService` →
`sendAudioProcessRequest`. Un client postant `['pt-BR','EN']` atteint le translator
intact.

## Cause racine

La canonicalisation était appliquée au SUIVI et non au FIL, sur la foi d'un
doc-comment qui supposait le translator capable de rendre « sa » forme canonique.
Le translator ne canonicalise pas — il fait un `dict.get` avec repli `'fra_Latn'`.
Les chemins amont canonicalisent chacun de leur côté (`_resolveTargetLanguages`
texte, `_extractConversationLanguages` audio-conversation, `audienceLanguages`
story post-286), mais `sendAudioProcessRequest` (route REST) et
`sendStoryTextObjectRequest` restaient exposés, et aucun point unique ne garantit
l'invariant pour TOUS les appelants présents et futurs.

## Correctif

Consolider la canonicalisation au dernier point avant le fil. Un helper unique
`canonicalizeTargetLanguages(codes) = [...new Set(codes.map(canonicalLanguage))]`,
appliqué aux TROIS dispatchs. `pendingLanguages` devient `new Set(uniqueTargetLanguages)`
(déjà canonique, double-canonicalisation retirée). Le translator ne reçoit plus
jamais qu'un code canonique, quel que soit l'appelant.

## Bénéfices attendus

- **Sécurité/Prisme** : plus aucune cible région-taggée ne retombe sur `'fra_Latn'`.
- **Performance** : plus de job NLLB dupliqué pour deux variantes d'une même langue.
- **Maintenabilité** : ZmqRequestSender devient le site UNIQUE de canonicalisation
  cible côté gateway ; les appelants n'ont plus à s'en soucier.

## Complexité / risque

Faible. Le cas commun (codes 2-lettres lowercase) est inchangé — `canonicalLanguage('fr') = 'fr'`.
Le témoin existant `['FR','fr','EN'] → ['fr','en']` reste vert. Seuls les codes
région-taggés changent de comportement, et c'est le correctif.

## Critères de validation

- RED : `['pt-BR','en-US','fr-FR']` doit partir `['pt','en','fr']` sur le fil (texte,
  audio, story) — rouge avant, vert après.
- Le suivi `pendingLanguages` reste canonique et se solde correctement.
- `cd services/gateway && bun run test` (suite ZmqRequestSender) verte.
