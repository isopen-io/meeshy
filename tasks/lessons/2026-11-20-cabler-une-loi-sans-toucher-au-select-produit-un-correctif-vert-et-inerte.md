## Câbler une loi sans toucher au `select` produit un correctif VERT et INERTE

*2026-11-20 — #20017, première des cinq portes.*

`GET /links/:identifier/messages` servait la transcription d'un vocal protégé à
qui ouvre l'URL d'un lien, **sans compte**. Le correctif évident est d'appeler
la loi (`servedSideContent`) au site de formatage. Appliqué seul, il n'aurait
rien gardé du tout, et sa suite aurait été verte.

Parce que la loi ne regarde que ce que la REQUÊTE a chargé :

```ts
mediaSideContentMayTravel(attachment, carrier)
//   maskedAttachment(attachment)  → ne lit que les drapeaux PRÉSENTS
//   if (!carrier) return true;    → porteur absent ⇒ AUTORISE
```

Les pièces du lien étaient chargées par `attachmentMediaSelect`, qui porte
`transcription` et `translations` et **aucun drapeau de protection** (mesuré :
zéro occurrence d'`isViewOnce`, `isBlurred`, `effectFlags`, `isEncrypted`) et
n'attache pas le porteur. Les deux conditions de la loi étaient donc
structurellement satisfaites : elle rendait `true` pour toutes les pièces, y
compris une pièce à vue unique dans un message éphémère.

> **Une garde qui lit une ligne hérite du `select` qui l'a chargée.** Le `select`
> est le seul des deux qu'aucun témoin de comportement ne peut voir : un double
> Prisma rend ce qu'on lui dit, quel que soit le `select`. On peut donc livrer
> une garde, la prouver ROUGE sur une fixture complète, et n'avoir rien gardé en
> production — c'est la même mesure que le § « le `select` est le seul des trois
> qu'aucun témoin de rang ne peut voir » de `services/gateway/CLAUDE.md`, portée
> d'un résolveur de Prisme à une garde de confidentialité.

La question à poser à tout câblage de loi est donc : **quelles colonnes la loi
lit-elle, et celles-ci sont-elles dans le `select` de CE chemin ?** Et elle se
répond en ouvrant le `select`, jamais en lisant le site d'appel.

### Les drapeaux servent DEUX fois, et le second usage est un défaut distinct

Ajouter `attachmentProtectionSelect` arme la loi. Mais les drapeaux ne sont pas
seulement une entrée de garde : ils sont une **déclaration que le client lit**.
Le dépôt écrit déjà ce que leur absence coûte, pour la citation
(`api-schemas/message.ts`) :

> « côté client l'absence n'est pas un champ manquant mais une INVERSION —
> `declaredProtection` rend `nil` quand les deux sont absents, un silence que la
> citation lit comme *rien à protéger* »

Un visiteur anonyme rendait donc une pièce à vue unique **entière**, faute de
savoir qu'elle l'était. Ce défaut-là n'était pas dans l'issue : il s'est
présenté en instruisant le `select` pour la loi.

### La corroboration était dans le fichier, trois issues plus tôt

Le doc-comment de `formatLinkMessageWithDetails` porte #4885 :

> « `getConversationMessagesWithDetails` charge la ligne `Message` ENTIÈRE, donc
> `isViewOnce`/`isBlurred`/`effectFlags`/`expiresAt` sont déjà dans `message` :
> ce formateur ne les recopiait pas […] la population la plus exposée (visiteurs
> sans compte) était aussi la seule à n'avoir aucun moyen de savoir qu'un message
> est protégé. »

**Exactement le même défaut, sur exactement le même chemin, un niveau plus bas** :
#4885 l'a réparé pour le MESSAGE, personne ne l'a posé la question pour la
PIÈCE. Un correctif consigne ce qu'il touche, et son récit se relit comme s'il
couvrait la famille.

### Et la fuite n'avait pas été écrite — elle avait été héritée

Le doc-comment d'`attachmentMediaSelect` le dit de lui-même : le couple Prisme
est « the critical addition vs the pre-R4 local copies in …
`routes/links/prisma-queries.ts` … ». Un lot de **CAPACITÉ** a enrichi cette
porte pour que les clients rendent l'audio multilingue ; aucun lot de
**PROTECTION** n'a suivi.

> Un lot qui ajoute une donnée à N chemins crée N questions de confidentialité
> et n'en instruit aucune — sa liste de chemins enrichis est pourtant
> exactement la liste des sites à garder, écrite par lui, dans son propre
> doc-comment.
