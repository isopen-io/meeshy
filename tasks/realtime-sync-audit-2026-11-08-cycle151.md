# Cycle 151 — deux lots, un audit bloquant, et la moitié de ma propre jumelle

*2026-11-08. Branche `claude/exciting-planck-lnj0k7`, redémarrée depuis `dev`
après la fusion du cycle 150 (PR #17128, `b1cc6a28b`).*

| lot | issue | ce qui change de comportement |
|---|---|---|
| M | #17080 | une RÉPONSE / MENTION cesse de rester « 🔒 💬 » en E2EE — et aucune enveloppe ne part pour un message autrement protégé, ni vers un ex-membre |
| N | #17139 | un ORDRE ne classe plus un lecteur planchéisé sur l'avant-plancher, sur les DEUX surfaces qui le faisaient |

## Lot M — un champ qui ne compose aucune chaîne

### Le défaut

Seul l'éventail `regular` portait `deviceEnvelopeForPush`. `createReplyNotification`
et `createMentionNotification` ne déclaraient pas le paramètre, donc
`createNotification` lisait `params.context.encryptedContent || ''`. Côté NSE,
`applyBodyRewrites` ne réécrit le corps que si le champ est NON VIDE, et son
repli de placeholder localisé exige `isEncryptedPush` — qui accepte
`userInfo["isEncrypted"]`, **un champ que la charge push ne porte pas** (mesuré
sur ce que `createNotification` assemble). Avec `''`, aucune des deux branches ne
tire.

Les cycles 125 bis → 128 ont fait converger le TEXTE, l'HORLOGE, le VERROU et le
MÉDIA des trois éventails. `encryptedContent` ne compose aucune chaîne et ne la
qualifie pas : c'est la charge que le LECTEUR déchiffre. On ne la trouve pas en
demandant « qui compose ce corps ? ».

### Les témoins ont DEUX étages, et le second est le point

Trois prouvent que les lots REÇOIVENT l'enveloppe ; six qu'elle atteint
`payload.data`. Le dépôt a payé cette distinction au cycle 122, où une descente
de Prisme correcte alimentait deux champs qu'aucun client ne lisait.

## Lot N — un ORDRE révèle autant que le champ

#17076 a cessé de SERVIR `participantStats` à un lecteur planchéisé. Deux
surfaces continuaient de s'en servir pour ORDONNER une liste qu'elles lui
servent : le listing « top » des participants et les suggestions de mention. Le
lecteur a les deux moitiés de la soustraction et peut les demander lui-même.

La loi est UNE (`mayRankByConversationActivity`), et la dégradation est gratuite :
ne pas charger la carte d'activité fait retomber les deux surfaces sur l'ordre
qu'elles tiennent déjà en second.

## L'audit adversarial — verdict BLOQUANT sur le lot M

### M-1, et il était DÉJÀ là sur `regular` depuis #13114

**En E2EE, `protectedPreview` rend TOUJOURS un placeholder.** La question n'est
donc pas « y a-t-il une protection ? » — il y en a une — mais **laquelle a gagné
la préséance**, et elle est *éphémère > vue unique > flouté > chiffré*. Un
message E2EE **et** à vue unique porte `notification.view_once_message`.

L'enveloppe était calculée sans aucun prédicat de protection, et la NSE la
déchiffre en ÉCRASANT le corps **sans jamais lire `locKey`** : le texte intégral
d'un message à vue unique, flouté ou à flamme-œil s'affichait sur l'écran
verrouillé, **sans même consommer la vue unique**. Mon lot l'aurait étendu aux
deux audiences les plus exposées — la personne visée par la réponse, et les
mentionnés, dont la bannière perce la sourdine.

Ce qui rend l'oubli instructif : **j'ai cherché le verrou du cycle 125 et je l'ai
trouvé.** Il est posé, il est juste, et il garde le média. Il ne pouvait pas
garder l'enveloppe, parce qu'en E2EE sa présence ne distingue rien. Et
l'enveloppe vivait **littéralement entre les deux champs qu'il retient** —
`pushMediaFields` au-dessus, `contentDetailPushFields` en dessous. La leçon 275
dit de lire l'objet remis LIGNE À LIGNE ; je l'ai citée et j'ai lu le code qui le
compose.

La loi vit désormais avec `protectedPreview`, son unique producteur :
`protectionAllowsDecryptedBanner`, fail-closed sur une clé inconnue. Elle ferme
aussi la fuite préexistante de `regular`.

### M-2 — la charge était gardée, l'AUDIENCE ne l'était pas

L'auteur du message cité est résolu par un `participant.findUnique` **sans filtre
`isActive`** : quitter ou être banni laisse la ligne, donc un ex-membre recevait
la bannière. L'éventail MENTION borne la sienne à `memberIds` depuis toujours.

Nuisance avant le lot ; **fuite après**, la clé de session de la NSE étant par
EXPÉDITEUR et rien ne la tournant au départ d'un membre (constat remonté en
#17159, avec la demande de revue externe). Cycle 127 mot pour mot : « une garde
qui protège la population la plus NOMBREUSE peut manquer la plus EXPOSÉE. »

> **Donner une charge plus riche à un éventail oblige à relire SON audience, pas
> seulement sa charge.**

### N-1 — j'avais reprise la MOITIÉ de ma propre jumelle, dix heures après l'avoir écrite

`stats.ts` pose DEUX gardes, dans cet ordre, et son commentaire dit pourquoi la
première est indispensable : la PORTE du lien échu, puis le PLANCHER. Le lot N a
copié la seconde. Elle manque le lecteur dont le lien ÉCHU **accordait**
l'historique, donc dont le plancher est NUL : les quatre autres surfaces lui
rendent 403, ces deux listes lui servaient le classement de toute la vie.

C'est le corollaire que le `CLAUDE.md` énonce — « quand on reprend le correctif
d'une jumelle, on le prend EN ENTIER » — raté sur une jumelle que **j'avais
écrite moi-même le même jour**. Connaître la règle, l'avoir appliquée, et l'avoir
écrite ne suffit pas : la reprise se fait en relisant le site, pas en se
souvenant.

### N-2 — et ma phrase « une requête de MOINS » était fausse

Les deux sites lisaient DÉJÀ la ligne du lecteur, avec le même `where` et la même
précédence d'identité. La première version payait donc un DOUBLON pour tout
lecteur restreint, pas seulement pour le planchéisé. Les colonnes du plancher
s'ajoutent désormais à ces lectures existantes, et une seule lecture de lien
répond aux deux questions — le patron du fil. Règle du cycle 127, que l'audit a
sortie contre moi : « avant de conclure qu'une garde coûterait une requête,
regarder ce que le site lit déjà ».

### Le cliquet de typecheck des tests avait raison avant l'audit

`new MentionSuggestionFinder(prisma)` sur un constructeur qui exige deux
arguments : `this.cache` à `undefined`, les deux accès levant dans leurs
`catch`. Mes témoins passaient dans un régime de cache **en panne**, que la
production n'a pas, et le `jest.mock` de `CacheStore` posé en tête était mort.
78 erreurs non muettes contre un plafond de 76 — et pendant une demi-heure j'ai
cru à l'artefact de machine saturée que j'avais moi-même documenté au cycle 148.

> **Un cliquet qui a déjà rendu un faux positif une fois ne devient pas un
> cliquet qu'on croit moins.** La mesure qui tranche prend trente secondes :
> ouvrir sa sortie et lire QUELS fichiers il nomme.

Deux assertions décoratives sont tombées avec : le bavard rejoint maintenant EN
DERNIER (sinon activité et ancienneté classaient pareil, et l'assertion d'ordre
décrivait une coïncidence), et les témoins de mention assertent la liste RENDUE,
pas seulement l'appel au mock.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** |
| cliquet de typecheck des tests | **76 / 76** — revenu au plafond |
| rouge, lot M | les 2 témoins de FIL de la réponse et de la mention tombent ; celui du message simple reste VERT, ce qui est la forme exacte du défaut |
| rouge, M-1 | 3 témoins tombent (vue unique, flouté, éphémère minuté) sur les TROIS éventails |
| rouge, M-2 | l'ex-membre reçoit sa réponse ; les deux autres éventails partent, donc le refus est CIBLÉ |
| rouge, lot N | les 2 témoins qui MESURENT tombent |
| rouge, N-1 | la porte du lien échu tombe seule, sur les suggestions |
| zone d'impact | 172 suites / 3 812 témoins verts |
| **suite gateway COMPLÈTE**, arbre fusionné `9821635fb` | **2 591 suites / 40 378 témoins, 6 rouges** — les six codecs d'image déjà rouges sur `dev`, hors du diff |

Tous les témoins négatifs restent verts des deux côtés, et chacun dit pourquoi il
ne peut pas tomber.

## Ce que ce cycle laisse ouvert

- **#17158** — la coupe APNs (3 800 octets) retire l'enveloppe d'un message E2EE
  LONG : la bannière y retombe en « 🔒 💬 ». Ce n'est pas une fuite, c'est la
  portée du correctif, conditionnée à une taille que personne n'a mesurée.
- **#17159** — la clé de session E2EE est par EXPÉDITEUR et n'est pas tournée
  quand quelqu'un quitte un groupe. #17080 ferme le CANAL ; la propriété de
  protocole demande une décision produit et une revue externe.
- **#17139 reste OUVERTE** pour sa seconde moitié : le `joinedAt` des TIERS, dont
  `min(joinedAt)` borne « quand la conversation a commencé ». C'est un champ
  SERVI par un schéma partagé, donc une décision sur plusieurs surfaces.
- **#17140** — un `shareLinkId` dont la ligne de lien a disparu rend « aucun
  plancher », et la purge d'un compte en fabrique.
- **#17075** — étiquetée `décision-produit`, assignée au porteur.
