## La jumelle d'un retrait n'est pas un autre retrait : c'est la MISE À JOUR du même objet (cycle 190, #20019)

`attachment:deleted` (#13608) — le retrait d'UNE pièce d'un message — ne partait
qu'à `conversation:<id>` et n'avait **aucune entrée de file**. Son jumeau
`message:attachment-updated` — l'enrichissement de la MÊME pièce (transcription,
audio traduit) — nomme les rooms personnelles **et** enfile depuis toujours
(`emitAttachmentUpdated`). Les deux événements décrivent la même pièce, dans la
même conversation, et un seul des deux avait une audience complète.

> **Chercher « qui d'autre SUPPRIME ? » ne rend pas cette jumelle ; chercher
> « qui d'autre parle de cet OBJET ? » la rend tout de suite.** Le dépôt
> énumérait ses retraits par famille d'événement (cycles 188 à 190, les cinq
> familles d'ids du message) ; la jumelle utile était rangée sous un autre verbe,
> à un fichier de là.

Le prix de l'asymétrie, pour qui :

1. le lecteur a reçu la bulle dans sa room **PERSONNELLE** — la seule adresse de
   `message:new` dès que le message porte une pièce protégée
   (`messageNewEmission.emitPerReader`) ;
2. il revient à la liste, donc **quitte** `conversation:<id>` et garde la sienne ;
3. un membre retire la pièce : l'annonce ne part qu'à la room du fil ;
4. **rien** ne le rattrape — pas de file, et la file saute de toute façon les
   comptes connectés.

### Deux corollaires mesurés dans le même lot

- **Un `eventType` de file neuf ne coûte RIEN aux clients quand le drain rejoue
  le même nom d'événement.** `'attachment-deleted'` entre dans l'union partagée
  et dans `DRAINED_EVENT` ; le drain émet `attachment:deleted`, que les trois
  clients écoutent déjà pour le direct. Ce qui coûte, c'est la DÉDUP : la clé
  nomme la PIÈCE, parce que sous l'identité par défaut (`messageId` +
  `eventType`) le retrait d'une seconde pièce du même message supplanterait le
  premier — l'absent n'en apprendrait qu'un.

- **Un témoin de surface peut n'exercer que le chemin de REPLI, et passer.** Le
  harnais de `DELETE /attachments/:id` donnait à `prisma.participant` un
  `findFirst` et un `findUnique`, pas de `findMany` : la lecture d'audience y
  LÈVE, l'audience retombe sur la room de conversation, et le témoin était vert
  sans avoir jamais exercé l'élargissement. Son double d'`io` déclarait
  `to(room: string)`, donc il ACCEPTAIT le tableau et le rangeait sous
  `String(tableau)` — une clé qu'aucune assertion ne peut nommer (cycle 188).

  > Un double incomplet ne fait pas échouer le témoin : **il le fait réussir sur
  > le chemin de repli** — précisément ce qu'un lot d'audience ne doit pas
  > prouver.

### Et un ROUGE de `dev` trouvé en passant le gate (#20036)

`MessageHandler.ts` mesurait 2 281 lignes pour une dette déclarée à 2 269.
L'attribution spontanée — « un lot du jour a ajouté 14 lignes à un fichier déjà
hors budget » — est FAUSSE : `dev` était à 2 267 et la branche de #19939 à
2 266, **tous deux sous le plafond, tous deux verts en CI**. C'est la FUSION qui
donne 2 281 (mesure d'une autre session, PR #20032).

> **Un cliquet qui borne une valeur par FICHIER ne peut pas être vérifié avant la
> fusion**, et un `git merge` sans conflit textuel ne dit rien de lui. Devant un
> rouge de ce genre, ne pas chercher « qui a dépassé » — personne n'a dépassé —
> mais **quelles branches se sont additionnées**.

Réparé par une EXTRACTION, jamais en montant le plafond. Et l'extraction a payé
plus que des lignes : la fonction extraite **REND** la charge qu'elle a servie,
que la file réutilise. Le direct et la file sont deux projections d'une SEULE
composition (cycle 123) ; les recomposer séparément est ce qui laisse deux
`deletedAt` pour un seul retrait.
