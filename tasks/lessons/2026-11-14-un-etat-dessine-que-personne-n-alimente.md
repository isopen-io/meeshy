# Un état DESSINÉ que personne n'alimente — et ce qu'un inventaire d'asymétries affirme

*Cycle 162, #18537 et #18115. Portée : tout cliquet d'inventaire, et tout retrait
de code mort.*

## 1. Un inventaire d'asymétries est une liste de QUESTIONS, pas de dettes

Le cycle 161 a posé `socket-event-platform-parity-gate` : 29 événements « non
portés par le web », sous une raison de famille juste — `apps/web` suit l'interface
iOS, et « iOS et Android le lisent, le web pas encore » y est l'état NORMAL d'une
feature non portée. Le cycle 161 a explicitement refusé d'en faire 32 issues de
portage, pour ne pas substituer son verdict à celui du produit.

Deux des 29 n'étaient pas dans ce cas, et c'est précisément ce que l'inventaire
permet de découvrir : `audio:transcription-failed` et `audio:translation-failed`
ne manquaient pas à une feature non portée. Ils manquaient à une feature **déjà
portée**, dont l'état d'échec était DESSINÉ (la puce « Transcription… », le
plafond de silence, la phrase « Transcription impossible ») et jamais ALIMENTÉ.

> **La question à poser à chaque ligne d'un tel inventaire n'est pas « faut-il la
> porter ? » mais « cette plateforme a-t-elle déjà l'ÉTAT que cet événement
> alimente ? ».** Si oui, ce n'est pas un portage qui manque — c'est une panne,
> et elle a la priorité de la feature qu'elle dégrade.

Le symptôme, mesuré : la passerelle diffuse la panne en ~1 s ; le lecteur gardait
la puce figée **90 secondes** (son plafond de silence), puis rendait la main
**sans un mot**, le `notice` dessiné pour cette phrase exacte restant nul.

## 2. Un cliquet qui compte des CITATIONS ne prouve pas un branchement

Mesuré sur ce lot : le cliquet de parité reste **VERT** si l'on retire le câblage
de production, parce que les témoins neufs citent les deux constantes et qu'un
fichier de test est une source comme une autre sous la racine balayée.

Ce n'est pas une découverte — le doc-comment du cliquet l'écrit (« *cite* et non
*écoute* »). Mais la limite devient PORTANTE dès qu'on se sert du cliquet pour
arbitrer un portage : elle cesse d'être une note de méthode et devient le
discriminant d'une décision.

> **Une limite écrite dans un doc-comment est inerte jusqu'au jour où quelqu'un
> appuie une décision sur l'outil.** Ce jour-là, la relire fait partie du lot — et
> ce qui prouve le branchement est un témoin de SURFACE (partant de la CONSTANTE
> de contrat, à travers le site d'abonnement réel), jamais le cliquet.

## 3. Deux faits qui lèvent la même attente sont DISJOINTS

Une attente peut se lever sur une **PREUVE** (le temps réel dit la panne) ou sur
l'**ABSENCE prolongée** de preuve (un plafond de silence). Il est tentant de lire
l'arrivée de la première comme la péremption de la seconde.

C'est l'inverse : le plafond garde le cas où RIEN n'arrive — socket coupée,
service muet —, c'est-à-dire exactement le cas où la preuve ne peut pas venir. Les
retirer l'un pour l'autre figerait le contrôle pour toujours là où il l'était
déjà.

> **Devant deux mécanismes qui produisent le même effet, demander lequel des deux
> couvre le cas où l'AUTRE est impossible.** Et poser le témoin qui tombe sous la
> mutation « le second ne sert plus, puisque le premier existe » : c'est la moitié
> du lot la plus facile à casser six mois plus tard.

## 4. Ne pas faire porter à un événement une précision que son producteur n'a jamais eue

`audio:translation-failed` ne nomme aucune langue cible. La forme « naturelle »
était d'élargir le contrat pour qu'il la nomme ; la valeur **n'existe pas en
amont** (la tâche audio traite toutes les cibles d'un bloc, l'échec porte sur la
PIÈCE). La fabriquer à l'émetteur, c'est inventer une attribution.

La panne s'écrit donc par ÉTAGE — `translations` au PLURIEL, et le nom le dit —
et lève toutes les langues en attente de cette pièce.

> **Avant d'élargir un contrat pour qu'il porte un discriminant, remonter jusqu'au
> producteur pour vérifier qu'il le POSSÈDE.** Un champ que l'émetteur devine est
> pire qu'un champ absent : il a l'autorité du contrat et la fiabilité d'une
> supposition.

## 5. Retirer du code mort retire les gardes qui ne vivaient que là

`AttachmentUpdatedEvent` (Kotlin, miroir PLAT) exposait un `SharedFlow` public et
nommé que rien ne collectait — un décodage par trame, pour personne. Son retrait
est juste.

Mais le témoin de #18070 — « une trame qui ne nomme AUCUNE pièce décode » — ne
vivait **que là**. Le miroir vivant couvrait « pas d'`attachmentId` mais une pièce
jointe » (repli sur `attachment.id`), pas « ni l'un ni l'autre ».

> **La question à poser avant de retirer du code mort n'est pas « qui le lit ? »
> mais « qu'est-ce que ses TÉMOINS sont les seuls à tenir ? ».** Porter la garde
> AVANT le retrait, dans le même lot, avec sa raison écrite sur place — sinon on
> rouvre, en nettoyant, le piège qu'un lot précédent avait fermé.

## 6. Un commentaire qui nomme un consommateur peut lui survivre DEUX fois

Le contrat partagé justifiait `attachmentId` ainsi : « le décodeur Android natif
(`AttachmentUpdatedEvent`) l'exige et rejetait l'événement entier sans lui ».
Vrai quand c'était écrit ; faux depuis #18070 (l'exigence levée) ; sans objet
depuis #18115 (le décodeur retiré).

C'est la forme la plus discrète de la règle du cycle 114, parce qu'elle justifie
un champ qui reste **parfaitement légitime** : il n'y a aucun symptôme à chercher,
donc aucune raison d'ouvrir la phrase. Elle ne se corrige qu'en passant — et le
lot qui retire le consommateur est le seul qui passe là.
