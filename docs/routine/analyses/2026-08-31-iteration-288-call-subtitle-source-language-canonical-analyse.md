# Itération 288 — Les sous-titres d'appel canonicalisent leur langue SOURCE avant le pivot NLLB et le regroupement

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→287,
Prisme + `recipient-language.ts` + `normalizeLanguageForDedup` +
`PostService.audienceLanguages` à l'itération 287). En cherchant la JUMELLE
(`CLAUDE.md` § « Cette entité a-t-elle une JUMELLE ? ») du normaliseur de langue
source du chat, un résolveur temps-réel dispatchait sa langue source **verbatim**
au traducteur : `CallEventsHandler.translateAndEmitSegment` (sous-titres d'appel).

## État actuel (avant ce lot)

Le chemin de traduction des **messages de chat** canonicalise sa langue source
avant l'envoi ZMQ (`MessageTranslationService._normalizeSourceLanguage`) :

```ts
private _normalizeSourceLanguage(originalLanguage: string): string {
  return normalizeLanguageCode(originalLanguage) ?? originalLanguage.toLowerCase();
}
// appliqué à : sourceLanguage: this._normalizeSourceLanguage(message.originalLanguage)
// commentaire du site : « normalised via normalizeLanguageCode (`fr-FR` → `fr`) »
```

Sa jumelle temps-réel `CallEventsHandler.translateAndEmitSegment` ne le faisait
pas. `data.segment.language` (le code source déclaré par le client de
transcription) atteignait le handler intact :

```ts
// schéma : language: z.string().min(2).max(10)  →  'en-US', 'fr-FR', casse mixte passent
const lang = resolveUserLanguage(p.participant.user ?? {}, { … }); // CANONIQUE ('en')
if (typeof lang !== 'string' || lang === data.segment.language) { /* même langue */ }
…
zmqClient.translateText(data.segment.text, data.segment.language, targetLanguage, …); // SOURCE brute
```

## Problème identifié

Le schéma `socketTranscriptionSegmentSchema` accepte `z.string().min(2).max(10)`,
donc un identifiant de locale région-tagué (`'en-US'`, `'fr-FR'`) ou en casse
mixte passe le gate. Les reconnaisseurs vocaux embarqués émettent précisément ces
formes (iOS `SFSpeechRecognizer` rend `en-US`, `fr-FR`). Les langues des auditeurs,
elles, sont CANONIQUES (`resolveUserLanguage` → 2-lettres minuscules). Deux
conséquences, toutes deux couvertes par témoin RED :

1. **Source NLLB invalide pour TOUT le segment.** `data.segment.language` est la
   langue SOURCE de *toutes* les cibles du segment. Un `'fr-FR'` envoyé comme
   source à NLLB n'est pas reconnu : les traductions échouent ou dégradent, et
   TOUS les auditeurs retombent sur l'original — violation du Prisme dès qu'un
   client déclare une locale région-tagée.

2. **Détection « même langue » cassée.** `lang === data.segment.language` compare
   `'en'` (auditeur canonique) à `'en-US'` (segment brut) : faux. L'auditeur
   anglophone face à un locuteur `'en-US'` n'est pas reconnu comme « même
   langue » → requête de traduction inutile `en-US → en` au lieu d'être servi
   l'original immédiatement.

Corollaire de fil : `buildTranslatedSegment` estampillait `sourceLanguage:
data.segment.language` (brut) sur CHAQUE segment émis — donc un segment traduit
portait un `sourceLanguage: 'fr-FR'` à côté d'un `targetLanguage: 'en'` canonique,
label incohérent pour le client.

## Cause racine

Le résolveur n'appelait pas la SSOT de canonicalisation
`normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`) avant
la comparaison et le dispatch. Le reste du répertoire (aperçu de liste,
notification, recipient-language, `audienceLanguages`, `_normalizeSourceLanguage`
du chat) passe déjà par une SSOT ; ce chemin en divergeait en silence — jumelle
non reprise.

## Impact métier

Sous-titres d'appel absents ou dans la langue de l'expéditeur pour tout appel où
un client déclare une locale de reconnaissance région-tagée (cas nominal iOS) —
et calcul ML gaspillé (une requête de traduction par auditeur même-langue non
détecté). Le poste ML est le plus cher du pipeline. Dimensions 2 (Performance),
11 (Maintenabilité — UNE source de vérité), 13 (Complétude — parité chat/appel).

## Impact technique

Surface minimale, gateway seul :
- `translateAndEmitSegment` : canonicalisation UNE fois (`segmentLanguage`),
  utilisée pour la comparaison de même-langue et la source ZMQ.
- `buildTranslatedSegment` : choke point unique qui estampille des labels
  `sourceLanguage`/`targetLanguage` canoniques sur CHAQUE émission (idempotent
  pour un code déjà canonique), couvrant aussi le relais des segments NON finaux.
- Aucun schéma, aucune requête, aucune frontière réseau touchée. La persistance
  du journal (`persistTranscriptionSegment`) reste sur le code brut — parité avec
  le chat, qui stocke `originalLanguage` verbatim et normalise à la lecture.

## Risque

Faible. Idempotent pour les codes déjà canoniques (tous les tests existants
utilisent `'fr'`/`'en'` — inchangés, 658/658 verts). Le seul changement observable
côté client est un label `sourceLanguage` désormais canonique, ce que les clients
résolvent déjà de façon canonique.

## Améliorations proposées / Bénéfices attendus

Canonicaliser la langue source du segment via la SSOT (fait). Bénéfice : sous-titres
d'appel corrects sous locale région-tagée, zéro requête de traduction gaspillée,
et labels de langue cohérents source/cible sur le fil.

## Complexité d'implémentation

Faible — trois éditions ciblées + un import, guidées par TDD (deux témoins RED).

## Critères de validation

- Témoin RED : segment `'fr-FR'` ⇒ `translateText` reçoit la source `'fr'`. ✅
- Témoin RED : segment `'en-US'` + auditeur résolu `'en'` ⇒ aucune requête de
  traduction (servi en original), `sourceLanguage` servi = `'en'`. ✅
- `npx tsc --noEmit` gateway : EXIT=0. ✅
- 658/658 suites d'appel vertes. ✅

Ferme #4598.
