## Leçon 482 (amendement à la 479) — j'avais écrit la leçon trop PETITE, exactement comme la garde

La 479 dit : « une garde qui contrôle UNE des DEUX déclarations jumelles ne garde
pas la paire ». Elle est juste, et elle était **sous-dimensionnée** — comme la
garde qu'elle décrivait.

Il n'y avait pas deux déclarations de cette famille. Il y en avait **cinq** :

| déclaration | couche |
|---|---|
| `ACTIVE_KINDS` | contrat du fil (TS) |
| `ObjectKind` | miroir Swift du fil |
| `TimelineClipKind` | projet timeline |
| `ClipSnapshot.Kind` | inspecteur |
| `MeeshySceneObject` — l'union **et** son `Kind` | objet de scène (deux formes) |
| `StoryCanvasUIView.CanvasItemKind` | canvas UIKit |

Trois lots pour une seule règle, chacun clos en croyant avoir fini. Le deuxième
a été fermé **en citant ma propre garde comme preuve**, alors qu'elle ne
regardait que la paire que j'avais en tête au moment de l'écrire.

> **Une garde par PAIRE ne garde pas une famille.** Elle rend un verdict vrai sur
> ce qu'elle regarde et MUET sur tout le reste — et le silence se lit comme un
> verdict sur l'ensemble. C'est ce qui rend une garde neuve plus dangereuse
> qu'une garde absente : elle inspire une confiance qu'elle n'a pas gagnée.

**La forme qui tient : BALAYER par la FORME, jamais énumérer par le NOM.** Le
témoin final ne connaît le nom d'aucun type. Il lit toutes les sources et
déclare fautive toute ligne dont le jeu de cas est celui des familles. Une
sixième déclaration naîtrait sous sa surveillance sans qu'on ait à l'inscrire —
c'est la différence entre une garde qui liste et une garde qui reconnaît.

Deux garde-fous obligatoires autour d'un balayage, et ils ne sont pas
décoratifs :
1. **il doit voir quelque chose** — assert sur le nombre de fichiers ouverts. Un
   balayage au chemin faux est vert pour toujours ;
2. **il doit reconnaître un contre-exemple POSITIF** — la forme exacte que le lot
   vient de corriger. Sans lui, un motif qui ne matche plus rien passe pour une
   règle respectée ([[reference_negative_source_guards_die_silently]]).

**Et le point que je n'avais pas vu, dû à la session 71** : six des douze sites
du dernier tiers étaient dans des fichiers de TÉMOINS. La garde du renommage ne
pouvait donc pas rougir — *elle ne compilait pas elle-même*.

> **Un témoin cassé ne dit rien, et il ne dit même pas qu'il est cassé.** On lit
> « build rouge » là où il faudrait lire « aucune garde n'a pu s'exprimer ». À
> ajouter au catalogue de la 468 : c'est une cinquième façon de lire un rouge de
> travers, et la plus silencieuse — les quatre autres laissent au moins la suite
> s'exécuter.

Corollaire de méthode, confirmé trois fois dans le même lot : pour compter les
consommateurs d'un membre renommé, **le `grep` se trompe dans les DEUX sens** —
trop peu quand le motif exige une qualification (`case .x:` n'en a pas), trop
quand le mot appartient aussi à d'autres types. Mon premier relevé montrait 114
sites ; il y en avait 3. Les deux erreurs rendent un nombre *plausible*. Seul le
compilateur connaît le TYPE.
