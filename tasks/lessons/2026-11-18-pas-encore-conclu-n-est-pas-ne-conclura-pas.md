## « Pas encore conclu » n'est pas « ne conclura pas » — un état TRANSITOIRE ne se publie pas comme un fait (cycle 176, #19525)

### Ce que j'ai affirmé, et ce qui était vrai

Le lot #19525 a été fusionné dans `dev` à 07:40 avec la tête `496af6bb0`. J'ai
relevé son run CI à **06:17** (`queued`) puis à **07:48** (`queued`), et j'ai
rendu compte — deux fois, au porteur et dans le corps d'une PR — que la PR avait
été « fusionnée **sans verdict de CI**, son run n'ayant jamais conclu ».

Mesuré à 08:53 : le run [44248845026] a conclu **`success`** —
26 jobs, 23 verts, 3 sautés, `Verdict CI` vert — sur la tête EXACTE qui est
entrée dans `dev`. Il était resté **en attente près de trois heures** (créé
06:06, conclu 08:52).

L'énoncé juste était : **la fusion a précédé le verdict, et le verdict est
vert.** Ce n'est pas la même chose que « fusionné sans verdict », et la
différence n'est pas cosmétique — la première phrase décrit un décalage de
séquence, la seconde une décision prise à l'aveugle.

### La règle

**Un état d'attente (`queued`, `pending`, `in_progress`) est une OBSERVATION
DATÉE, jamais une conclusion.** Deux observations successives du même état
transitoire ne font pas une tendance : elles font deux observations. Avant de
publier « X n'a pas eu lieu », demander **« ou bien X n'a pas encore eu
lieu ? »** — et si la réponse dépend du temps, le dire avec son horodatage
plutôt qu'au passé composé.

C'est la famille « un compte est une AFFIRMATION » (cycle 93) et « un suivi
hérité est une affirmation » (cycle 107), appliquée au TEMPS : j'ai hérité de ma
propre observation de 06:17, je l'ai recopiée à 07:48 sans la remesurer, et à la
troisième reprise elle avait durci en fait.

### Ce qui rend le piège efficace

**Le délai dépassait de loin l'échelle à laquelle je raisonnais.** Je savais que
la CI de ce dépôt met ~3 h 30 à TOURNER ; je n'avais pas intégré qu'elle peut
mettre près de 3 h à DÉMARRER. Un run qui n'a pas bougé en une heure et demie
ressemble à un run abandonné quand on ignore que la file d'attente est du même
ordre de grandeur que l'exécution.

**Et l'erreur allait dans le sens de ma thèse.** Je venais de documenter #18760
(« `dev` n'a pas de verdict à sa tête ») : un run qui ne conclut pas CONFIRMAIT
le défaut que je décrivais. Une observation qui va dans le sens de ce qu'on
vient d'écrire est exactement celle qu'on ne remesure pas.

> **Devant une observation qui confirme la thèse qu'on défend, exiger la mesure
> qu'on exigerait d'une observation qui la contredit.**

### Corollaire sur le défaut réel

La mécanique à suivre pour #18760 n'est donc pas « `ci.yml` ne conclut pas »,
mais **le DÉLAI** : un verdict qui arrive après la décision qu'il devait
éclairer ne vaut pas mieux qu'un verdict absent, et il coûte en plus la
confiance de celui qui a décidé sans lui. C'est une autre forme du même coût, et
elle est plus honnête à nommer ainsi — parce qu'elle se corrige autrement (la
capacité et l'attente, pas la concurrence).
