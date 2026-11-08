## 2026-11-07 — Une LECTURE n'hérite pas de la garde que les ÉCRITURES du même fichier exigent (#16561)

`routes/reactions.ts` porte quatre routes. Ses deux ÉCRITURES exigeaient une
participation active — `where: { userId, conversationId, isActive: true }`, aux
lignes 158 et 354. Sa LECTURE décidait sur la liste NON filtrée :

```ts
include: { conversation: { include: { participants: true } } }
...
const isMember = message.conversation.participants.some(m => m.userId === userId);
```

Quitter, être retiré, être banni et la suppression pour soi posent tous
`isActive: false` et **gardent la ligne**. Un membre banni gardait donc l'accès au
trombinoscope des réactions — par emoji le compte, les `participantIds`, et pour
chaque réacteur son `displayName`, son `avatar`, son `userId` — et apprenait que
le message existe toujours.

> **Trois gardes dans un fichier ne font pas une garde du fichier.** La règle y
> était écrite DEUX fois, à vingt lignes et à deux cents lignes du site fautif, et
> la troisième porte ne l'avait pas. C'est la forme du cycle 127 (« une garde
> d'admission se pose sur CHAQUE chemin ») appliquée non pas à trois éventails
> jumeaux mais à **l'asymétrie lecture / écriture** : on relit volontiers les
> chemins qui MUTENT, parce qu'ils ont l'air dangereux, et on tient la lecture
> pour inoffensive. Elle ne l'est pas — ce qu'elle rend est précisément ce qu'on
> voulait retirer à cette personne.
>
> La question à poser à un fichier de routes : **« quelles portes y a-t-il, et
> laquelle n'a pas la garde que les autres ont ? »** — jamais « la garde est-elle
> posée ? », qui se répond oui dès qu'on tombe sur l'un des exemplaires.

### Filtrer dans le `where`, ne pas rejouer le prédicat en mémoire

La loi existe (`ADMITTED_FILE_READER_WHERE` : actif ET jamais banni) et son
doc-comment la destine à cet usage — « À répandre dans le `where` d'une lecture
`Participant` ». La poser dans la requête plutôt que d'écrire un prédicat
équivalent sur le tableau chargé évite une **jumelle divergente** de la loi, et
c'est ce que font déjà `routes/mentions.ts` et `routes/attachments/metadata.ts`.

Condition à vérifier AVANT de filtrer une relation chargée : **à quoi d'autre sert
le tableau ?** Ici il ne servait qu'aux deux contrôles d'admission, et
`captureNoticeWithheldFrom`, qui reçoit le même objet, ne lit que
`id`/`conversationId`/`senderId`/`messageType`/`metadata`. Filtrer était donc sans
effet de bord. Sur une relation consommée en aval, la même manœuvre aurait
silencieusement amputé autre chose.

### Le témoin assert sur la REQUÊTE

Un double Prisma rend ce qu'on lui dit **quel que soit le `where`** : un témoin
posé sur la réponse ne peut pas tomber sur ce défaut. Les deux témoins voisins qui
PASSAIENT déjà (403 sur liste vide, cas nominal) ne sont pas du décor : ils figent
la conséquence, pour qu'un retrait du filtre ne passe pas en silence.

### Note de pilotage — j'ai refait la faute que je venais d'écrire

La leçon du même jour (#16558) finissait par : « un numéro d'issue se VÉRIFIE après
création ». Le commentaire de CE lot citait `#16560` ; l'issue a reçu `#16561`.
Écrire la règle ne l'applique pas — c'est la leçon 307 (« une règle ne se propage
pas depuis son énoncé ») retournée contre son propre auteur, et le correctif n'est
pas une troisième formulation mais une habitude : **créer l'issue d'abord, écrire
son numéro ensuite.**
