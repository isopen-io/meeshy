# Itération 288 — `ZmqRequestSender.sendTranslationRequest` canonicalise ses cibles avec la MÊME loi que son jeu d'attente (fin de la divergence envoyé ↔ attendu)

Suite de la campagne « une source de vérité par règle de langue » (cycles
118→287, Prisme + `recipient-language.ts` + `normalizeLanguageForDedup` +
`PostService.audienceLanguages`). En balayant les sites qui dédupliquent des
codes de langue au DERNIER passage vers le translator, la Leçon 282 nommait déjà
le motif : « `.toLowerCase()` n'est pas `normalizeLanguageForDedup` ». Ce lot
ferme ce motif au point d'étranglement de TOUTE traduction de texte.

## État actuel (avant ce lot)

`services/gateway/src/services/zmq-translation/ZmqRequestSender.ts` :

```ts
const canonicalLanguage = (language: string): string =>
  normalizeLanguageCode(language) ?? language.toLowerCase();          // ligne 36 — SSOT locale, région strippée

async sendTranslationRequest(request, existingTaskId?) {
  // ligne 85 — dédup par .toLowerCase() BRUT : région CONSERVÉE
  const uniqueTargetLanguages = [...new Set(request.targetLanguages.map(l => l.toLowerCase()))];
  ...
  const requestMessage = { ..., targetLanguages: uniqueTargetLanguages };  // ENVOYÉ au translator
  await this.connectionManager.send(requestMessage);
  this.pendingRequests.set(taskId, {
    request,
    // ligne 121 — jeu d'ATTENTE : région strippée par canonicalLanguage
    pendingLanguages: new Set(uniqueTargetLanguages.map(canonicalLanguage)),
  });
}

// ligne 467 — à la réponse, on retire la langue reçue (canonicalisée) du jeu d'attente
entry.pendingLanguages.delete(canonicalLanguage(targetLanguage));
```

Ce `sendTranslationRequest` est le point d'étranglement UNIQUE de toute requête
de traduction de **texte** (les vocaux passent par `sendAudioProcessRequest` /
`sendTranscriptionOnlyRequest`, qui gardent la région — Leçon 282, la voix porte
la région). Tous ses producteurs — messages de conversation
(`MessageTranslationService`), diffusions admin (`admin/broadcasts.ts`), routes
voix/attachements acceptant `body.targetLanguages` — y déposent leurs cibles.

## Problème identifié

La dédup de la ligne 85 replie la CASSE (`.toLowerCase()`) mais NON la RÉGION,
alors que le jeu d'attente de la ligne 121 (et le retrait de la ligne 467)
replient les DEUX via `canonicalLanguage`. Sur tout code cible région-tagué d'une
langue supportée — `'en-US'`, `'fr-FR'`, `'pt-BR'`, produits par le web
(`Accept-Language`) et iOS (`Locale.current.identifier`), et persistés verbatim
en amont (`systemLanguage` = `z.string().optional()`, aucune normalisation à
l'écriture) — les deux jeux DIVERGENT :

| cible entrante | ENVOYÉE (ligne 85) | ATTENDUE (ligne 121) |
|---|---|---|
| `'en-US'` | `'en-us'` | `'en'` |
| `'fr-FR'` | `'fr-fr'` | `'fr'` |

Trois conséquences, chacune mesurée par témoin RED :

1. **Une cible NLLB invalide part au translator.** `'en-us'` / `'fr-fr'` ne sont
   pas des codes NLLB. Le translator ne produit rien pour cette cible (ou une
   `MessageTranslation` clé `'en-us'` qu'AUCUN lecteur au Prisme canonique `'en'`
   ne reconnaît — Prisme règle #1 : repli sur l'original non traduit).

2. **Le jeu d'attente ne se solde jamais pour cette langue.** La ligne 467 retire
   `canonicalLanguage('en')` = `'en'` du jeu d'attente ; mais si le translator
   répond sous la clé invalide `'en-us'` — ou ne répond pas — la langue `'en'`
   reste PENDANTE jusqu'au timeout. Le mécanisme de suivi des langues manquantes
   (renvoi `existingTaskId` avec les seules langues encore dues) se croit en échec
   sur une langue déjà servie, ou attend une langue jamais servie.

3. **Les variantes régionales gonflent le jeu envoyé.** `'fr'` et `'fr-FR'`
   comptent pour DEUX cibles (`'fr'`, `'fr-fr'`) au lieu d'une — travail ML
   dupliqué sur le poste le plus cher du pipeline.

## Cause racine

La ligne 85 réécrit à la main la canonicalisation-avec-repli au lieu d'appeler la
SSOT locale `canonicalLanguage`, déjà présente dans le fichier et déjà employée
par les DEUX autres sites qui manipulent ces mêmes codes (lignes 121, 467).
`.toLowerCase()` et `canonicalLanguage` rendent le même verdict sur un code déjà
canonique — d'où le témoin existant (« deduplicates and lowercases », sur
`['FR','fr','EN','en']`) qui ne pouvait PAS distinguer les deux (Leçon 282 : un
témoin de région s'écrit sur un code TAGUÉ région, jamais sur `'fr'`/`'en'`).

## Impact métier

Traductions de texte manquantes ou dupliquées et suivi de langues faussé dès
qu'un participant, un destinataire de diffusion ou un appelant fournit un code
région-tagué — cas nominal, la locale appareil (Prisme rang 4) et les préférences
web/iOS étant région-taguées à la source. Dimension 2 (Performance : travail ML
dupliqué), 11 (Maintenabilité : deux lois pour un même code dans une même
fonction) et 13 (Complétude : une langue réelle privée de traduction).

## Impact technique

Surface minimale : un site (ligne 85) route vers la SSOT locale déjà importée ;
la ligne 121 devient une simple `new Set(uniqueTargetLanguages)` (les codes sont
désormais déjà canoniques, le double `.map(canonicalLanguage)` était redondant).
Aucun schéma, aucune requête, aucune frontière réseau nouvelle. Les chemins AUDIO
(lignes 207, 238) restent verbatim — la région y porte la voix (Leçon 282).

## Évaluation du risque

Très faible. `canonicalLanguage` est déjà la loi appliquée au jeu d'attente et au
retrait ; l'aligner sur le jeu ENVOYÉ ne peut que CONVERGER les deux (une cible
invalide devient valide, deux variantes s'effondrent sur leur langue) — jamais
produire une cible qu'un code de langue réel n'aurait pas déjà. Les codes déjà
canoniques (`'fr'`, `'es'`) sont inchangés : les trois témoins existants passent
intacts.

## Améliorations proposées (implémentées)

- Ligne 85 : `request.targetLanguages.map(l => l.toLowerCase())` →
  `request.targetLanguages.map(canonicalLanguage)`.
- Ligne 121 : `new Set(uniqueTargetLanguages.map(canonicalLanguage))` →
  `new Set(uniqueTargetLanguages)` (redondance retirée, intention explicite).
- Un témoin RED ajouté (`ZmqRequestSender.test.ts`) sur des codes région-tagués
  (`['fr-FR','fr','en-US']` → `['fr','en']`), là où `.toLowerCase()` et la SSOT
  divergent — le témoin qui manquait (Leçon 282).

## Critères de validation

- RED prouvé : le nouveau témoin échoue contre `.toLowerCase()` (`['fr-fr','fr','en-us']`).
- GREEN : toute la suite `ZmqRequestSender`, les trois témoins de dédup existants intacts.
- `tsc --noEmit` du gateway : EXIT=0.
