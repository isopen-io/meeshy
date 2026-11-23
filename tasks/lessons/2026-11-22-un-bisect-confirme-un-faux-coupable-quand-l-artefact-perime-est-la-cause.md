## Un bisect CONFIRME un faux coupable quand la vraie cause est un artefact périmé (2026-11-22, cycle 218)

*Mesuré le 2026-11-22 (cycle 218), sur `apps/web` au-dessus d'un `packages/shared/dist` construit en début de session, pendant que `dev` avançait de dix-sept commits.*

### Le fait

Trois gates rouges, mesurés sur un `dev` PROPRE (mes changements remisés) :

| gate | ce qu'il disait |
|---|---|
| `bun test` | 43 rouges, 40 erreurs |
| `tsc --noEmit` | 8 erreurs, toutes dans `game-guide-copy-v2` / `events-v2` |
| `bun run build` | échec au préchauffage institutionnel |

J'ai attribué correctement (« ce n'est pas mon lot, ça rougit aussi sans
moi »), puis j'ai bisecté sur les six commits de `dev`. Le bisect a été
PROPRE : `8a41c9d9f` vert, `2265f1088` rouge, et en remettant les seuls
fichiers de #20327 à leur version d'avant, **le build repassait au vert**.
Conclusion apparemment prouvée : #20327 a cassé `dev`.

**Elle était fausse.** `packages/shared` avait changé sur `dev` ; mon `dist`
datait du début de session. Reconstruire `shared` a fait passer `tsc` de 8
erreurs à 0, le build au vert, et la suite de « 43 rouges » à **un seul** —
une garde méta qui lance un `bun test` imbriqué, sensible à
l'environnement.

### Pourquoi le bisect a MENTI, et c'est le cœur

Le dépôt documente déjà le piège (`CLAUDE.md` racine, « UN ARTEFACT PÉRIMÉ
REND UN ROUGE QUI RESSEMBLE À UN DÉFAUT DU DÉPÔT »), et son remède : un rouge
local que la CI ne reproduit pas est un rouge d'ARBRE jusqu'à preuve du
contraire. Ce que la note ne dit pas, et que ce cycle ajoute :

> **Un bisect ne distingue pas « ce commit est fautif » de « ce commit est le
> premier à EXIGER l'artefact que je n'ai pas reconstruit ».** Les deux rendent
> exactement la même courbe : vert avant, rouge après, et vert de nouveau quand
> on retire le commit. Retirer le code neuf retire la DEMANDE du type neuf —
> donc le symptôme disparaît, et l'innocent signe des aveux.

Le bisect est d'ordinaire l'outil qui TRANCHE une attribution. Ici il l'a
CONFIRMÉE à tort, avec toute l'apparence d'une preuve : trois builds, une
reversion ciblée, un verdict reproductible.

### Ce qui aurait dû alerter PLUS TÔT

Trois signaux, tous présents, tous lus de travers :

1. **Le premier build de la session avait été VERT**, au même endroit, deux
   heures plus tôt. Un gate qui passe puis échoue sans que son propre code
   change accuse l'ENVIRONNEMENT avant le dépôt.
2. **Les erreurs de type nommaient un symbole NEUF** (`offering-kept`) comme
   « absent d'un type » — la signature exacte d'un `dist` qui ne l'a pas encore.
   La note du dépôt donne mot pour mot ce symptôme.
3. **La CI de `dev` ne contredisait rien**, parce qu'elle ne conclut jamais :
   chaque run y est annulé par le groupe de concurrence avant la fin. L'absence
   de contradiction a été lue comme une confirmation — alors qu'elle n'était
   qu'un silence.

### La règle

**Avant de bisecter un rouge local, reconstruire les artefacts dérivés** —
ici `packages/shared` et le client Prisma, les trois commandes que le
`CLAUDE.md` racine énumère. Un bisect part d'un arbre PRÉPARÉ, sinon il mesure
la fraîcheur de mon `dist` et non l'histoire du dépôt.

Et le corollaire de méthode, plus général : **un bisect attribue une
CORRÉLATION à un commit ; il ne dit pas de quelle nature est le lien.** Quand
le lot incriminé introduit une dépendance vers autre chose que lui-même — un
paquet frère, un schéma, un artefact généré —, la question à poser avant de
conclure est : *ce commit est-il fautif, ou seulement le premier à avoir
besoin de ce que je n'ai pas reconstruit ?*

### Ce que ça a failli coûter

Un rapport de régression contre la PR de quelqu'un d'autre, fondé sur un
bisect « prouvé », et le temps de son auteur à chercher un défaut qui n'existe
pas. Rien n'a été publié : la vérification est venue de l'étonnement qu'un même
build soit passé puis tombé dans la même session.
