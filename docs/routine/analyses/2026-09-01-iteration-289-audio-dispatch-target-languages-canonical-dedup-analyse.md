# Itération 289 — le dispatch audio canonicalise + déduplique ses langues cibles EXPLICITES

Suite directe du **suivi laissé ouvert par le cycle 288** (analyse
`2026-08-31-iteration-288-zmq-target-languages-canonical-dedup`, PR #4590, §
« Améliorations futures ») :

> Balayer les autres émetteurs ZMQ (`sendStoryTextObjectRequest`,
> `sendAudioProcessRequest`) pour vérifier qu'aucun ne dispatche des cibles non
> canonicalisées.

Instruit : `sendAudioProcessRequest` DISPATCHE des cibles non canonicalisées,
mais la racine n'est pas dans `ZmqRequestSender` (touché par #4590) — elle est un
cran plus haut, dans le SEUL producteur de ces requêtes,
`MessageTranslationService.processAudioAttachment`.

## État actuel (avant ce lot)

```ts
// MessageTranslationService.processAudioAttachment
let targetLanguages = params.targetLanguages && params.targetLanguages.length > 0
  ? params.targetLanguages                                       // ← VERBATIM
  : await this._extractConversationLanguages(params.conversationId);  // ← déjà canonique
```

Le chemin AUDIO a **deux branches** de résolution des langues cibles, et elles ne
sont pas gardées de la même façon :

- **branche EXPLICITE** (`params.targetLanguages` fourni — retraduction manuelle
  via `POST /voice/translate`, ou cibles poussées par le pipeline audio) : prise
  **VERBATIM**.
- **branche DÉRIVÉE** (`_extractConversationLanguages`) : déjà canonicalisée et
  dédupliquée (SSOT `normalizeLanguageCode`, câblée aux cycles 118→288).

