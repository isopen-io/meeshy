# Cycle 125 — la protection masquait le TEXTE et laissait partir le FICHIER

> Audit de la couche notification-push du gateway, dans la continuité des cycles 121 → 124.
> Un seul lot, mesuré, avec sa mutation.

## Le défaut

`messageNotificationFanOut` compose l'aperçu d'une bannière de message. Le cycle 124 y a
refermé la dernière fuite de TEXTE connue : la transcription d'un vocal ne gagne plus sur le
placeholder que `protectedPreview` compose pour un message ÉPHÉMÈRE / à VUE UNIQUE / FLOUTÉ /
CHIFFRÉ.

Douze lignes plus bas, dans le même objet, sans aucune condition de protection :

```ts
firstAttachmentUrl: first?.fileUrl || undefined,
firstAttachmentMimeType: first?.mimeType || undefined,
```

`createNotification` les recopie dans `data.attachmentUrl` / `data.attachmentMimeType`
(sous la seule garde `showPreview`), et la NSE iOS — mesuré, `NotificationService.swift:171` —
télécharge cette URL puis l'attache en `UNNotificationAttachment` **sans jamais regarder
`notificationLocKey`**, la clé qui dit précisément « ce message est protégé ».

> **Une photo à VUE UNIQUE s'affichait donc ENTIÈRE sur l'écran verrouillé, en grand,
> sous une bannière disant « 👁️ 🖼️ ».**

La même charge transportait le NOM du fichier (`metadata.attachments.firstFilename`,
`firstAttachmentFilename`), sa taille et ses dimensions — et le nom, lui, est PERSISTÉ dans la
ligne `Notification`, donc relu longtemps après que la bannière a disparu.

### Pourquoi les gardes existantes ne l'attrapaient pas

Elles gardent toutes une CHAÎNE. `previewPrismSource` retient une traduction,
`prePersistedMessageFields` retient un corps, `protectedPreview` compose un placeholder. Trois
gardes justes, testées, posées au bon endroit — et **aucune ne parle du fichier**, qui n'a
jamais eu besoin d'un texte pour partir.

C'est la forme du cycle 124 portée d'un cran :

| | cycle 124 | cycle 125 |
|---|---|---|
| la garde masque | le corps | le corps |
| l'hôte sert quand même | **le texte transcrit** | **le média lui-même** |
| ce qu'il fallait remarquer | « le texte qu'elle gouverne est-il celui qui part ? » | « **qu'est-ce qui part À CÔTÉ ?** » |

### Le second niveau, que personne ne lisait

`MessageAttachment` porte SES PROPRES drapeaux de masquage — `isViewOnce`, `isBlurred`,
`effectFlags` — indépendants de ceux du message qui la porte. Le `select` de l'éventail n'en
lisait **aucun** : la protection d'un média n'était donc consultée à aucun des deux niveaux qui
la déclarent.

