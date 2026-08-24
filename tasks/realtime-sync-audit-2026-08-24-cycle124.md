# Cycle 124 — la bannière d'un VOCAL, et la bulle qu'un push pré-enregistre

Deux défauts nommés par le suivi MESURÉ du cycle 122, tous deux au même endroit
du fil push. En instruisant le premier, un TROISIÈME est tombé — et c'est le plus
grave. Le premier, lui, a été résolu en parallèle par le cycle 123 avec une
meilleure conception, que ce lot adopte en entier (§ 3).

## 1. Le point de départ : un suivi qui nommait deux absences

Le journal du cycle 122 se clôt ainsi :

> **Reste à câbler (suivi cycle 122, MESURÉ) :** la bannière d'un VOCAL reste
> dans la langue de l'expéditeur — sa transcription a ses propres traductions
> (`MessageAttachment.translations`) qu'aucun éventail ne descend ; c'est la
> raison même du `previewIsMessageContent: false` de ce lot, donc une absence
> ASSUMÉE. Et `NotificationService.prePersistMessage` côté NSE lit
> `userInfo["content"]`, une clé que le payload push ne porte pas […] — le
> message pré-enregistré au démarrage à froid a donc un corps VIDE jusqu'à la
> synchro REST, défaut distinct du Prisme.

Les deux ont été rouverts et RE-MESURÉS avant d'être traités (leçon 107 : un
suivi hérité est une affirmation, il se mesure avant d'être recopié). Les deux
étaient exacts. Le second l'était même au-delà de ce que le cycle 122 avait vu.

## 2. Défaut A — la protection était ANNONCÉE sans être APPLIQUÉE

Trouvé en ouvrant le site du suivi, pas en le cherchant.

`messageNotificationFanOut.ts:387` :

```ts
const notificationPreviewForPush = firstAttachmentTranscript ?? notificationPreview;
```

`notificationPreview` est le placeholder que `protectedPreview` vient de composer
quand le message est ÉPHÉMÈRE / à VUE UNIQUE / FLOUTÉ / CHIFFRÉ. La transcription
gagnait INCONDITIONNELLEMENT. Un vocal protégé poussait donc **son texte
transcrit entier sur l'écran verrouillé** — exactement ce que la protection
masque, et le seul écran où elle a une raison d'être.

Ce qui rend le défaut instructif, c'est que les deux gardes du cycle 122 étaient
en place et JUSTES :

| garde | état | ce qu'elle gardait |
|---|---|---|
| `notificationLocKey` | posé | le repli localisé de la NSE |
| `previewBasis: 'protected-placeholder'` | posé (cycle 123) | la SUBSTITUTION par une traduction, et la source du fil |

Elles gardaient la substitution d'un texte que la couche du dessus avait déjà
remplacé. **La protection était annoncée par deux champs et appliquée par
aucun** — c'est la forme exacte du défaut du cycle 123 sur `StoryViewer` (« le
Prisme était ANNONCÉ sans être APPLIQUÉ »), avec l'inversion qui la rend pire :
ici l'hôte rend PLUS que ce que le résolveur autorise.

Le cycle 123, mergé pendant ce lot, a renforcé ces gardes sans les déplacer :
`previewBasis: 'protected-placeholder'` vide désormais la source, et
`notificationLocKey` reste un second verrou. Les deux gouvernent toujours la
SUBSTITUTION, jamais l'aperçu. Corollaire de forme, non décoratif :
`pushPreviewBasis` élisait `transcript` AVANT de regarder la protection — sans
transcription à ce moment-là, la base retombe sur `protected-placeholder` et la
carte de l'attachment cesse d'être OFFERTE à la descente. **Une garde qui n'a
qu'un verrou n'a pas de garde ; elle a un pari sur ce verrou.**

> Un champ de service qui DÉCLARE une restriction ne la fait pas respecter. La
> question à poser à toute garde n'est pas « est-elle posée ? » mais « le texte
> qu'elle gouverne est-il bien celui qui part ? ».

