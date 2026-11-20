# Cycle 191 — une borne qui vaut pour UN site d'une question posée par vingt-deux n'est pas une borne

*2026-11-20, à la suite directe du cycle 189 (#20007, fusionné dans `dev`).
Branche `claude/exciting-planck-cgf6zu`. Livre **#20020**, l'un des deux suivis
que le cycle 189 a laissés. Numéroté 191 : 190 est pris par la session qui livre
#20019, l'autre suivi — un identifiant qui ne s'alloue pas collisionne (#5102).*

---

## Pourquoi celui-là, et pas l'autre

La règle de la routine est de se baser sur le développement précédent. Le cycle
189 a laissé deux suivis, #20019 et #20020.

**#20019 était déjà écrit** : `claude/exciting-planck-z11wka`, active dix-huit
minutes avant mon relevé, portait trois commits sur
`routes/attachments/metadata.ts` et `socketio/announceCitedPostWithdrawal.ts` —
et s'était déjà numérotée cycle 190. Règle d'asymétrie (#5243) : la session qui
n'a rien écrit cède, sans négocier. Cédé.

**#20020 est partiellement contesté**, et le tranchage s'est fait par chemin,
pas par issue. Son point 1 (« partager la lecture ») vit dans
`broadcastMessageMutation.ts` et `handlers/MessageHandler.ts`, que deux branches
vivantes écrivaient. Ses points 2 et 3 (« borner les deux lectures nues »,
« un site unique ») vivent dans des fichiers libres. Ce lot livre 2 et 3 ;
le 1 reste à #20020, et `MessageHandler` est nommé dans #20051 avec la raison.

## Le fait

`loadLiveAudience` (#20007) borne la lecture des participants vivants, tronque
en le journalisant, et sépare l'affirmation (« personne ») de l'ignorance
(« je n'ai rien prouvé »). Elle est juste. **Et elle ne bornait rien**, parce
qu'elle ne valait que pour son module :

```ts
// conversationAudienceRooms.ts — borné à 50 001, tronque en le journalisant
take: cap + 1,

// offlineParticipantQueue.ts, même appel, quelques lignes plus bas — rien
where: { conversationId, ...PARTICIPATION_VIVANTE },
select: { id: true, userId: true },
```

> **Une borne qui vaut pour un site d'une question posée par vingt-deux n'est
> pas une borne, c'est une discipline locale.** Le coût qu'elle prétend éviter
> est payé de toute façon, par le site d'à côté — et le cycle 189 l'avait
> mesuré sans en tirer la conséquence : son journal cite cette seconde lecture
> comme l'argument qui rendait le plafond de 2 000 « sans objet », puis relève
> le plafond au lieu de retirer la seconde lecture.

## Ce que le lot livre

`scanLiveParticipants` est le seul endroit du dépôt où cette lecture s'écrit.
Le `where`, la borne, la sonde `cap + 1`, le journal de troncature et le verdict
de complétude y vivent une fois ; un appelant n'apporte que sa **projection** —
la seule chose qui varie légitimement entre consommateurs.

| site | avant | après |
|---|---|---|
| `loadLiveAudience` | la borne, écrite ici | une projection de `scanLiveParticipants` |
| `emitAttachmentUpdated.loadActiveParticipants` | double exact, sans borne ni verdict | supprimé ⇒ `loadLiveAudience` |
| `offlineParticipantQueue` (nominale) | nue | `scanLiveParticipants` |
| `offlineParticipantQueue` (Prisme) | nue | `scanLiveParticipants`, projection élargie |
| `afterReadEarlyBurnGate` | borne RÉÉCRITE, plafond 500 | `loadLiveAudience({ cap: 500 })` |

## Le plafond est une PORTÉE DE PREUVE, pas un réglage de coût

`afterReadEarlyBurnGate` plafonne à **500** là où l'audience plafonne à 50 000,
et l'écart n'est pas une préférence : son verdict est **universel** — « aucun
destinataire n'a coupé ses accusés ». Une lecture tronquée ne lui apprend
RIEN, quand une diffusion tronquée atteint encore ceux qu'elle a nommés. C'est
la raison d'être du paramètre `cap`, et `complete === false` dit exactement ce
que son `rows.length > cap` disait — plus la PANNE, que son `catch` traitait
déjà pareil.

## Le défaut que le lot a trouvé en chemin : une garde qui tenait par coïncidence

```ts
...(participants.length > 0 ? { participants: [...participants] } : {}),
```

Sans commentaire, et **portante**. Elle écartait bien la liste d'une lecture
TOMBÉE — `loadActiveParticipants` rendait `[]` sur panne, et `[]` remis à la
file vaut « aucun participant », donc n'enfile pour PERSONNE (règle du cycle
116). Mais elle n'écartait pas une liste **TRONQUÉE**, que la borne partagée
rend précisément possible : la file a une garantie DURABLE, et une liste
partielle y prive définitivement un absent de la pièce ENRICHIE.

Gardée par `complete`, qui est la seule des deux phrases à séparer
l'affirmation de l'ignorance. Et le gain n'est pas que défensif : sur une
audience complète et VIDE, la liste est désormais remise (`[]` y est une
affirmation juste), ce qui retire une lecture complète par mutation.

> **Une garde qui n'écrit pas ce qu'elle garde ne garde que le cas qu'elle a
> vu.** `length > 0` était vrai de ce que son auteur avait en tête (une panne),
> faux de ce que le lot d'après a introduit (une troncature). Même famille que
> « une étiquette de `catch` ne qualifie que ce que son auteur avait en tête »
> (cycle 116) : ce n'est pas la garde qui est fausse, c'est sa PORTÉE qui a
> grandi sans elle.

## L'issue nommait cinq sites ; le dépôt en portait vingt-deux

Mesuré par la commande, pas à l'œil (`live-audience-bound-sweep`) :

| | sites d'écriture de cette lecture |
|---|---|
| avant le lot, total | **22** |
| avant le lot, sans AUCUNE borne | **19** |
| retirés par le lot | 4 |
| après, sans borne, GELÉS | **16**, dans 15 fichiers |
| après, bornés hors du site unique (`call-invite-events`) | 1 |

C'est la leçon 261 dans sa forme exacte : une énumération de sites porte deux
affirmations, « ces sites appliquent la règle » (vérifiable) et « ce sont les
sites où la règle s'applique » (presque jamais vérifiée). La seconde l'est
désormais par un cliquet, et son inventaire gelé nomme, ligne par ligne, ce qui
retient chaque site — jamais une exemption de principe.

## Et le premier balayage mesurait un NOM, pas une propriété

Il cherchait `PARTICIPATION_VIVANTE` et rendait un inventaire **sans
`translationReaders`** — dont deux lectures de la même question portent
`ADMITTED_FILE_READER_WHERE`, qui **est** `PARTICIPATION_VIVANTE`
(`fileReaderAdmission.ts:61`, affectation directe).

> **Chercher une clause par son NOM, c'est manquer tous les sites qui l'écrivent
> autrement.** C'est la règle du cycle 105 — posée sur une porte d'émission, où
> un `as` obtenait la liberté d'une déclaration réécrite — portée à un `where`.
> Le discriminant énumère donc les deux noms, et dit qu'une troisième forme (la
> clause à la main, `isActive` + `bannedAt`) sortirait encore.

L'erreur a été commise en écrivant le cliquet, et c'est elle qui a trouvé le
site le plus sensible du reste — voir ci-dessous. **Une erreur commise en
écrivant un cliquet est le meilleur cas de test qu'il aura jamais** (cycle
109 bis), et ici elle a aussi été le meilleur relevé.

## Ce qui RESTE, et qui le dit

- **#20050 — la loi du plancher d'historique compose un COMPLÉMENT.**
  `translationReaders` dérive `excludedQueueKeys` — les lecteurs qui ne doivent
  RIEN recevoir — d'une lecture nue. Une troncature y SOUS-exclut, donc y
  **FUIT** : un lecteur sous plancher reçoit en file la traduction d'un message
  que quatre portes lui refusent. C'est la forme de #20007 avec l'inversion qui
  la rend plus grave — une troncature n'y appauvrit pas une diffusion, elle
  ouvre une porte. **Borner ce site sans le rendre fail-closed serait pire que
  de le laisser nu**, d'où le gel plutôt que le correctif, et l'audit
  adversarial demandé.
- **#20051 — les treize autres**, dont DEUX servent la liste comme EFFECTIF
  (`memberCount: remaining.length`) : un effectif tronqué est un nombre FAUX
  servi aux clients, pas une audience partielle. Décision produit, pas réglage.
- **#20020 reste ouverte sur son point 1** — partager la lecture entre
  l'audience et la file sur les mutations d'id (`MessageMutationQueueParams` ne
  porte pas `participants`). Chemins tenus par deux branches vivantes au relevé.
- **Non mesuré, et toujours pas** : existe-t-il en production une conversation
  de plus de 2 000 participants vivants ? Le lot ne répond pas davantage que le
  189 ; il rend seulement la question moins chère à se poser, puisqu'une seule
  lecture la décide maintenant.
