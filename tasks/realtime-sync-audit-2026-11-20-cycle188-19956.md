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

## Ce que le cycle laisse

- **#19917** — le symptôme d'origine : ce lot lui retire sa cause (un rejeu ne
  perd plus ses pièces, parce qu'il n'y a plus de première tentative à moitié
  écrite à rejouer) ;
- **#19957** — le dédoublonnage rend un message supprimé avec `success: true`
  (décision produit), inchangé ;
- **#19960** — le `clientMessageId` d'autrui servi par la liste REST,
  préexistant.
