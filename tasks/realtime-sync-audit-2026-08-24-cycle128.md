# Cycle 128 — la bannière servait la bonne LANGUE et attachait le mauvais SON

## Résumé

Suivi MESURÉ du cycle 123, resté ouvert quatre cycles et instruit ici :

> « La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste
> traduite du Prisme. »

Le cycle 123 a donné à la transcription d'un vocal sa propre source de Prisme
(`PreviewPrismBasis.transcript`) : depuis, le TEXTE de la bannière descend le
prisme du lecteur. Le FICHIER attaché à côté est resté `first?.fileUrl` —
l'original, sans condition, identique pour tous les lecteurs.

Un francophone recevant un vocal anglais voyait donc, sur son écran verrouillé,
une bannière **en français** au-dessus d'un `UNNotificationAttachment` qui
**parle anglais**. Les trois clients savent pourtant descendre le Prisme sur la
piste JOUÉE en conversation — `AudioTrackLanguageResolver` (iOS),
`resolveAutoLanguage` (web), `resolveTranslatedAudio` (Android). L'écran
verrouillé était la SEULE surface de la famille AUDIO qui ne le faisait pas.

## Pourquoi c'est atteignable, et pas un piège armé

Le pipeline audio écrit la piste pour chaque langue, en production :

```ts
// MessageTranslationService._handleAudioProcessCompleted
newTranslationEntries[lang] = {
  type: 'audio', transcription: …,
  url: `/api/v1/attachments/file/translated/${attachmentId}_${lang}.${ext}`,
  durationMs: …, format: …,
};
```

Et la lecture est **GRATUITE** : `translations: true` est dans le `select` de
l'éventail DEPUIS le cycle 123. `transcriptTranslationTexts()` n'en dépouillait
que le TEXTE, laissant `url` / `durationMs` / `format` sur la même ligne, déjà
lue. C'est la leçon 279 appliquée au MÉDIUM, et la même mesure que le cycle 127 :
avant de conclure qu'une garde coûterait une requête, regarder ce que le site
lit déjà.

## Ce qui a été vérifié jusqu'au PIXEL

La question du cycle 122 — « qui AFFICHE ce que le résolveur élit ? » — a été
posée à chaque maillon, et la chaîne est complète **sans une ligne de code
client** :

| maillon | verdict |
|---|---|
| l'URL servie est RELATIVE | `NotificationPayloadHelpers.resolveRemoteMediaURL` la résout contre l'origine API de confiance |
| l'allowlist NSE | schéma + hôte seulement — aucun filtre de CHEMIN à franchir |
| la route `/attachments/file/translated/…` | `fastify.get('/attachments/file/*')` — wildcard MULTI-segment, sans authentification, sandboxée contre la traversée |
| le fichier sur disque | écrit sous `${UPLOAD_PATH}/translated/`, la base que la route résout |
| le `typeHint` UTI | `audio/mp3` → `("mp3", "public.mp3")` |

Ce dernier point justifie `normalizeTrackMimeType`, qui n'est pas cosmétique :
le producteur écrit `format: 'mp3'` (extension nue). Remis tel quel, il rate le
`hasPrefix("audio/")` de `fileHints` et retombe sur `(ext, nil)` — **pièce jointe
sans typeHint, rendu dégradé**. Les deux producteurs du dépôt divergent (`'mp3'`
côté message, `'audio/mp3'` côté post) : le dépouillement NORMALISE plutôt que de
choisir.

## Les trois décisions de conception

1. **La piste est élue par la langue du TEXTE SERVI, jamais par une descente
   indépendante.** Deux descentes parallèles laisseraient la bannière dire « la
   réunion est déplacée » au-dessus d'une piste espagnole. `servedTranslation`
   est l'unique électeur : une descente, deux projections — la discipline que le
   cycle 123 a posée pour `servedPreview` / `servedTranslationFields`.
2. **`served === null` ⇒ fichier original.** Le Prisme n'a rien élu : le message
   est déjà dans la langue du lecteur.
3. **Langue élue SANS piste ⇒ fichier original.** Fail-OPEN sur le médium — le
   TTS peut manquer là où la traduction texte existe, et le son d'origine vaut
   mieux que le silence. Le texte, lui, reste servi traduit.

Et les trois champs voyagent ENSEMBLE : `url`, `mimeType`, `durationMs`. Ils ne
retombent PAS individuellement sur ceux de l'original — ils décriraient un autre
fichier.

## Le second défaut, trouvé en LISANT le corps composé

Le premier témoin RED a rendu, pour un vocal de 12 unités : **« 🎵 Audio · 0:00 »**.

`MessageAttachment.duration` est en MILLISECONDES — `schema.prisma` le dit
(« Durée en MILLISECONDES (précision complète) ») et le doc-comment de
`formatSingleAttachmentLabelI18n` le REDIT (« champ `duration` de
MessageAttachment, cf. schema.prisma »). Son unique producteur, l'éventail,
passe la colonne telle quelle. Deux sites de `createMessageNotification` la
multipliaient par 1000 comme si elle était en secondes :

| site | ce qui partait pour un vocal de 34 s |
|---|---|
| `context.firstAttachmentDurationMs` (fil push) | `34 000 000` ms — 9 h 26 |
| `metadata.attachments.firstDurationMs` (ligne PERSISTÉE) | idem |