Le chemin TEXTE, lui, passe TOUJOURS par `_resolveTargetLanguages` (canonicalise
chaque code + retire la source), puis `sendTranslationRequest` déduplique
(`new Set(...map(canonicalLanguage))`, corrigé par #4590). Le chemin AUDIO ne fait
NI l'un NI l'autre pour sa branche explicite : `sendAudioProcessRequest`
(`ZmqRequestSender.ts:207`) passe `targetLanguages: request.targetLanguages` sans
canonicalisation ni `new Set`.

## Problème identifié

`params.targetLanguages` porte des codes NON canonicalisés — le client transmet
`Locale.current` (`'fr-FR'`, `'EN'`, `'pt-BR'`, `'de_DE'`) et rien n'est normalisé
à l'écriture (règle documentée par `normalizeInAppLanguage`). Trois conséquences,
toutes mesurées par témoin RED :

1. **Travail dupliqué au translator — le poste le plus cher, et pire qu'en
   texte.** `['fr', 'fr-FR']` sont UNE cible NLLB. Sans dédup, elles partent comme
   DEUX travaux — et sur le chemin audio, un « travail » n'est pas qu'une
   traduction NLLB : c'est aussi une synthèse TTS avec clonage vocal
   (Chatterbox). La variante région-taguée double le poste le plus lourd du
   pipeline entier.

2. **Cible invalide.** `'en-US'` part en `'en-us'` (ou `'EN'` en `'EN'`), un code
   que la table `LANGUAGE_MAPPINGS` du translator ne reconnaît pas — il retombe
   silencieusement sur `'eng_Latn'` : travail perdu ou traduction dégradée.

3. **Divergence texte/audio silencieuse.** Le même message avec deux médiums
   (texte + vocal) dispatchait ses cibles sous DEUX formes : canonique pour le
   texte, verbatim pour l'audio. Un défaut de cette classe n'a aucun témoin
   naturel — personne ne compare les deux jeux dispatchés.

## Cause racine

`processAudioAttachment` a été écrit avant la campagne de canonicalisation et n'a
jamais reçu l'équivalent audio de `_resolveTargetLanguages`. La branche dérivée
étant déjà canonique (via `_extractConversationLanguages`), la branche explicite
passait pour « suffisamment gardée » — alors qu'elle est le SEUL chemin par lequel
un code brut du client atteint le dispatch audio. C'est la forme exacte du cycle
288, un producteur plus haut : `#4590` a resserré le dispatch, ce lot resserre la
COMPOSITION de la liste dispatchée.

## Impact métier

Gaspillage de calcul ML **et TTS** au translator (le poste le plus cher du
pipeline, davantage encore pour l'audio que pour le texte) sur des requêtes
dupliquées et des cibles invalides, dès qu'un appelant fournit des cibles
explicites région-taguées — c'est-à-dire dès qu'une retraduction manuelle ou le
pipeline audio pousse une préférence portant la locale appareil (rang 4 du
Prisme). Dimensions 2 (Performance) et 13 (Complétude) du `CLAUDE.md`.

## Impact technique

Surface minimale : une fonction pure privée
(`_canonicalizeExplicitAudioTargets`) et un `map`+`Set` substitué au passage
verbatim, sur la seule branche explicite. Aucun schéma, aucune requête, aucune
frontière réseau touchée — le format du fil ZMQ est inchangé (codes 2-lettres
lowercase, ce qu'il portait déjà dans le cas nominal). Fichier DISTINCT de #4590
(`MessageTranslationService.ts`, pas `ZmqRequestSender.ts`) : aucun conflit.

## Évaluation du risque

Très faible. `normalizeLanguageCode` est la SSOT déjà consommée par une dizaine de
sites du gateway et par la branche dérivée du même chemin. Le repli
(`?? raw.toLowerCase()`) préserve le comportement historique pour tout code que la
SSOT rejette. La détection ne peut que CONVERGER — des variantes s'effondrent sur
leur langue réelle — jamais introduire une cible qu'un code déjà canonique
n'aurait pas produite. Le fallback dur `['en', 'fr']` (langues déjà canoniques) et
la branche dérivée sont inchangés.

**Portée volontairement limitée** : ce lot canonicalise + déduplique, il ne RETIRE
PAS la langue source (comme le fait `_resolveTargetLanguages` pour le texte). La
« source » d'un vocal est la langue détectée par Whisper au sein du translator,
inconnue au dispatch — la retirer ici serait un changement de comportement non
prouvé. Suivi ouvert ci-dessous.

## Améliorations livrées

- `_canonicalizeExplicitAudioTargets(targetLanguages)` : fonction pure privée qui
  canonicalise (SSOT `normalizeLanguageCode`) ET déduplique en préservant l'ordre.
- `processAudioAttachment` applique ce helper à la branche EXPLICITE avant tout
  usage aval (dispatch `sendAudioProcessRequest`).
- Deux témoins ajoutés (`MessageTranslationService.audio.test.ts`) : dédup d'une
  variante région-taguée + repli casse-mixte en une cible (`['fr','fr-FR','EN'] →
  ['fr','en']`), et canonicalisation multi-langues underscore/région
  (`['pt-BR','PT','de_DE','de'] → ['pt','de']`).

## Critères de validation

- RED prouvé : les 2 nouveaux témoins échouent contre le passage verbatim
  (`['fr','fr-FR','EN']` et `['pt-BR','PT','de_DE','de']` dispatchés tels quels),
  verts après le fix (mesuré par restauration du verbatim).
- GREEN : 127/127 sur `MessageTranslationService.audio`, 269/269 sur les 5 suites
  `MessageTranslationService`.
- `tsc --noEmit` du gateway : EXIT=0.

## Suivi (hors périmètre)

- La racine de fond reste que `systemLanguage`/préférences/`participant.language`
  sont persistés verbatim (`z.string().optional()`, aucune normalisation à
  l'écriture). Chaque résolveur aval canonicalise ; une issue « normaliser les
  codes de langue à l'écriture » fermerait la classe entière — à ouvrir sur
  GitHub.
- `sendStoryTextObjectRequest` (le troisième émetteur ZMQ nommé par le suivi de
  #4590) : ses cibles descendent de `PostService.audienceLanguages`, déjà
  canonicalisé au cycle 287 (`normalizeLanguageForDedup`). Vérifié conforme — pas
  de lot requis.
- La branche explicite ne retire pas la langue source (audio détecté par Whisper,
  inconnu au dispatch) — à trancher si le translator expose la source détectée en
  amont.
