# Cycle 186 — le défaut était pire que son issue : il n'y avait pas de bouton du tout

*2026-11-19, à la suite du cycle 184 (#19802, fusionné dans `dev` par `b9525b350`).
Branche `claude/exciting-planck-dr9e11`. Instruit **#19865**, relevé par l'audit
adversarial de #19801 (constat A1).*

---

## Pourquoi celui-là

Le critère des trois cycles précédents — un défaut **mesuré** qui **supprime
une feature** et **s'auto-entretient** — et trois propriétés de plus :

- il est sur le chemin de la **remise de message** (phases 3 à 5 de la
  routine : file hors ligne, reprise, pièces jointes) ;
- la plateforme voisine prouve la bonne conception : iOS et Android persistent
  les OCTETS, jamais un identifiant serveur, et se réparent seuls ;
- aucune branche vivante n'écrit `apps/web/src/lib/send/` (relevé avant
  d'écrire).

Les deux candidats mieux placés du tri étaient **déjà pris** : #19881 par
`claude/exciting-planck-0vkcxe` et #19835/#19834 par
`claude/exciting-planck-wo4zwx` (cycle 185). La doctrine de la branche poussée
tôt a de nouveau tranché sans négociation — un `git diff --name-only
origin/dev...<branche>` sur les branches vivantes, avant la première ligne.

## Le défaut, mesuré — et l'issue le sous-estimait

L'issue décrit un « *« Réessayer » qui ne pourra plus JAMAIS réussir* ». Mesuré :

```ts
isPermanentFailure({ status: 404 })  // → true
```

`outcomeOf` classe tout 4xx hors 408/425/429 comme PERMANENT, et
`isPermanentFailure` gouverne — SEULE — l'existence du bouton « Réessayer » de
la bande d'envoi (`view/use-send.ts`, `components/failed-send-band.tsx`).
**Il n'y avait donc aucun « Réessayer ».** Et `flush` ne rejoue rien non plus :
`neverReachedServer` ne retient que le statut 0.

| ce que l'issue dit | ce qui est vrai |
|---|---|
| la reprise réutilise l'id et échoue | exact (`perform-send.ts:264`) |
| « Réessayer » ne peut plus aboutir | il n'est **pas offert** |
| le `File` est encore là | exact — `upload.files`, et `revived()` le relit |

L'entrée restait donc dans le fil, en échec, sans aucun chemin : ni automatique,
ni manuel, ni au prochain lancement.

## Ce que le lot livre — deux moitiés, et aucune ne vaut seule

1. **`forgetUploadedIds`** (`outbox-store.ts`) — le geste INVERSE de
   `markUploaded`, appelé par `attempt()` sur le refus NOMMÉ, **avant**
   `markFailed` : l'entrée que la bande rend, que la file réécrit sur
   l'appareil et que `isPermanentFailure` interroge est déjà réparée. Il efface
   le LOT ENTIER, jamais le seul id nommé : la passerelle refuse l'envoi en
   bloc, donc rien n'a été attaché et les pièces survivantes du lot n'ont plus
   de porteur.
2. **`isPermanentFailure` consulte le CODE** (`api/outcome.ts`) — et
   `outcomeOf` reste INCHANGÉ, parce que ses vingt appelants décident de
   rollbacks optimistes sur des 404 qui, eux, sont définitifs. La divergence
   est documentée au site : les deux ne posent pas la même question (« ce
   MÊME appel rejoué à l'identique » / « cette ENTRÉE a-t-elle encore un
   espoir »), et la seconde porte sur une entrée que le client vient de
   modifier.
3. **Une phrase à l'utilisateur, dans les sept langues** —
   `send.failure.attachmentExpired`. Le 4xx générique disait « envoi refusé »,
   soit le contraire de ce que le produit fait désormais. Son jumeau par la
   forme est le refus de DROIT (`ATTACHMENT_RIGHT_NOT_PERMITTED`), dont la
   phrase est OPPOSÉE et que ce lot n'a pas touché — re-téléverser n'y
   changerait rien, et un témoin de non-régression le garde.

Le code vit dans `api/attachment-refusal.ts`, un module à lui : trois sites le
lisent (la permanence, le chemin d'envoi, la phrase), et
`api/attachments.ts` dépend d'`api/conversations.ts`, qui ramènerait un cycle
d'imports. Il n'est **pas** partagé par `@meeshy/shared`, et la raison est
mesurée : la passerelle fige déjà la chaîne par un témoin
(`messages-send-attachment-admission.test.ts`, deux sites) — même discipline
que son voisin.

## Ce que le lot refuse de livrer

**Aucun rejeu AUTOMATIQUE.** Faire entrer ce refus dans `neverReachedServer`
ferait repartir l'entrée sans geste de l'utilisateur, et un second refus (une
pièce que le serveur refuse pour une autre raison) tournerait en boucle de
téléversements. La sortie est un CONTRÔLE, offert et nommé.

## Preuve

- **RED prouvé par mutation, moitié par moitié** : sans l'oubli des ids,
  4 des 5 témoins tombent ; sans la lecture du code dans
  `isPermanentFailure`, 2 tombent (dont celui de la phrase) ; sans la clé
  allemande, le témoin de langues tombe **et** `i18n-catalog.test.ts` aussi ;
- `perform-send-stale-attachment.test.ts` **5 verts** (dont un qui rejoue la
  revivification depuis IndexedDB par `createOutboxDurability`, et un sur le
  lot PARTIEL), `failure-reason.test.ts` **19 verts**, `outcome.test.ts` +
  `outbox-store.test.ts` + `outbox-durability.test.ts` compris : **62 verts**
  sur les cinq suites touchées ;
- `tsc --noEmit` sur `apps/web` : **EXIT=0** ; `bun run build` : **EXIT=0** ;
- **suite complète `apps/web` : 34 751 verts / 1 rouge**, et ce rouge
  PRÉEXISTE à ce lot — `src/test-support/act-leak-guard.test.ts`, vérifié en
  rejouant sur `dev` stashé (même échec, `3 attendus / 0 reçus` : ce témoin
  méta lance un `bun test` imbriqué, qui ne rend rien dans ce conteneur).

## Ce qui n'a pas été mesuré, et ne doit pas se lire comme vert

- **Le comportement sur un vrai navigateur après 24 h** : la fenêtre du
  balayage n'est pas rejouable en témoin, et personne n'a vu l'entrée se
  réparer sur un appareil.
- **L'arriéré** : combien d'entrées d'outbox portent aujourd'hui, chez de
  vrais lecteurs, un id balayé. Elles se répareront au premier
  « Réessayer » — mais le compte n'existe nulle part.
- **Les octets du premier téléversement** d'un lot partiel : la reprise
  re-téléverse tout, et les pièces du premier essai qui avaient survécu
  partent au balayage suivant (24 h). Non mesuré en volume.

## Les jumelles ont été ouvertes, et mesurées SAINES

`unsentComments` porte la même phrase dans son doc-comment — « le corps déjà
composé, ses `attachmentIds` compris — rien ne remonte une seconde fois » — sur
des `PostMedia` que `sweepPendingPostMedia` balaie **aussi à 24 h**. Elle n'est
pourtant pas atteinte, pour deux raisons de conception : elle est en MÉMOIRE
seule, et sur un refus définitif elle REND le texte et les pièces au brouillon.
`talkie-voice-copy.ts` téléverse et envoie d'un seul geste, sans rien
mémoriser. **Une jumelle se mesure : la différence était dans ce qu'elles font
APRÈS l'échec, pas dans ce qu'elles mémorisent.**

La leçon du cycle est versée dans
`tasks/lessons/2026-11-19-un-correctif-dont-la-sortie-est-un-bouton-qui-n-existe-pas-n-a-repare-personne.md`.
