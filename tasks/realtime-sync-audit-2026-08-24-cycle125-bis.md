# Cycle 125 bis — répondre par un VOCAL poussait une bannière au corps VIDE

> Suivi MESURÉ du cycle 124, laissé ouvert deux cycles et deux fois qualifié de « décision
> produit ». La qualification était fausse, et la mesure le dit en trois lignes.

## Le défaut

Les éventails RÉPONSE et MENTION composent depuis `notificationPreview` — jamais
`notificationPreviewForPush` — et ne recevaient AUCUN résumé de pièce jointe. Leur corps était
donc `Message.content`, **vide** pour un vocal ou une photo sans légende.

`createMessageNotification` est le seul des trois à passer par
`buildMessageNotificationBodyI18n`, le compositeur qui remplace un texte absent par le libellé
détaillé du premier média (« 🎵 Audio · 0:07 », « 📷 Photo · 1024×768 ») et suffixe les badges
des suivantes.

Sur un seul message :

| destinataire | ce qu'il voyait |
|---|---|
| les membres du fil | la transcription, ou « 📷 Photo · 1024×768 » |
| **celui à qui on répond** | **rien** |
| **celui qu'on mentionne** | **rien** |

C'est le symptôme que les cycles 121 à 124 poursuivent — « deux textes pour un même message » —
dans sa forme extrême : le second texte est vide.

**Le repli client ne rattrape pas**, mesuré : `NotificationPayloadHelpers.audioBodyFallback`
(NSE iOS) n'agit que si `attachmentMimeType` commence par `audio/` — un champ que ces deux
éventails ne poussent pas non plus.

### Pourquoi il a survécu deux cycles

Il était NOMMÉ, dans le suivi, deux fois. Et deux fois écarté au motif que « le corriger change
ce que ces bannières MONTRENT, pas la langue dans laquelle elles le montrent — décision produit,
pas correction de Prisme ».

La formule est juste sur un point (la langue ne change pas) et fausse sur ce qui compte :

> **Un corps VIDE n'est pas « un autre choix de produit », c'est l'absence de la bannière sous
> la bannière.** Aucun produit ne préfère un corps vide.

### La cause de fond — la composition vivait chez UN des trois

Les deux autres posaient `content: this.servedPreview(...)`, une projection plus PAUVRE. Rien ne
le signalait : `servedPreview` est un helper juste, partagé, testé, et **les trois** l'appellent.

> Deux sites qui partagent le sous-helper d'une règle ont l'air de partager la règle. Compter
> les appelants du helper le plus BAS rassure à tort — c'est le plus HAUT qu'il faut compter.

## Le correctif

1. **`servedBannerBody()`** — la composition devient un site UNIQUE pour les trois éventails :
   descente du Prisme (`servedPreview`) **puis** `buildMessageNotificationBodyI18n`. Sans média,
   le résultat est exactement le texte servi — les deux éventails gardent leur corps au
   caractère près sur les messages texte.

2. **`NotificationBannerMedia`** — l'éventail sépare la charge **par l'USAGE de ses champs** :

   | ce qui compose un TEXTE (`bannerMedia`) | ce qui transporte un FICHIER (`richPushMedia`) |
   |---|---|
   | `attachments`, `firstAttachmentFileSize`, `firstAttachmentDuration`, `firstAttachmentWidth`, `firstAttachmentHeight` | `firstAttachmentUrl`, `firstAttachmentMimeType`, `hasAttachments`, `attachmentCount`, `firstAttachmentType`, `firstAttachmentFilename` |
   | **les trois éventails** | le message simple seul |

   C'est la séparation du cycle 125 vue de l'autre côté : là, confondre les deux a fait partir
   un fichier sous une garde écrite pour une chaîne ; ici, les confondre a fait manquer une
   chaîne à deux éventails qui n'ont pas besoin du fichier.

3. **Réponse et mention reçoivent `notificationPreviewForPush` et `pushPreviewBasis`** — les
   mêmes valeurs que le message simple, toutes deux **déjà gardées par `mediaMayTravel`**
   (cycle 125) : un message protégé retombe sur son placeholder ici comme là, et la base
   `transcript` n'est offerte à la descente que quand une transcription a le droit de partir.

## Gates

| gate | résultat |
|---|---|
| `replyMentionMediaPreview.test.ts` (nouveau) | **8 témoins — 7 rouges avant, 8 verts après** |
| suites voisines (`notifications/` + `messaging/` + éventail) | 43 suites, 794 témoins |
| suite gateway complète | _cf. `tasks/todo.md` § Revue_ |
| `services/gateway` `tsc --noEmit` | 0 erreur |
| Swift | non modifié |

## Suivi MESURÉ

- **Le rich-push n'est pas étendu à la réponse ni à la mention** — délibérément. Leur bannière
  compose désormais le bon TEXTE ; y attacher aussi le média inline (`firstAttachmentUrl`,
  `firstAttachmentMimeType`) est une décision produit distincte, et elle rouvre une surface de
  charge que le cycle 125 vient de resserrer. À instruire séparément.
- Réponse et mention ne poussent toujours ni `createdAt` ni `messageType` : leur bulle
  pré-enregistrée reste ordonnée par l'horloge du device (suivi du cycle 124).
- `isEncrypted` reste lue par la NSE et jamais émise — piège armé, pas panne.
- La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste traduite du Prisme.
- Aucun chemin de création n'écrit `isViewOnce` / `isBlurred` sur une `MessageAttachment` : le
  second niveau de `maskedAttachment` est armé, pas encore atteignable.
