## Leçon 279 — un lot qui fait CONVERGER une chaîne laisse derrière tout ce qui la QUALIFIE (2026-08-24, cycle 126)

**Contexte.** Le cycle 125 bis a fait converger le CORPS des trois bannières de
`messageNotificationFanOut` : réponse et mention reçoivent enfin
`notificationPreviewForPush`, `pushPreviewBasis` et le résumé de média qui
compose le texte. Le correctif est juste, testé, et sa leçon (§ 277) nomme
exactement le motif — « la composition vivait chez UN des trois ».

Deux champs de l'éventail ne l'ont pas suivi, et pour une raison qu'il faut dire
à voix haute : **ils ne composent aucune chaîne.**

| champ resté derrière | ce qu'il fait | ce que son absence coûtait |
|---|---|---|
| `notificationLocKey` | QUALIFIE le placeholder (la NSE le rend depuis sa propre table) et sert de SECOND VERROU à `createNotification` | placeholder non localisé ; le verrou du cycle 125 inapplicable sur ces deux éventails |
| `messageCreatedAt` / `messageType` | l'horloge SERVEUR de la bulle que la NSE PRÉ-ENREGISTRE | la bulle d'une réponse datée par l'horloge du DEVICE, donc mal rangée dans le fil |

**La règle.**

> **Un lot qui partage une valeur composée doit énumérer ce qui voyage AVEC
> elle, pas seulement ce qui la compose.** Un champ qui QUALIFIE un texte —
> une clé de localisation, une horloge, un type, une base — ne se trouve pas en
> cherchant « qui compose ce texte ? » : par construction, il n'apparaît dans
> aucune composition.

C'est la forme du cycle 125 (§ 275) rejouée un cran plus haut. Là, quatre gardes
tenaient une CHAÎNE pendant que le fichier partait dans l'objet voisin ; ici, un
lot fait converger une CHAÎNE pendant que ce qui la qualifie reste derrière. Le
même angle mort, la même cause : **le niveau d'abstraction du correctif rend
invisible ce qui ne participe pas à sa phrase.** La question se pose AU MOMENT du
correctif, et se répond en lisant l'objet remis LIGNE À LIGNE — pas en relisant le
code qui le construit.

**Le motif de structure qui l'a rendu possible.** `createMentionNotificationsBatch`
relayait `commonData` vers `createMentionNotification` **champ par champ** : neuf
lignes de recopie. Un relais de cette forme retient silencieusement tout ce qu'on
ajoute en amont — il ne rougit jamais, il ne perd rien de visible, il oublie. Le
correctif extrait les deux seuls champs RENOMMÉS (`senderId` → `mentionerUserId`,
`messageContent` → `messagePreview`) et répand le reste :

```ts
const { senderId, messageContent, ...banner } = commonData;
… this.createMentionNotification({ ...banner, mentionedUserId, mentionerUserId: senderId, messagePreview: messageContent, prismSource })
```

> **Un relais qui recopie est un inventaire à tenir à jour ; un relais qui répand
> n'en est pas un.** Ne recopier que ce qui change de NOM — le reste passe, et un
> champ ajouté demain arrive à destination sans qu'on ait à s'en souvenir.

**Ce qui n'a PAS été repris, et pourquoi.** Le cycle 125 bis a délibérément gardé
le rich-push (`firstAttachmentUrl` / `firstAttachmentMimeType` /
`metadata.attachments`) hors de ces deux éventails : « leur bannière compose
désormais le bon TEXTE ; y attacher le média inline rouvrirait une surface que le
cycle 125 vient de resserrer ». Cette décision est CONSERVÉE. Une convergence de
lots ne se résout pas en prenant l'union des deux : la décision explicite et
raisonnée du lot mergé en premier l'emporte sur l'argument de cohérence du second
(§ Note de convergence, `CLAUDE.md`).

**Le témoin qui l'attrape** n'assert ni sur le texte ni sur le rang, mais sur ce
qui l'accompagne : `replyMentionBannerClock.test.ts` — l'horloge servie, le
`select` qui la charge (une requête, pas deux), le silence quand la relecture
fail-open tombe, et les trois choses que le verrou retient (traduction du fil,
corps pré-enregistré, média).

---
