# Cycle 188 — le lieu où un défaut se répare : #19956, la racine du cycle 187

*2026-11-20, à la suite du cycle 187 (#19917, lot RETIRÉ après audit bloquant).
Branche `claude/exciting-planck-atez45`.*

---

## Ce que le cycle 187 avait laissé, et pourquoi c'est ici que ça se répare

Le cycle 187 voulait rattraper, depuis le dédoublonnage, les pièces jointes
qu'un rejeu n'avait liées à personne. L'audit l'a cassé en trois points, et son
journal a conclu : **le lieu où un défaut se VOIT n'est pas le lieu où il se
répare.** La racine est #19956 — laisser l'échec de liaison faire ÉCHOUER
l'envoi, pour que la reprise reconstruise un message COMPLET par le chemin
nominal, avec son scellement, son audio et son type.

C'est ce que ce cycle livre.

## Le fait

`MessageProcessor.saveMessage` crée la ligne `Message` **avant** de lier ses
pièces. La branche « pièces pré-téléversées » vivait sous un `catch` qui
journalise :

```ts
try {
  if (data.attachmentIds?.length) { await associate(…); await sealFiles(); … }
  else if (data.forwardedFromId) { … }
} catch (error) {
  logger.error('[MessageProcessor] Error handling attachments', error);
}
```

Un échec rendait donc l'envoi « réussi » sur une **bulle VIDE** — et le rejeu
au même `clientMessageId` la **CONFIRMAIT** en dédup, le chemin de
dédoublonnage retournant avant la liaison. L'état était définitif : pas de
pièce, pas de scellement, pas d'audio, `messageType` resté `'text'`.

La branche COPIE, vingt lignes plus haut, avait déjà tranché l'inverse — et
avait écrit sa raison, mot pour mot, en commentaire. **Elle ne documentait que
son propre exemplaire** (`CLAUDE.md`, « Cette entité a-t-elle une JUMELLE ? »).

## Trois verdicts, pas un alignement

L'alignement naïf aurait été faux. Les trois échecs ne laissent pas le même
état, et c'est pour cela que la règle vit désormais dans
`services/gateway/src/services/messaging/attachmentFailureOutcome.ts` plutôt
qu'en commentaire sur la branche qui l'a inventée :

| ce qui lève | verdict | pourquoi |
|---|---|---|
| LIAISON des pièces pré-téléversées | libérer, supprimer, propager | rien n'est attaché : la bulle est vide |
| COPIE d'une diffusion | supprimer, propager — **sans libérer** | les lignes recopiées naissent AVEC le message |
| SCELLEMENT au repos après une liaison réussie | absorber, l'envoi RÉUSSIT | les pièces SONT liées ; les orpheliner serait pire, et le rattrapage est idempotent |

### Ce qui sépare les deux premières lignes : la LIBÉRATION

`AttachmentService.associateAttachmentsToMessage` ne relie qu'un `messageId`
**nul ou absent** (`unsetOrNull`), et il écrit **une pièce par requête**
(`Promise.all` de `updateMany`). Un échec au milieu du lot laisse donc les
premières pièces LIÉES, c'est-à-dire **inéligibles au rejeu**.

Supprimer la ligne sans les libérer aurait produit exactement ce que le
cycle 187 s'est fait reprocher : **un état à moitié réparé, silencieux et
définitif** — la reprise aurait reconstruit un message AMPUTÉ, sans que rien ne
le dise. Les rendre à l'état non lié est ce qui fait de la reprise un chemin
nominal COMPLET.

> Reprendre une jumelle « en entier » (cycle 85) ne veut pas dire copier son
> corps : ici le geste de plus — la libération — n'existe PAS chez la jumelle,
> parce que la jumelle n'a rien à rendre. **Ce qu'on reprend d'une jumelle est
> sa QUESTION, pas sa réponse.**

### Et le scellement ne descend pas avec eux

`sealMessageAttachments.ts` énonce déjà son propre régime d'échec dans son
doc-comment : « un échec de scellement n'efface rien et ne bloque pas l'envoi
déjà écrit […] la migration de rattrapage, idempotente, le rejoue ». Le verdict
était donc écrit ; ce qui manquait est sa PORTÉE.

**Le scellement vivait sous le même `try` que le départ de l'audio.** Une
exception du scellement — la seule qui échappe à
`sealMessageAttachmentsAtRest`, dont les erreurs par pièce sont déjà absorbées,
est l'infrastructure sous son `findMany` — sautait donc
`processAudioAttachments`. Or **cette fonction n'a qu'un appelant et aucun
rattrapage** : un vocal restait à jamais non transcrit, donc sans traduction,
sans TTS et sans Prisme. Un échec rattrapable emportait un échec définitif.

> Deux gestes sous le même `catch` partagent son verdict, pas sa réversibilité.
> **Avant d'absorber une erreur, demander ce qui vit APRÈS elle dans le bloc, et
> si ce quelque chose a, lui, un rattrapage.** C'est la forme « une étiquette de
> `catch` ne qualifie que ce que son auteur avait en tête » (cycle 116), vue
> depuis la portée plutôt que depuis l'étiquette.

## Ce que le lot a trouvé en cessant d'avaler l'échec

**Deux doubles Prisma n'ont JAMAIS déclaré `messageAttachment.updateMany`.**
`MessagingService.attachmentRights.test.ts` et `.guestAttachmentKinds.test.ts`
font tourner le VRAI `AttachmentService` : la liaison y levait
`TypeError: prisma.messageAttachment.updateMany is not a function` à **chaque
envoi**, et le `catch` rendait l'envoi « réussi » par-dessus. Trente-six témoins
verts, tous sur des envois dont la liaison échouait.

> Le dépôt connaît « un double qui rend `[]` rend tout témoin de contenu
> trivialement vert », et « un double ment aussi par ce qu'il ACCEPTE ». En
> voici une troisième forme : **un double ment par ce qu'il n'a PAS, quand un
> `catch` fail-open se charge de l'excuser.** Le double n'est pas le coupable —
> il est incomplet, ce qui arrive ; c'est l'absorption qui le rend indétectable.
> Retirer un `catch` large est donc une MESURE, pas seulement un correctif :
> il révèle tout ce que ce `catch` tenait debout.

**Et `MessageProcessor.test.ts` portait un témoin nommé « swallows
associateAttachmentsToMessage errors (handleAttachments catch) »**, posé —
son commentaire le dit — pour couvrir la ligne du `catch`.

> **Un témoin écrit pour couvrir une BRANCHE atteste ce que la branche fait,
> jamais ce qu'elle devrait faire.** Il ne peut pas tomber sur le défaut : il
> EST le défaut, transcrit en assertion et gelé par la couverture. Devant tout
> témoin dont l'intitulé commence par « swallows », « ignores » ou « tolerates »,
> poser la question du cycle 91 bis : *et c'est bien ?*

Il a quitté le fichier plutôt que d'y être corrigé : `MessageProcessor.test.ts`
est en dette de taille (1598 lignes gelées), et le cliquet refuse qu'il
GROSSISSE — « on extrait d'abord, on ajoute ensuite ».

## Preuve

**Le ROUGE, prouvé dans les deux sens** — c'est exactement l'étape que le
cycle 187 avait sautée, et qui l'a tué :

| mutation | témoins qui tombent |
|---|---|
| production revertie (`git checkout` de `MessageProcessor.ts`) | **5 / 10** — 4 sur la liaison, 1 sur l'audio emporté |
| libération retirée de `discardMessageAfterLinkFailure` | **3** (1 unité + 2 intégration) |

Les témoins de la branche COPIE, eux, PASSENT avant comme après : ils ne
décrivent aucun changement, ils gardent une jumelle qui n'avait **aucun
témoin** et dont la règle ne vivait qu'en commentaire. Ils sont dits tels
quels.

**Le VERT** : `tsc --noEmit` EXIT=0 ; 16 témoins neufs verts ; les 106 suites
de `messaging` vertes.

Suite complète du gateway dans ce conteneur : 2935 suites vertes sur 2944.
Les neuf rouges sont **environnementales et disjointes du lot** — six suites
d'image (AVIF absent du `sharp` du conteneur, rotation JPEG sans perte), le
cliquet `tsc-never-loaded-tests-ratchet` dont la commande rend 0 erreur ici
(donc sa garde anti-mesure-vide tombe), et une suite tuée par SIGKILL sous
pression mémoire qui PASSE en isolation. Aucune ne cite `MessageProcessor`,
`MessagingService` ni le module neuf (mesuré). La CI fait foi.

## L'audit adversarial a rendu BLOQUANT, et il avait raison deux fois

Les deux constats décisifs ont été vérifiés dans le code avant d'être repris.

### 1. La libération était une COURSE, pas une garantie

`associateAttachmentsToMessage` écrit une pièce par requête sous
`Promise.all` — **qui rejette à la première erreur en laissant les autres EN
VOL.** L'appelant repartait donc nettoyer pendant qu'elles volaient. La
libération remet `messageId` à `null`, ce qui satisfait de nouveau le `where`
d'une retardataire (`unsetOrNull`) : elle re-liait sa pièce au message qu'on
était en train de supprimer. `MessageAttachment.message` étant
`onDelete: Cascade` — émulé côté client sur MongoDB —, la pièce était
**détruite** si l'écriture atterrissait avant la suppression, et **inéligible au
rejeu à jamais** si elle atterrissait après.

Soit, mot pour mot, l'état que le module promettait d'éliminer.

> **Un correctif qui s'appuie sur la FORME d'un collaborateur hérite de sa
> sémantique d'erreur.** J'avais lu la bonne chose — « une pièce par requête »,
> c'est ce qui JUSTIFIE la libération — et pas la ligne au-dessus, qui dit
> comment cette boucle abandonne. `Promise.all` ne tient pas les promesses
> qu'il n'attend plus : **la propriété qui fonde un nettoyage n'est pas « quelles
> écritures ont eu lieu » mais « lesquelles ont FINI quand je reprends la
> main ».**

### 2. L'abandon oubliait les enveloppes, DÉJÀ parties sur le fil

Sur le chemin hybride + `deviceLayerRelay` — admis AVEC des pièces jointes,
`assertNoPlaintextPieces` ne gardant que l'e2ee PUR —,
`createMessageWithEnvelopes` écrit la ligne ET ses `MessageEnvelope` dans une
transaction, **puis les DIFFUSE**, le tout à l'étape 3, avant la liaison.
`MessageEnvelope` ne déclare qu'un `messageId` nu, sans `@relation` : aucune
cascade ne l'emporte.

« L'envoi échoue » était donc **faux sur le fil**. Le chiffré était déjà chez le
destinataire, servi par `GET /e2ee/envelopes` jusqu'à l'accusé ou la rétention,
et le rejeu en produisait un second jeu pour le même clair.

> C'est la question du cycle 125 — *« la charge que ce site remet contient-elle
> autre chose que ce que je viens de garder ? »* — posée à un ABANDON plutôt
> qu'à une protection : **que reste-t-il de FAIT que ce nettoyage ne défait
> pas ?** Et la réponse ne se trouve pas en lisant la fonction qu'on corrige :
> elle se trouve en lisant ce que les ÉTAPES PRÉCÉDENTES ont écrit et émis.

La liste des dix tables qui pendent à un message a quitté le purgeur de
conversation obsolète pour `messageScopedRows.ts`, que les DEUX sites
consomment. Neuf ne peuvent pas encore porter de ligne à ce point du
`saveMessage` : **c'est l'ÉNUMÉRATION qui tient dans le temps, pas le fait
qu'elle soit vide aujourd'hui.**

### 3. Et la réponse d'un agent se serait tue

La loi « l'échec fait échouer l'envoi » suppose un appelant qui **REJOUE**. Des
trois producteurs d'`attachmentIds`, `agent-response-bridge` est le seul sans
outbox, sans `clientMessageId` et sans file : il journalise et abandonne. Une
illustration qui ne se lie pas ne coûtait que l'illustration ; elle aurait coûté
la RÉPONSE ENTIÈRE de l'agent, texte compris, que personne n'aurait redemandée.

> **Une loi d'échec se vérifie contre TOUS ses appelants, pas contre le
> nominal.** Deux rejouent, un non — et c'est celui-là qui décide si la loi est
> une amélioration ou une régression.

Il rejoue désormais une fois sans l'illustration : l'agent parle, dégradé.

### Ce que l'audit a trouvé de ma méthode, et qui fait le plus mal

Le témoin `« ne masque pas l'erreur d'origine quand la suppression échoue »`
**ne pouvait pas tomber** : la fonction ne REÇOIT pas l'erreur d'origine.
L'intitulé nommait une propriété que rien dans le corps n'observait.

> C'est la faute du cycle 187, commise à vingt lignes de l'endroit où ce journal
> la raconte. **Une règle de méthode ne se transporte pas d'un paragraphe au
> suivant ; elle se réapplique, témoin par témoin.** Le rempart qui a fonctionné
> n'est pas ma vigilance : c'est d'avoir fait relire le lot par quelqu'un qui
> cherchait à le casser.

Renommé en ce qu'il atteste vraiment ; la propriété nommée est tenue, elle, par
le témoin d'intégration qui observe le `throw` d'après le nettoyage.

### Les témoins qui prouvent la correction

`attachmentLinkRelease.race.test.ts` fait tourner le **VRAI** linker contre la
**VRAIE** `discardMessageAfterLinkFailure`, avec un double qui modélise les deux
comportements dont le témoin dépend : `updateMany` n'écrit que si son `where`
matche ENCORE, et `message.delete` émule la cascade.

> C'est le seul endroit où la justification de la libération est vérifiable —
> elle n'existe QUE parce que le linker écrit une pièce par requête, et **ce
> fait-là disparaît dès qu'on double le linker.** Les dix témoins du premier lot
> mockaient `AttachmentService` : aucun ne pouvait voir la course.

ROUGE prouvé pour chacun : `Promise.all` restauré ⇒ 2/3 tombent ; effacement des
lignes pendantes retiré ⇒ le 3e tombe ; repli de l'agent neutralisé ⇒ son témoin
tombe.

## Ce que le cycle laisse

- **#19917** — le symptôme d'origine : ce lot lui retire sa cause (un rejeu ne
  perd plus ses pièces, parce qu'il n'y a plus de première tentative à moitié
  écrite à rejouer) ;
- **#19957** — le dédoublonnage rend un message supprimé avec `success: true`
  (décision produit), inchangé ;
- **#19960** — le `clientMessageId` d'autrui servi par la liste REST,
  préexistant ;
- **#19971** — une pièce rendue garde la protection du message qui n'existe
  plus (fail-closed, donc une issue et non un blocage) ;
- **#19972** — l'échec sort en `400` muet là où la famille `retryableWrite`
  sert `503` + `Retry-After` + `MESSAGE_SEND_RETRYABLE` ;
- **#19973** — deux doubles Prisma avalent encore des `TypeError` de production
  que plus aucun `catch` ne justifie : le lot n'a complété que la surface qu'il
  venait de rendre bruyante, ce qui est la faute que sa propre leçon décrit.
