## Leçon 273 — deux gardes JUSTES peuvent garder une opération que la couche du dessus a déjà rendue sans objet (2026-08-24, cycle 124)

Le cycle 123 venait de fermer le FIL d'un message protégé : sa traduction ne part
plus sur le canal push, et le lot a raison sur tout ce qu'il énonce. Le CORPS,
lui, était perdu **une couche plus haut que toute déclaration de base** :

```ts
const notificationPreviewForPush = firstAttachmentTranscript ?? notificationPreview;
```

`notificationPreview` est le placeholder que `protectedPreview` vient de
composer. La transcription gagnait INCONDITIONNELLEMENT. Un vocal éphémère / à
vue unique / flouté / chiffré poussait donc **son texte transcrit entier** sur
l'écran verrouillé — exactement ce que la protection masque, et le seul écran où
elle a une raison d'être.

Le dépôt portait alors DEUX gardes contre ce relâchement, posées à deux cycles
différents, toutes deux justes et toutes deux testées :
`previewBasis: 'protected-placeholder'` (cycle 123, qui vide la source) et
`notificationLocKey` (le second verrou). Elles gouvernaient la SUBSTITUTION
d'une traduction dans l'aperçu. Or l'aperçu lui-même n'était plus le
placeholder : le texte à protéger avait déjà pris sa place.

> **Un champ de service qui DÉCLARE une restriction ne la fait pas respecter.**
> La question à poser à toute garde n'est pas « est-elle posée ? » mais **« le
> texte qu'elle gouverne est-il bien celui qui part ? »**.

C'est la forme du cycle 123 (« le Prisme était ANNONCÉ sans être APPLIQUÉ »)
avec l'inversion qui la rend pire : là, l'hôte rendait MOINS que ce que le
résolveur annonçait — un texte non traduit, un désagrément. Ici l'hôte rend
**PLUS** que ce que le résolveur autorise, et ce plus est précisément ce qu'une
protection existe pour cacher. **Chercher les deux sens** : un écart entre ce
qu'un résolveur conclut et ce qu'un hôte rend n'est pas toujours une perte, et
c'est quand c'est un gain qu'il faut s'inquiéter.

Corollaire de forme, et il n'est pas décoratif : `pushPreviewBasis` élisait
`transcript` AVANT de regarder la protection. Sans transcription à ce moment-là,
la base retombe sur `protected-placeholder`, et la carte de l'attachment cesse
d'être OFFERTE à la descente. **Une garde qui n'a qu'un verrou n'a pas de
garde ; elle a un pari sur ce verrou.**

### Le défaut ne s'est pas laissé chercher — il s'est laissé OUVRIR

Trois cycles consécutifs (122, 123, 124) ont trouvé leur défaut principal dans
cette méthode, chacun à un étage différent : le rang élu, ce qui l'affiche, ce
qui voyage à côté, ce qui arrive en entrée. Aucun n'a été trouvé par une
recherche ; les trois l'ont été en **ouvrant le site qu'un suivi précédent
désignait pour une autre raison**.

> Un suivi hérité ne vaut pas seulement par ce qu'il affirme. Il vaut par
> l'ADRESSE qu'il donne. Aller lire l'adresse est plus rentable que d'instruire
> l'affirmation — c'est la variante productive de « une piste peut être fausse
> sur son MOTIF et juste sur son ADRESSE » (cycle 107).

### Un défaut « distinct » peut être plus grand que ce que le suivi en disait

Le second suivi du cycle 122 nommait un corps VIDE : `prePersistMessage` (NSE
iOS) lit `userInfo["content"]`, que le payload push ne porte pas. Exact. En le
ré-instruisant, la ligne SUIVANTE du même constructeur portait la même absence :

```swift
originalLanguage: (userInfo["originalLanguage"] as? String) ?? "en"
```

Ni l'une ni l'autre clé n'existait sur le fil. La bulle pré-enregistrée au
démarrage à froid était donc vide **et** étiquetée « en » pour tout le monde — et
c'est la seconde moitié qui fausse la résolution du Prisme sur cette bulle,
celle que le suivi ne nommait pas.

> **Un suivi hérité se re-mesure avant d'être traité** (leçon 107), et pas
> seulement pour savoir s'il est encore vrai : pour savoir s'il est COMPLET. Un
> cycle qui note un défaut en passant note ce qu'il a VU, pas ce qu'il y avait.

Corollaire de contenu, tranché dans le même lot : ce qui voyage sous `content`
est l'**ORIGINAL**, jamais la traduction servie dans la bannière.
`MessageRecord.content` est le champ d'origine et `originalLanguage` son
étiquette ; y poser le texte traduit ferait mentir le couple, et la traduction a
déjà son champ et son rang. **Deux champs qui s'étiquettent l'un l'autre se
remplissent ensemble ou pas du tout.**

Et `PreviewPrismBasis` (cycle 123) a répondu à ce lot **sans être modifié** : le
type somme qui dit « qu'est-ce qui traduit cet aperçu ? » dit aussi, sans
ambiguïté, « cet aperçu EST-il le contenu du message ? ». Seul `message-content`
l'est. **Un type somme bien nommé répond aux questions qu'on ne lui a pas
posées ; un booléen n'en répond qu'une, et mal.**

### Ce que la convergence a coûté, et ce qu'elle a prouvé

Ce lot et le cycle 123 ont été menés en parallèle le même jour, et ont trouvé la
MÊME absence (la bannière d'un vocal ne descendait aucun Prisme) avec deux
conceptions différentes : un second paramètre `previewPrismSource` ici, un type
somme `PreviewPrismBasis` là. Le second est meilleur — il rend les trois formes
mutuellement exclusives par construction, là où un booléen et une source séparés
peuvent se contredire — et il était mergé le premier.

**La résolution n'est pas un compromis : c'est PRENDRE la meilleure en entier**
et rejouer par-dessus ce que l'autre avait d'unique. Ici les deux défauts que le
cycle 123 n'avait pas vus : la fuite du corps, et les deux clés du fil.
Panacher les deux conceptions aurait produit exactement la divergence que la
leçon 264 dénonce, dans le fichier qui la cite.
