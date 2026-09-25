## Leçon 536 — Deux défauts opposés (recouvrement, CLS) partageaient la même cause : une boîte de hauteur nulle

Constat du 2026-09-05 (gate `test:chaines` › `v3-fil.spec.ts`, tour v3, écran
`thread`) : `.reagir-slot` était à `height:0` tant que le module de temps réel
n'y avait pas posé le bouton « Réagir », et une revue précédente (#5061) avait
corrigé le recouvrement qui en résultait (`overflow:visible` centrait le
bouton de 44 px SUR la ligne nulle, recouvrant le dernier mot du texte
précédent) par `:has(>.reagir)` — réserver la hauteur SEULEMENT quand le
bouton est déjà là. Mesure suivante : CLS 0,089 sur `/chats/:cle`, au-dessus
du budget 0,05. Le correctif du recouvrement avait rouvert un décalage : le
module insère le bouton APRÈS le premier pixel (chargement différé, § 12.4),
donc la bascule `height:0 → var(--target-min)` déplaçait tout ce qui suit
CHAQUE bulle au moment où le module chargeait.

**La règle.**
1. Un slot qui réserve une hauteur CONDITIONNELLEMENT à la présence d'un
   contenu inséré APRÈS le premier pixel garantit un CLS, pas une exception :
   la condition qui évite le recouvrement AU REPOS est exactement celle qui
   produit le décalage AU CHARGEMENT. Les deux symptômes (recouvrement,
   CLS) sont la même cause vue à deux instants — les traiter comme deux
   correctifs indépendants (l'un par `:has()`, l'autre à trouver plus tard)
   les fait alterner sans jamais converger.
2. Le correctif qui les résout ENSEMBLE réserve la hauteur INCONDITIONNELLEMENT,
   dès le SSR : la place existe avant que le contenu n'arrive, donc son
   insertion ne déplace rien (CLS supprimé À LA SOURCE) et le slot a déjà sa
   taille réelle quand le contenu y arrive (plus de centrage qui déborde).
3. Le prix (un carré vide, non cliquable, tant que le module n'a pas chargé)
   se documente et s'assume — ce n'est pas un défaut, c'est le coût mesuré
   d'une amélioration progressive dont l'espace est réservé par avance.
4. Devant un correctif de recouvrement sur un slot dont le contenu arrive en
   différé, demander : « la condition qui évite le recouvrement au repos
   est-elle aussi la condition qui produit un décalage au chargement ? » —
   si oui, les deux ne se corrigent qu'ENSEMBLE, par une réservation
   inconditionnelle, jamais par deux correctifs qui se contredisent.
