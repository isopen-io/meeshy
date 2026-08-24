# Cycle 124 — la bannière d'un VOCAL, et la bulle qu'un push pré-enregistre

Deux défauts, tous deux nommés par le suivi MESURÉ du cycle 122, tous deux au
même endroit du fil push. En instruisant le premier, un TROISIÈME est tombé — et
c'est le plus grave des trois.

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
| `previewIsMessageContent: false` | posé | la SUBSTITUTION par une traduction |

Elles gardaient la substitution d'un texte que la couche du dessus avait déjà
remplacé. **La protection était annoncée par deux champs et appliquée par
aucun** — c'est la forme exacte du défaut du cycle 123 sur `StoryViewer` (« le
Prisme était ANNONCÉ sans être APPLIQUÉ »), avec l'inversion qui la rend pire :
ici l'hôte rend PLUS que ce que le résolveur autorise.

> Un champ de service qui DÉCLARE une restriction ne la fait pas respecter. La
> question à poser à toute garde n'est pas « est-elle posée ? » mais « le texte
> qu'elle gouverne est-il bien celui qui part ? ».

**Correctif** : la transcription n'est extraite que si `protectedOverride ===
null`. Une ligne, à l'endroit où l'aperçu est composé.

## 3. Défaut B — la transcription ne descendait AUCUN Prisme

`Message.translations` ne traduit que `Message.content`. Les traductions d'une
transcription vivent sur `MessageAttachment.translations`, sous une AUTRE forme :

| porteur | forme | texte |
|---|---|---|
| `Message.translations` | `{ lang: { text, isEncrypted? } }` | `.text` |
| `MessageAttachment.translations` | `{ lang: { transcription, deletedAt?, … } }` | `.transcription` |

Aucun éventail ne lisait la seconde. La bannière d'un vocal était donc **la seule
surface du produit à ne pas descendre le Prisme sur ce contenu**, pendant que la
bulle audio de la même application le descend depuis le cycle 119
(`AudioTrackLanguageResolver` / `resolveAutoLanguage` / `resolveTranslatedAudio`).

Le cycle 122 avait posé la bonne CONDITION et en avait tiré la mauvaise
conclusion : « la transcription est un autre texte » ⇒ ne pas la traduire. La
règle juste est **« ne pas la traduire avec la MAUVAISE source »**.

**Correctif** : `previewPrismSource` — la source qui traduit l'aperçu SERVI,
remise par l'éventail, qui est le seul à savoir ce que cet aperçu montre. La
DESCENTE, elle, reste le site unique (`resolvePrismTranslation`) : ce qui est
ajouté est une source, pas une boucle (leçon 264).

`transcriptPrismSource()` projette le stockage de la pièce jointe vers la forme
que la descente consomme — le pendant de `pushableTranslations` pour l'autre
porteur. Il en faut un second à cause de la FORME du stockage, jamais de la
règle, qui reste une.

Il écarte les entrées `deletedAt` : servir sur une bannière une traduction
soft-supprimée la rendrait plus durable que partout ailleurs, `hasTranslation` et
`getTranslation` l'appliquant déjà côté lecture.

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
| `unit/services/messaging/voiceNoteBannerPrism.test.ts` | 12 | **5** (garde de protection retirée) |
| `unit/services/notifications/messageNotificationPrism.test.ts` (+4) | 4 | **1** |
| `unit/services/notifications/nsePrePersistedMessage.test.ts` | 7 | **3** |

Trois points de méthode, tous repris de cycles antérieurs :

1. **Les témoins portent sur ce qui ATTEINT un lecteur** — la charge remise à
   APNs (`pushService.sendToUser`) ou les paramètres que l'éventail REMET au
   créateur. Jamais un calcul intermédiaire.
2. **Les verts ne sont pas du remplissage.** Le témoin « un vocal ORDINAIRE
   affiche bien sa transcription » garde le mode d'échec du CORRECTIF A : fermer
   la protection ne doit pas supprimer l'inline du cas nominal. Celui qui pose
   `Message.translations = { es: 'Hola' }` FACE à une source de transcription
   `{ es: 'Te llamo' }` ne peut passer que si la source remise l'emporte — un
   correctif qui aurait simplement rouvert la substitution servirait « Hola »,
   sans rapport avec l'audio.
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