Mesure d'atteignabilité, honnête : à ce jour aucun chemin de création n'ÉCRIT ces deux drapeaux
sur une pièce jointe (`UploadProcessor`, `tus-handler`, `copyAttachments`, `MessageProcessor`
n'y posent que `isEncrypted`). Le niveau attachment est donc **armé, pas encore atteignable** —
mais il est déclaré par le modèle, lu par l'API (`AttachmentService`), et le coût de le
respecter est de trois champs dans un `select`.

## Le correctif

Trois sites, une règle.

1. **`maskedAttachment()`** — la JUMELLE de `protectedPreview`, posée juste à côté d'elle dans
   `NotificationService.ts`. `protectedPreview` dit ce que le CORPS a le droit de montrer ;
   celle-ci dit ce que la pièce jointe a le droit de laisser voyager. Adjacentes par
   construction : c'est la leçon 271 (« un helper à un appelant est un inventaire ») appliquée
   d'avance — deux jumelles séparées divergent.

   Elle ne lit PAS `isEncrypted` : le chiffrement d'une pièce jointe est un mode de TRANSPORT
   que le chemin de téléchargement dénoue, pas un masque d'affichage. Le message chiffré, lui,
   reste retenu — par la quatrième branche de `protectedPreview`.

2. **L'éventail** — `mediaMayTravel = protectedOverride === null && !maskedAttachment(first)`
   gouverne `attachmentInfo` EN BLOC (fichier + étiquettes) **et** `firstAttachmentTranscript`,
   qui posait déjà la même question un niveau plus bas. Un seul prédicat pour les deux : sans
   quoi le texte repartirait par la porte que le fichier vient de fermer.

   Retenu en bloc, et non le seul `fileUrl`, pour deux raisons mesurées : le nom de fichier est
   persisté (donc relu), et le placeholder porte déjà l'icône de type (`contentTypeIcon`) — le
   corps ne perd rien à ce silence.

3. **`createNotification`** — SECOND VERROU : un `notificationLocKey` non vide vide
   `attachmentUrl` / `attachmentMimeType` / `attachmentDurationMs`. Même arbitrage que
   `previewPrismSource` et `prePersistedMessageFields`, et il n'est pas redondant :
   `protectedPreview` est l'unique producteur de cette clé dans tout le dépôt (vérifié), donc
   sa présence est une déclaration de protection qu'aucun appelant ne pose par accident. Un
   appelant qui masque le corps sans retirer son média perd ici le rich-push, jamais le secret.

### Pas de changement iOS, et c'est délibéré

La NSE pourrait refuser d'attacher un média quand `notificationLocKey` est présent. Elle n'a
pas été touchée :

- la fuite est fermée **à la source**, et la source est le seul endroit qui CONNAÎT l'état de
  protection du message — le client ne fait que rendre ce qu'on lui envoie ;
- pour le seul cas où la NSE révèle légitimement un contenu protégé (E2EE déchiffré
  localement), la passerelle ne pousse plus d'URL du tout : la garde cliente serait inerte ;
- une édition Swift non compilable ici achèterait un risque de build (cf. leçon 274,
  corollaire de harnais) contre zéro comportement observable.

## Gates

| gate | résultat |
|---|---|
| `protectedMediaLeaks.test.ts` (nouveau) | **15 témoins** — 13 rouges avant, 15 verts après |
| suites voisines (`notifications/` + éventail + `voiceNoteBannerPrism`) | 24 suites, 366 témoins |
| suite gateway complète | **854/854 suites, 19476 témoins** |
| `services/gateway` `tsc --noEmit` | 0 erreur |
| mutation « `mediaMayTravel` retiré de l'éventail » | **17 témoins tombent** (dont les 14 du cycle 124) |
| mutation « second verrou retiré de `createNotification` » | **1 témoin tombe** |
| Swift | non modifié |

La première mutation est la mesure qui compte : `mediaMayTravel` a REPRIS
`firstAttachmentTranscript`, la garde du cycle 124, dont les témoins tombent donc depuis son
NOUVEAU site.

## Suivi MESURÉ

- **Les éventails RÉPONSE et MENTION ne composent aucun aperçu de média.** Ils reçoivent
  `notificationPreview` (jamais `…ForPush`) et aucun `attachmentInfo`, donc leur corps est
  `Message.content` — VIDE pour un vocal ou une photo sans légende. Répondre à quelqu'un par un
  vocal lui pousse une bannière au corps vide pendant que les autres membres reçoivent la
  transcription. Reporté du cycle 124, toujours ouvert : le corriger change ce que ces bannières
  MONTRENT, pas la langue dans laquelle elles le montrent.
- `isEncrypted` reste lue par la NSE et jamais émise (cycle 124) — piège armé, pas panne.
- Les éventails réponse et mention ne poussent ni `createdAt` ni `messageType` : leur bulle
  reste ordonnée par l'horloge du device.
- La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste traduite du Prisme
  (hérité du cycle 123).
- Aucun chemin de création n'écrit `isViewOnce` / `isBlurred` sur une `MessageAttachment` —
  le second niveau de `maskedAttachment` est armé, pas encore atteignable.
