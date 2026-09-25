## Leçon 302

**Un compte par regex non ANCRÉE mesure aussi les symboles qui PRÉFIXENT le nom
cherché — et publie un « c'est fait » faux.**

En alignant la planche du composer sur le modèle normalisé, je mesurais
l'avancement par `Meeshy(Object|Scene|Slide|Publication)`. Cette expression
matche `MeeshyScenePlayer` — le registre de RENDU, qui n'est pas un niveau du
modèle. Vingt-trois occurrences sur 188 étaient ce faux positif.

Le coût n'est pas l'imprécision du chiffre, c'est la **conclusion inversée** :
j'ai annoncé « plus aucune section muette » alors que P0 était à zéro et
n'apparaissait pas, ses `MeeshyScenePlayer` le couvrant. La section la plus lue
du document était la seule à ne pas parler la langue qu'on venait d'y imposer.

> **Un compte est une AFFIRMATION** (leçon du cycle 93). Quand il sert de
> critère de fin, l'ancrer : `(?![A-Za-z])`. Et le vérifier sur le cas qui
> DEVRAIT rendre zéro — un balayage qui ne rend jamais zéro nulle part ne
> mesure pas ce qu'on croit.

**Corollaire, plus cher : le même travail a produit une affirmation fausse sur
le FOND, par la même mécanique.** J'ai écrit l'anatomie de `MeeshyObject` depuis
le contrat partagé — sept kinds « actifs » — en lisant `ACTIVE_KINDS` et en
m'arrêtant là. Vérification faite ensuite : **aucun écrivain du dépôt n'émet
`mention`**, et à la relecture iOS le traite dans le MÊME `case` que les kinds
RÉSERVÉS (`case .mention, .reserved: continue`). Il y a six kinds vivants, plus
un déclaré.

C'est la forme exacte du piège que ce dépôt documente ailleurs — *un champ que
le contrat déclare et qu'aucun producteur n'écrit est tenu pour acquis par tous
ceux qui lisent le schéma*. Le contrat est la bonne source pour la FORME d'un
champ ; il ne dit rien de son EXISTENCE en production. Les deux questions sont
disjointes, et une seule se lit dans le schéma.

> Devant une énumération tirée d'un contrat, poser la seconde question :
> **qui l'ÉCRIT, et qui le LIT ?** Le grep qui répond met une minute ; la
> planche a failli publier « sept kinds » comme un fait.

Et ce qui a permis d'attraper les deux : **le document lui-même contenait déjà
le contre-exemple.** P0 disait, en une incise, « le contrat déclare SEPT kinds
actifs, `mention` compris, mais AUCUN écrivain n'en émet ». Confronter ce qu'on
écrit à ce que le document dit DÉJÀ ailleurs est moins coûteux que de le
redécouvrir.
