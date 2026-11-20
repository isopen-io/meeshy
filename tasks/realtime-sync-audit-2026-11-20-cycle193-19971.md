# Cycle 193 — la protection d'une pièce ne survit plus au message qui n'existe plus

*2026-11-20, à la suite du cycle 190 (#20019, PR #20038, fusionnée dans `dev`).
Numéroté 193 : 191 et 192 sont pris par d'autres sessions du même jour (#20020 et
#20050). Branche `claude/exciting-planck-z11wka`. Livre **#19971**, ouverte par
l'audit adversarial de #19956 (constat C4).*

---

## Pourquoi celui-là

Trois candidats au relevé, et deux cédés par la règle d'asymétrie (#5243) :
**#19979** (le plan signé de `broadcastMessageMutation`) est sur les chemins de
la branche vivante `claude/exciting-planck-g3p7gg-19977` ; **#20020** (les cinq
lecteurs des mêmes lignes, que j'avais ouverte) a été prise par le cycle 191.
**#19971** n'avait aucune branche, et c'est un défaut de PROTECTION, pas une
dette de forme.

## Le constat

`associateAttachmentsToMessage` n'écrit pas que `messageId` : elle pose aussi
`isViewOnce`, `isBlurred`, `rank`, et compose `effectFlags` **par OU** — « il
n'AJOUTE que de la protection », dit son doc-comment. La libération d'un échec de
liaison (`discardMessageAfterLinkFailure`) ne remettait que `messageId: null`.

Le scénario qui coûte, tel que l'issue l'écrit : Alice envoie une photo en **vue
unique**, la liaison lève au milieu du lot, la pièce est rendue avec
`isViewOnce: true` persistant. Elle recompose **sans** vue unique depuis la même
pièce téléversée ; l'association n'efface rien ; **le destinataire reçoit une
photo à vue unique sous une bulle ordinaire.** La protection de la PIÈCE
contredit celle du MESSAGE — ce que #7498 avait fermé dans l'autre sens.

## La question que l'issue croyait indécidable

> « L'état d'AVANT la liaison n'est connu de personne : la lecture qui le portait
> (`carriedFlags`) fait partie de l'opération qui vient d'échouer. »

C'est ce qui l'avait laissée ouverte, et c'est faux. La question ne se répond pas
en cherchant qui a LU l'état, mais en comptant qui l'ÉCRIT :

| site de création d'un `MessageAttachment` | pose la protection ? |
|---|---|
| `UploadProcessor.ts:437` | non |
| `UploadProcessor.ts:614` | non |
| `routes/uploads/tus-handler.ts:723` | non |
| `messaging/copyAttachments.ts:138` (copie transférée) | non |

L'association est le **SEUL** écrivain de production de ces trois colonnes, et
`schema.prisma` les déclare non nullables (`isViewOnce Boolean @default(false)`,
`isBlurred Boolean @default(false)`, `effectFlags Int @default(0)`). **L'état
d'avant liaison est le défaut du schéma** : la libération peut le rendre sans
jamais affaiblir quoi que ce soit, et le fail-closed survit — la prochaine
association repart de 0 et réapplique la protection du NOUVEAU message, ce que le
`|` doit faire.

## La forme du correctif

- La libération rend les trois colonnes avec le `messageId`.
- **La forme est dans le TYPE.** `AttachmentFailurePrisma` déclarait
  `data: { messageId: null }` : une libération partielle aurait compilé. Les
  trois colonnes y sont REQUISES — la seule garde qu'un double ne peut pas
  simuler, un mock acceptant ce qu'on lui donne.
- **La décision est écrite là où l'association COMPOSE ses flags**
  (`AttachmentService.ts`), comme le critère de fin l'exigeait, et pas seulement
  dans le module d'abandon : ce site est l'unique écrivain, donc l'unique endroit
  qui peut dire « tout chemin qui dé-lie une pièce doit rendre ces colonnes ».
- **Le paragraphe de doc qui énonçait la prémisse fausse** (« Ce que la
  libération ne rend PAS, et c'est assumé ») est réécrit avec la mesure : un
  commentaire qui déclare une chose indécidable coûte plus qu'un commentaire
  absent, puisqu'il décourage la mesure qui la déciderait.
- **`rank` n'est PAS rendu**, et un témoin le garde : la prochaine association le
  réécrit inconditionnellement pour tous les ids de son lot, donc il ne peut pas
  contredire. Le dire évite qu'un lot suivant l'ajoute « par symétrie ».

## Le ROUGE, mesuré

| mutation | témoin rouge |
|---|---|
| la libération ne rend que `messageId` (le code d'avant) | **2** (le témoin de #19971 et celui de la libération, dont l'attendu porte désormais les trois colonnes) |
| une colonne oubliée dans la libération | **`TS2353`** — le type refuse |

## Ce qui RESTE

- **`maxViewOnceCount` est déclaré dans le paramètre `protection` de
  l'association et n'est écrit NULLE PART** (il n'entre pas dans l'objet
  `added`). Ce lot n'y touche pas : il n'y a rien à rendre d'un champ que
  personne n'écrit, mais un paramètre déclaré sans écrivain est un contrat
  mort — à trancher à part.
- **#20045** — les cinq familles temps réel sans entrée de file, dont chacune
  doit répondre par écrit « une relecture sert-elle la vérité ? ».
- **#20020** — les cinq lecteurs des mêmes participants vivants (cycle 191).
