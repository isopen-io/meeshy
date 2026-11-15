## Leçon 382 — Une garde qui refuse TOUTE écriture refuse aussi la BONNE

**Cycle #3914 (2026-09-01).** `ConversationViewModel.seedResumePositionSeconds`
posait `guard !hasLocalPosition` : la position servie par le serveur n'écrivait
JAMAIS dans le magasin de reprise dès qu'une position locale existait, si
ancienne fût-elle. Un appareil ayant ouvert la pièce jointe une fois n'apprenait
plus jamais ce qui s'était passé ailleurs.

Sa raison écrite n'était juste qu'à moitié — « une position locale plus avancée,
ou volontairement abandonnée, ne doit pas être écrasée par une valeur serveur
peut-être périmée ». **Un MAXIMUM garde la moitié « plus avancée »
intégralement** ; la seconde moitié se payait par le gel définitif de
l'appareil.

> Comparer coûte une ligne de plus que refuser, et ne perd rien. La
> non-régression demandée devient une CONSÉQUENCE de la règle plutôt qu'une
> exception à écrire à part — donc une chose de moins à maintenir.

**Le témoin s'écrit sur le cas que la garde RATE**, jamais sur celui qu'elle
protège : au cas protégé, la garde trop large et la règle juste rendent le même
verdict. Même forme que la leçon 261.

**Le signe avant-coureur** : deux valeurs du même domaine fusionnées par deux
règles OPPOSÉES à quelques lignes d'écart. `MediaConsumptionStore` (teinte
cosmétique) fusionnait en MAX depuis toujours, dans la MÊME boucle que le
magasin de reprise qui refusait tout, et rien ne disait pourquoi.