> **Deux lectures d'un MÊME champ, dans le MÊME objet littéral, sous deux
> unités.** Le doc-comment qui dit vrai est à quarante lignes de la ligne qui dit
> faux, et rien ne les confronte : c'est le NOM du champ d'arrivée
> (`…DurationMs`) qui rend la conversion crédible. Il annonce l'unité de la
> DESTINATION, jamais celle de la SOURCE.

Gravité mesurée, et il faut la dire honnêtement :

- `attachmentDurationMs` sur le fil push — **aucun client ne le lit** (mesuré sur
  iOS, Android, web, et la NSE). Piège armé, pas panne.
- `firstDurationMs` persisté — **DÉCLARÉ et décodé par le SDK iOS**
  (`NotificationModels.swift:379`), dont la fixture de sa propre suite pose
  `34000` pour 34 s. Le contrat est en millisecondes, et le gateway le violait.

Corrigé dans ce lot parce que c'est exactement ce que la chaîne du cycle
QUALIFIE : la durée voyage avec le fichier, et le corps de la bannière la compose.

## Le correctif

| site | ce qui change |
|---|---|
| `packages/shared/types/attachment-audio.ts` | `transcriptTranslationTracks()` — la JUMELLE de `transcriptTranslationTexts`, pour le MÉDIUM. Site UNIQUE du dépouillement. `normalizeTrackMimeType` privé |
| `NotificationService.servedAttachmentMedia()` | l'élection, extraite pour qu'elle n'ait qu'un site |
| `NotificationService.createMessageNotification` | `attachmentTracks?`, l'élection AVANT la composition du corps, et les deux `* 1000` retirés |
| `messageNotificationFanOut.ts` | la carte des candidates, gardée par `mediaMayTravel`, remise au lot `regular` |

**Les deux jumelles ne rendent PAS le même jeu de langues, et c'est le point** :
une traduction TEXTE peut exister sans que le TTS ait produit sa piste. Une
entrée sans `url` concourt pour le texte et pas pour le son — ce qui fait
retomber l'élection sur le fichier original plutôt que sur une URL vide.

## La porte NEUVE, et sa garde

La carte des pistes est un chemin de PLUS par lequel un fichier peut atteindre un
écran verrouillé. Le cycle 125 a fermé celle du fichier original ; ouvrir
celle-ci sans la garder aurait rouvert la même fuite sous un autre nom. Elle est
donc gardée par `mediaMayTravel` — le prédicat qui gouverne déjà `attachmentInfo`
EN BLOC et `firstAttachmentTranscript` — aux DEUX niveaux qui déclarent la
protection (le MESSAGE et la PIÈCE JOINTE), et le verrou `notificationLocKey` de
`createNotification` la vide une seconde fois côté payload. Cinq témoins gardent
ce mode d'échec du correctif.

## Gates

| gate | résultat |
|---|---|
| `prismAudioTrackGate.test.ts` (nouveau) | **4 rouges contre `origin/main` / 11 verts après** |
| `prismAudioTrackFanOut.test.ts` (nouveau) | **2 rouges contre `origin/main` / 9 verts après** |
| `packages/shared/__tests__/types/attachment-audio.test.ts` | 46 verts (7 neufs) |
| suites voisines (`notifications` + éventail + `NotificationService*`) | 58 suites, 1103 témoins, exit 0 |
| suite gateway complète (`bun run test:coverage`) | **863/863 suites, 19588 témoins**, exit 0 — couverture **95,48 %** stmts / **89,63 %** branches (95,47 / 89,60 au cycle 127) |
| suite `packages/shared` complète (`vitest run`) | **109/109 fichiers, 2593 témoins**, exit 0 |
| `services/gateway` `tsc --noEmit` | 0 erreur (code de retour lu SANS pipe) |
| `packages/shared` `tsc --noEmit` | 0 erreur |
| Swift / Kotlin | **non modifiés** — la chaîne était déjà complète côté client |

Les témoins qui PASSENT déjà contre `main` ne sont pas du remplissage : ils
gardent le mode d'échec du CORRECTIF (la porte neuve refermée par la protection,
le repli fail-open sur une piste absente, le cas sans carte) et non celui du
défaut. C'est la même distinction que le cycle 127.

## Suivi MESURÉ

- **Le rich-push reste hors des éventails réponse et mention** — décision du
  cycle 125 bis, toujours conservée : la carte des pistes ne part qu'avec le
  média, donc au seul lot `regular`. Rien de ce cycle ne la rouvre.
- **`attachmentDurationMs` reste un champ du fil que personne ne lit.** Il est
  désormais JUSTE, il n'est toujours pas SERVI. Même forme que
  `translatedContent` avant le cycle 122 — la question à lui poser reste « qui
  l'affiche ? », et la réponse est encore « personne ».
- **La bannière d'une VIDÉO n'a pas d'équivalent.** `AttachmentTranslation.type`
  déclare `'video'`, et le dépouillement des pistes est générique — c'est le site
  d'appel qui le borne à `audio/`, comme le fait déjà `firstAttachmentTranscript`.
  Le jour où le pipeline produit une piste vidéo traduite, la garde est à un
  prédicat près. **Non instruit ici, et distinct.**
- **`Message.ephemeralDuration` reste écrit par personne** (constat du cycle 93,
  revérifié en passant sur `forwardAdmission`) — armé, pas panne.
- Le rappel push (APNs `content-available` + suppression côté NSE) reste le
  suivi ouvert du cycle 127, toujours non instruit, toujours un lot à lui seul.
