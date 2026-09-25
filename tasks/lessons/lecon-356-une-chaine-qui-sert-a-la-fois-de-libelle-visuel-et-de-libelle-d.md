## Leçon 356 — Une chaîne qui sert à la fois de libellé VISUEL et de libellé d'ACCESSIBILITÉ est une décision prise pour l'un des deux lecteurs

**Le fait.** La pastille bande-son du socle du composer posait
`.accessibilityLabel(Text(ComposerSocleSound.label(for: fond)))` — la chaîne MONTRÉE,
resservie telle quelle. Elle contient une durée d'horloge (« 0:28 ») ; VoiceOver la
prononce en heures et minutes. Un extrait de vingt-huit secondes s'annonçait
« zéro heure vingt-huit ».

La doctrine existait déjà, écrite et outillée (247i) : `LocalizedNumber.duration` pour ce
qu'on VOIT, `LocalizedNumber.spokenDuration` pour ce qu'on ENTEND. Le défaut n'est pas
l'ignorance de la règle — c'est le **partage d'une chaîne entre deux consommateurs qui
n'ont pas la même grammaire**. Réutiliser le libellé visuel a l'air d'une économie ; c'est
un choix imposé au lecteur qui n'a pas été consulté.

**La forme du correctif.** DEUX projections, UNE composition. `label` et `spokenLabel`
délèguent à un `compose(_:locale:duree:)` privé qui porte le titre, le crédit et l'ordre ;
seule la fonction de durée change. Deux fonctions écrites côte à côte auraient divergé au
premier champ ajouté — et la divergence se serait vue chez UN seul des deux publics, donc
jamais.

**Le témoin ne peut pas être écrit dans la langue du banc.** `String(format: "%d:%02d")`
et `LocalizedNumber.duration` rendent tous deux « 0:28 » en français : un témoin en fr_FR
reste vert **des deux côtés du correctif**. Il faut la locale où les deux divergent — et
`ar` NUE ne suffit pas (elle emprunte la région de l'appareil et rend des chiffres latins
sur un banc américain) : `ar_SA`, comparaison `.literal`, sinon « ٦ » vaut « 6 » par
collation. La règle prend donc sa `locale` en PARAMÈTRE plutôt que de lire `.current` :
**une règle pure doit pouvoir être éprouvée sur une locale autre que celle de la machine
qui la teste.**
