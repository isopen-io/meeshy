## Leçon 158 — « La CI ne l'a pas vu » a plusieurs causes possibles, et elles n'ont pas le même remède (2026-08-14, routine messaging, cycle 122)

`main` ne compilait plus pour iOS : la PR #2982 avait retiré `enum MessageDayStickyPlacement`
en laissant trois usages dans `MessageListViewController`. Le gate iOS de MA PR l'a levé.

La première explication trouvée était vraie **et fausse en même temps** : `ios-tests.yml` n'a
effectivement pas tourné sur `main` depuis le 2026-08-02 (sa portée de déclenchement l'y limite),
donc j'ai conclu « le gate ne s'exerce qu'en PR, la rupture est passée sans rougir ». Fait exact,
cause fausse — et je l'ai envoyée en notification, c'est-à-dire vers le mauvais correctif
(élargir un trigger).

Ce que disent les horodatages, qu'il aurait fallu lire AVANT de conclure :

| Événement | Heure |
|---|---|
| PR #2982 ouverte | 04:25:32 |
| `iOS compile (PR gate)` démarré | 04:25:38 |
| **PR mergée** | **04:25:45** |
| gate annulé | 04:30:09 |

**La PR a été mergée 13 secondes après son ouverture.** Le gate n'a pas manqué la rupture : il
n'a jamais eu le droit de finir. Six autres jobs portent le même `cancelled` à la même minute —
c'est la signature d'une fusion pendant que la CI tourne, pas d'un trou de couverture. Le remède
n'est donc pas un trigger, c'est une **required check** / protection de branche.

**La règle** : devant « la CI n'a pas attrapé X », ne pas s'arrêter à la première explication
cohérente. Distinguer trois causes qui produisent le même silence et appellent trois remèdes
opposés :

1. **Le job n'a pas tourné** (portée de déclenchement) ⇒ élargir le trigger.
2. **Le job a tourné et a été annulé** (fusion en cours de route, `cancel-in-progress`) ⇒ exiger
   le check avant fusion.
3. **Le job a tourné, il est vert, et il ne testait pas ça** ⇒ écrire le témoin manquant.

Le discriminant se lit en dix secondes dans les `conclusion` des check runs de LA PR fautive :
`cancelled` ≠ absent ≠ `success`. Je ne l'ai regardé qu'après avoir déjà notifié.

**Et le remède « évident » n'en est pas un.** `ios-tests.yml` porte, écrite par l'équipe :
« No branch protection requires this check, so neither trigger can deadlock a merge » — les
checks iOS sont volontairement NON bloquants, parce que la file macOS du compte fait attendre
24 à 49 minutes et qu'un check requis y bloquerait toutes les fusions. Le trou n'est donc pas un
oubli, c'est le prix d'un arbitrage déjà rendu. Proposer « exiger le check » sans dire ce qu'il
coûte, c'est proposer d'annuler une décision sans la nommer.

**La règle complète, alors** : après avoir identifié la cause, chercher si elle est DÉLIBÉRÉE
avant de proposer le remède. Un fichier de CI qui explique pourquoi il ne bloque pas est un
arbitrage, pas un bug — et la piste utile devient ce qui protégerait SANS payer ce prix (un gate
compile-only, plus court que la suite complète, est déjà là et suffisait ici : il aurait rougi en
9 minutes).

**Corollaire — une description de PR n'est pas un témoignage.** Celle de #2982 énumérait
fièrement `MessageDayStickyPlacement` parmi les suppressions, et cochait « Manual Testing:
Visually verified responsive behavior ». Les deux ensemble sont impossibles : l'app ne compile
pas. Une case cochée décrit une INTENTION, jamais une exécution ; seul un job vert atteste
quelque chose, et encore faut-il qu'il ait fini.

**Corollaire — supprimer un type et supprimer SES USAGES sont deux gestes.** Le compilateur
s'arrête au premier lot fautif : il a nommé `MessageDayStickyPlacement` et s'est tu sur
`MessageDayStickyMetrics` et `MessageDayStickyPalette`, encore référencés par toute une suite de
témoins. **Un message d'erreur de compilation est un plancher, jamais un inventaire.** Le vrai
inventaire se fait en listant les déclarations retirées par le diff (`git show <sha> | grep '^-enum\|^-struct'`)
et en grepant chacune — c'est ce qui a montré que la rupture était trois fois plus large que ce
que la CI affichait.
