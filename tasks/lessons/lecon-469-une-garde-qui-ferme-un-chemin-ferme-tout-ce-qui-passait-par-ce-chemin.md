## Leçon 469 — Une garde qui ferme un chemin ferme tout ce qui PASSAIT par ce chemin

`ComposerSoundColumn.opensEditor` refuse d'ouvrir l'éditeur pour un son
EMPRUNTÉ, et le motif est juste : rouvrir passe par « Création audio », qui rend
un FICHIER, ce qui détacherait la piste de son `soundId` — donc du crédit de son
auteur. La garde est écrite, testée, motivée.

Ce que personne n'avait vu, moi compris jusqu'à la vérification simulateur :
**le RETRAIT passe par la même porte.** `deleteEditedSound` vit dans la feuille
« et nulle part ailleurs », par une décision explicite (#4696 : « trois boutons
dispersés auraient été trois lois »). Pas de bouton ⇒ pas de feuille ⇒ pas de
retrait. Un son de fond emprunté ne peut donc plus être retiré d'une slide —
seulement remplacé, c'est-à-dire qu'on n'en perd un qu'en en posant un autre.

> **La question à poser à une garde n'est pas « refuse-t-elle la bonne chose ? »
> mais « qu'est-ce qui empruntait la même porte ? »** Une doctrine du SITE
> UNIQUE — juste par ailleurs — transforme mécaniquement toute fermeture en
> fermeture de TOUT ce qui converge là.

C'est la forme du cycle 125 vue depuis l'autre bord : là, une protection laissait
partir ce qui voyageait à côté du texte gardé ; ici, une protection retient ce
qui voyageait avec le geste refusé. Dans les deux cas le défaut est dans le
VOISINAGE de la règle, jamais dans la règle.

Et il ne s'est vu que parce que #4918 a rendu la trace VISIBLE : la pastille se
déclare `GenericElement` et non `Button` à l'arbre d'accessibilité, ce qui PROUVE
que `onTap` est nul. **Un manque sans surface ne se signale pas** — le retrait
était déjà impossible sur la surface document, depuis des semaines, sans témoin.
Suivi : #4930.
