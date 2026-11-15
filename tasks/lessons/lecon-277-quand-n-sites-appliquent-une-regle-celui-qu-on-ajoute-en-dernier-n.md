## Leçon 277 — quand N sites appliquent une règle, celui qu'on ajoute EN DERNIER n'est pas le seul à manquer : c'est le PREMIER qui l'avait (2026-08-24, cycle 125 bis)

Le suivi disait, depuis deux cycles :

> Les éventails RÉPONSE et MENTION composent depuis `notificationPreview` (jamais
> `…ForPush`) et ne reçoivent aucun `attachmentInfo` — la bannière d'une réponse à un vocal
> affiche `Message.content`, vide pour un vocal pur.

Deux fois qualifié de « décision produit, pas correction de Prisme ». La formule était juste sur
un point — la langue ne change pas — et fausse sur ce qui compte :

| destinataire du MÊME message | ce qu'il voyait |
|---|---|
| les membres du fil | la transcription, ou « 📷 Photo · 1024×768 » |
| **celui à qui on répond** | **rien** |
| **celui qu'on mentionne** | **rien** |

> **Un corps VIDE n'est pas « un autre choix de produit », c'est l'absence de la bannière sous
> la bannière.** La question « est-ce une décision produit ? » se pose sur ce que l'utilisateur
> VOIT, pas sur la nature du champ manquant. Aucun produit ne préfère un corps vide.

### Le vrai motif — la composition vivait chez UN des trois

`buildMessageNotificationBodyI18n` — le compositeur qui remplace un texte absent par le libellé
du premier média — n'était appelé que par `createMessageNotification`. Les deux autres posaient
`content: this.servedPreview(...)`, une projection plus PAUVRE, et rien ne le signalait :
`servedPreview` est un helper juste, partagé, testé, et les trois éventails l'appellent.

> **Deux sites qui partagent le sous-helper d'une règle ont l'air de partager la règle.** La
> divergence ne se voit pas dans « qui appelle quoi » mais dans « qui appelle la COMPOSITION
> COMPLÈTE ». Compter les appelants du helper le plus BAS de la chaîne rassure à tort — c'est
> le plus HAUT qu'il faut compter.

### Corollaire — séparer une charge par ce qu'elle FAIT, pas par sa provenance

`attachmentInfo` était un objet unique de douze champs, tous issus de la même lecture Prisma.
Les trois éventails n'en veulent pas la même chose :

- `attachments`, `firstAttachmentFileSize/Duration/Width/Height` **composent un TEXTE** — les
  trois en ont besoin ;
- `firstAttachmentUrl`, `firstAttachmentMimeType`, `hasAttachments`, `firstAttachmentFilename`
  **transportent un fichier** ou alimentent un inventaire persisté — le message simple seul.

C'est exactement la séparation du cycle 125, vue de l'autre côté : là, confondre les deux a fait
partir un fichier sous une garde écrite pour une chaîne ; ici, les confondre a fait manquer une
chaîne à deux éventails qui n'avaient pas besoin du fichier. **Une charge se découpe par l'USAGE
de ses champs, jamais par la requête qui les a produits** — la requête est un fait d'origine, et
l'origine commune est précisément ce qui rend le mélange invisible.

### Corollaire — un témoin de fan-out a besoin d'un destinataire ORDINAIRE

Le premier jet du harnais posait trois membres : l'expéditeur, celui à qui on répond, celui
qu'on mentionne. `createMessageNotification` n'a jamais été appelé — `alreadyNotified` les
absorbe tous les trois, l'éventail régulier n'avait aucun candidat, et l'assertion de RÉFÉRENCE
(« la réponse reçoit ce que reçoit le message simple ») comparait à rien.

> Quand un témoin compare une branche à une autre, la branche de RÉFÉRENCE doit avoir de quoi
> exister. Trois rôles dans une conversation à trois membres n'en laissent aucun au quatrième
> rôle — celui qui n'en a aucun.
