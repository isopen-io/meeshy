## Deux faits qui lèvent la même attente sont DISJOINTS

*Cycle 162 bis, #18537. Portée : tout contrôle dont l'attente a un plafond.*

Une attente peut se lever sur une **PREUVE** (le temps réel dit la panne) ou sur l'**ABSENCE prolongée** de preuve (un plafond de silence — 90 s dans le lecteur audio, `ON_DEMAND_STALL_MS`). Il est tentant de lire l'arrivée de la première comme la péremption de la seconde : le signal existe désormais, donc le plafond ne sert plus.

C'est l'inverse. Le plafond garde le cas où RIEN n'arrive — socket coupée, service muet —, c'est-à-dire exactement le cas où la preuve **ne peut pas** venir. Les retirer l'un pour l'autre figerait le contrôle pour toujours là où il l'était déjà, et le ferait sous l'apparence d'une simplification.

> **Devant deux mécanismes qui produisent le même effet, demander lequel des deux couvre le cas où l'AUTRE est impossible.** Et poser le témoin qui tombe sous la mutation « le second ne sert plus, puisque le premier existe » : c'est la moitié du lot la plus facile à casser six mois plus tard, par quelqu'un qui aura raison sur le mécanisme et tort sur le cas.

Mesuré : ce témoin-là tombe sous sa mutation, et il tombe avec les deux témoins historiques du plafond (#10629, #10759) — ce qui dit que la mutation ne retire pas une précaution mais une garantie déjà payée.
