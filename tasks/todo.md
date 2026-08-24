# Cycle 125 bis — répondre par un VOCAL poussait une bannière au corps VIDE

> Le cycle 125 (PR #3476, mergée) a fermé la fuite du MÉDIA d'un message protégé. Ce lot solde
> le suivi qu'il a laissé — et qui traînait depuis le cycle 124.

## Point de départ — un suivi deux fois écarté, pour une raison fausse

> Les éventails RÉPONSE et MENTION composent depuis `notificationPreview` (jamais
> `…ForPush`) et ne reçoivent aucun résumé de pièce jointe.

Deux fois qualifié de « décision produit, pas correction de Prisme ». La formule est juste sur
un point — la langue ne change pas — et fausse sur ce qui compte. Sur un seul message :

| destinataire | ce qu'il voyait |
|---|---|
| les membres du fil | la transcription, ou « 📷 Photo · 1024×768 » |
| **celui à qui on répond** | **rien** |
| **celui qu'on mentionne** | **rien** |

> **Un corps VIDE n'est pas « un autre choix de produit », c'est l'absence de la bannière sous
> la bannière.** Aucun produit ne préfère un corps vide.

Le repli client ne rattrape pas (mesuré) : `audioBodyFallback` (NSE iOS) exige
`attachmentMimeType`, que ces deux éventails ne poussent pas non plus.

**La cause de fond** : `buildMessageNotificationBodyI18n` n'était appelé que par
`createMessageNotification`. Les deux autres posaient `content: this.servedPreview(...)` — une
projection plus PAUVRE — et rien ne le signalait, parce que `servedPreview` est un helper juste,
partagé, testé, que **les trois** appellent.

## Plan

- [x] TDD — 8 témoins RED d'abord (`replyMentionMediaPreview.test.ts`) : 7 rouges, 1 vert
      (le cas sans pièce jointe, qui prouve que le correctif ne doit rien changer là).
- [x] `servedBannerBody()` — la composition devient un SITE UNIQUE pour les trois éventails :
      descente du Prisme puis `buildMessageNotificationBodyI18n`. Sans média, le résultat est
      exactement le texte servi.
- [x] `NotificationBannerMedia` — l'éventail sépare la charge **par l'USAGE de ses champs** :
      ce qui compose un TEXTE (les trois éventails) / ce qui transporte un FICHIER (le message
      simple seul).
- [x] Réponse et mention reçoivent `notificationPreviewForPush` et `pushPreviewBasis` — les
      deux **déjà gardés par `mediaMayTravel`** (cycle 125), donc un message protégé retombe
      sur son placeholder ici comme là.
- [x] CHANGELOG — les entrées des cycles 125 et 125 bis, la section `[Unreleased]` ayant dérivé
      depuis le cycle 121.

## Revue

### Gates

| gate | résultat |
|---|---|
| `replyMentionMediaPreview.test.ts` (nouveau) | **7 rouges avant → 8/8 verts après** |
| suites voisines (`notifications/` + `messaging/` + éventail) | **43 suites, 794 témoins** |
| suite gateway complète | **856/856 suites, 19486 témoins** |
| `services/gateway` `tsc --noEmit` | **0 erreur** |
| mutation « câblage de l'éventail reverti » | **4 témoins tombent** |
| mutation « la composition ignore le résumé de média » | **3 témoins tombent** |
| Swift | non modifié |

### Une note de harnais

Le premier jet du témoin posait trois membres : l'expéditeur, celui à qui on répond, celui qu'on
mentionne. `createMessageNotification` n'a **jamais** été appelé — `alreadyNotified` les absorbe
tous les trois, et l'assertion de RÉFÉRENCE (« la réponse reçoit ce que reçoit le message
simple ») comparait à rien.

> Quand un témoin compare une branche à une autre, la branche de RÉFÉRENCE doit avoir de quoi
> exister. Trois rôles dans une conversation à trois membres n'en laissent aucun au quatrième.

### Détail

- `tasks/realtime-sync-audit-2026-08-24-cycle125-bis.md`
- `tasks/lessons.md` § Leçon 276
- Le lot précédent : `tasks/realtime-sync-audit-2026-08-24-cycle125.md`, § Leçon 275

### Suivi MESURÉ

- **Le rich-push n'est pas étendu à la réponse ni à la mention** — délibérément. Leur bannière
  compose désormais le bon TEXTE ; y attacher aussi le média inline est une décision produit
  distincte, et elle rouvre une surface de charge que le cycle 125 vient de resserrer.
- Réponse et mention ne poussent toujours ni `createdAt` ni `messageType` : leur bulle
  pré-enregistrée reste ordonnée par l'horloge du device (suivi du cycle 124).
- `isEncrypted` reste lue par la NSE et jamais émise — piège armé, pas panne.
- La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste traduite du Prisme.
- Aucun chemin de création n'écrit `isViewOnce` / `isBlurred` sur une `MessageAttachment` : le
  second niveau de `maskedAttachment` est armé, pas encore atteignable.
