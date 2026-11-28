## Une fixture qui ne traverse pas la composition de PRODUCTION atteste une loi appliquée à une forme que personne n'émet (2026-11-28, #20711)

`withoutSeparatedCompanions` retire d'un post servi les contenus d'autres auteurs
qu'un blocage sépare du lecteur — et elle retire aussi, inconditionnellement,
`repostOf.snapshotAuthorId` : la colonne de DÉCISION, « qui sert la décision,
jamais le fil ».

Le lot #20711 a fait descendre cette loi aux DIFFUSIONS, et a posé
`companionSubjectsOf` pour en relever les sujets — `repostOf.author.id`,
`repostOf.snapshotAuthorId`, `comments[].author.id`. Ses témoins construisaient
leur post **à la main** et le passaient au handler : les trois sujets y étaient,
les trois étaient relevés, tout était vert.

Les cinq producteurs réels, eux, composent leur charge par
`withMentions(ligne, WIRE_BROADCAST)` **dans la route**, très en amont de leur
audience. Cette composition retirait donc la colonne **avant** que le résolveur
la cherche. La moitié « copie d'un contenu éphémère » de la loi était **morte sur
tous les chemins de production**, et le vecteur n'avait rien d'exotique : B publie
un éphémère, E le republie (`snapshotAuthorId = B`), C republie le post de E,
A a bloqué B — l'auteur de la source n'étant pas bloqué, le contenu copié de B
atteignait A.

**Mesuré : muter la ligne qui porte cette moitié de la loi laissait 881 témoins
VERTS.** Elle n'était gardée par rien, ce qui est cohérent avec le fait qu'elle
était inatteignable : un témoin ne peut pas garder du code mort.

> **Un témoin à fixture manuelle atteste la loi sur la forme qu'on a IMAGINÉE ;
> le producteur en émet une autre.** La question à poser à toute fixture de
> diffusion n'est donc pas « porte-t-elle les bons champs ? » mais **« par où le
> producteur réel la fait-il passer avant d'émettre ? »** — et le témoin la fait
> passer par là. C'est la règle « un témoin de contrat de fil part de la charge
> utile RÉELLE de l'émetteur » (cycle 92 bis) étendue d'un cran : non seulement
> les CHAMPS de l'émetteur, mais sa CHAÎNE DE COMPOSITION.

Deux corollaires, tous deux mesurés dans le même lot :

- **Un correctif qui déplace le MOMENT d'une protection déplace aussi la question
  « qui d'autre passe par là ? ».** La réparation garde la colonne pendant la
  composition d'une diffusion (sa charge n'est pas encore SERVIE) et la retire
  dans `emitPostToAudience`, sur chacune de ses charges. Cet arrangement crée un
  invariant NEUF — une charge de diffusion ne rejoint un client que par ce seam —
  qui n'existait pas avant et que rien ne gardait, parce que la question ne se
  posait pas. Elle ne se pose qu'une fois le déplacement fait, et personne ne la
  pose à ce moment-là. D'où un cliquet d'inventaire sur les porteurs de
  `WIRE_BROADCAST`.
- **Un témoin existant peut tomber et avoir RAISON de tomber.**
  `separatedCompanions.test.ts` assertait « la colonne ne part jamais sur le fil,
  séparation ou non », en comptant la composition d'une diffusion parmi les
  charges servies — elle ne l'est pas. Le témoin a changé de PORTÉE, pas de
  garantie : ce qui se garde là est ce qui reste vrai là, et la garantie « jamais
  sur le fil » est tenue à son vrai endroit, par son propre témoin. Devant un
  témoin qu'un correctif fait rougir, la question n'est pas « comment le faire
  passer ? » mais **« ce qu'il affirme est-il encore vrai à l'endroit où il
  l'affirme ? »**.

Détail : `services/gateway/decisions/2026-11-28-une-diffusion-de-publication-resout-ses-compagnons-par-lecteur-20711.md`,
`tasks/realtime-sync-audit-2026-11-28-20711.md` § « Le second tour ».