**Correctif** : la transcription n'est extraite que si `protectedOverride ===
null`. Une ligne, à l'endroit où l'aperçu est composé.

## 3. Défaut B — CONVERGENCE avec le cycle 123, mené en parallèle le même jour

Ce lot a trouvé, et corrigé, une seconde absence : la transcription d'un vocal ne
descendait aucun Prisme, ses traductions vivant sur `MessageAttachment.translations`
sous une forme différente de celles du message.

**Le cycle 123 (PR #3459) l'a trouvée aussi, le même jour, et a été mergé le
premier.** Sa conception est MEILLEURE, et ce lot la prend en entier :

| | ce lot (abandonné) | cycle 123 (retenu) |
|---|---|---|
| forme | `previewPrismSource?: MessagePrismSource` **+** `previewIsMessageContent: boolean` | `PreviewPrismBasis`, type SOMME à trois membres |
| exclusivité | deux paramètres qui **peuvent se contredire** | mutuellement exclusifs par construction |
| portée | l'éventail `regular` seul | les **trois** éventails |
| projection du stockage | `transcriptPrismSource()`, local à la passerelle | `transcriptTranslationTexts()`, dans `packages/shared`, à côté du type qu'il projette |

> **La résolution d'une convergence n'est pas un compromis : c'est PRENDRE la
> meilleure conception en entier**, puis rejouer par-dessus ce que l'autre avait
> d'unique. Panacher aurait produit exactement la divergence que la leçon 264
> dénonce, dans le fichier qui la cite.

Ce que le cycle 123 n'avait pas vu, et qui reste le contenu propre de ce lot :
le défaut A ci-dessus (le CORPS, qu'il a laissé ouvert en fermant le FIL) et le
défaut C ci-dessous.

## 4. Défaut C — la bulle pré-enregistrée n'avait ni corps ni langue

Le second suivi du cycle 122, re-mesuré, et il portait plus loin qu'annoncé.

`prePersistMessage` (NSE, `apps/ios/MeeshyNotificationExtension/NotificationService.swift:422`) :

```swift
let content = userInfo["content"] as? String ?? ""
originalLanguage: (userInfo["originalLanguage"] as? String) ?? "en"
```

**Aucune des deux clés n'existe sur le fil.** Vérifié sur le seul producteur de
`data` (`createNotification`) et sur `PushNotificationService:785`, qui pose
`{ ...payload.data }` sans rien y ajouter. La bulle pré-enregistrée était donc
vide ET étiquetée « en » pour tout le monde — la seconde moitié n'était pas dans
le suivi, et elle est celle qui fausse la résolution du Prisme sur la bulle.

Une ligne pré-enregistrée n'a de raison d'être que dans la fenêtre AVANT la
synchro REST. Un corps vide y annule le bénéfice entier.

**Correctif** : `messageContent` / `messageOriginalLanguage` sur le contexte,
émis sous les noms `content` / `originalLanguage` que la NSE lit déjà — aucun
changement client.

Ce qui voyage est l'**ORIGINAL**, jamais la traduction : `MessageRecord.content`
est le champ d'origine et `originalLanguage` son étiquette. Y poser le texte
servi ferait mentir les deux, et la traduction a déjà son champ
(`translatedContent`) et son rang. Le couple n'est posé que quand l'aperçu EST
`Message.content` — même prédicat que la substitution nominale, répondant ici à
une autre question — et il est retiré sous `showPreview: false` (GW7) puis à la
seconde coupe du budget APNs, avec `encryptedContent`, dont il est de toute façon
exclusif.

## 5. Les témoins

| fichier | témoins | rouges prouvés |
|---|---|---|
| `unit/services/messaging/voiceNoteBannerPrism.test.ts` | 6 | **5** (garde de protection retirée) |
| `unit/services/notifications/nsePrePersistedMessage.test.ts` | 7 | **3** |

Les quatre témoins ajoutés à `messageNotificationPrism.test.ts` sont retirés : le
cycle 123 couvre la descente de la transcription par sa propre conception, et
ses témoins.

Trois points de méthode, tous repris de cycles antérieurs :

1. **Les témoins portent sur ce qui ATTEINT un lecteur** — la charge remise à
   APNs (`pushService.sendToUser`) ou les paramètres que l'éventail REMET au
   créateur. Jamais un calcul intermédiaire.
2. **Les verts ne sont pas du remplissage.** Le témoin « un vocal ORDINAIRE
   affiche bien sa transcription, et déclare SA source » garde le mode d'échec du
   CORRECTIF A : refermer la protection ne doit ni supprimer l'inline du cas
   nominal — la raison d'être d'`extractTranscriptionText` — ni lui retirer la
   source que le cycle 123 lui a donnée. Côté défaut C, « l'ORIGINAL, jamais la
   traduction » garde l'erreur qu'un correctif pressé aurait commise : poser dans
   `content` le texte que la bannière sert, et faire mentir `originalLanguage`.
3. **Le ROUGE se prouve par la mutation qu'il nomme.** Les cinq témoins de
   protection ont été vus tomber en retirant la seule condition
   `protectedOverride === null`.

## 6. Suivi — MESURÉ, pas hérité

**Les éventails RÉPONSE et MENTION ne portent aucune transcription.** Ils
composent depuis `notificationPreview` (jamais `…ForPush`) : la bannière d'une
réponse à un vocal, ou d'une mention dans un vocal, affiche `Message.content` —
vide pour un vocal pur, donc les seuls badges de pièce jointe. Absence
ANTÉRIEURE à ce lot et distincte de ses trois défauts : ce n'est pas un mauvais
rang ni une protection relâchée, c'est un aperçu qui n'a jamais été composé.
Non absorbé ici délibérément — leur donner la transcription change ce que leur
corps MONTRE, pas la langue dans laquelle il le montre, et c'est une décision
produit, pas une correction de Prisme.

Vérifié en ouvrant `createReplyNotification` et `createMentionNotification`, pas
déduit de la forme du lot.

## 7. Gates

| gate | résultat |
|---|---|
| `services/gateway` — suite COMPLÈTE (bun) | **849 suites / 19 408 témoins verts** |
| `services/gateway` — `tsc --noEmit` | 0 erreur |
| `packages/shared` — vitest | 108 fichiers / 2 574 témoins verts |
| `packages/shared` — `tsc --noEmit` | 0 erreur |

Les deux `tsc` ont été lus par leur CODE DE RETOUR après redirection, jamais à
travers un pipe (§ « un gate rend DEUX verdicts », `services/gateway/CLAUDE.md`).
