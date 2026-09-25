## Leçon 244 — une ligne d'`exclude` dans `tsconfig` retire le code de TOUT ce qui mesure, d'un seul geste (2026-08-22, routine messagerie, cycle 94)

Toutes les autres façons de rendre du code invisible ont un coût que quelqu'un
voit :

| geste | ce qui se voit |
|---|---|
| retirer un test | la couverture baisse |
| supprimer un fichier | un import casse |
| poser un `any` | le reste du fichier reste sous contrôle |
| **`exclude` dans `tsconfig`** | **rien** |

Une ligne d'`exclude` retire le code de la compilation, du type-check, de
l'émission — et, si `jest.config.json` porte la ligne jumelle, du banc de test et
de la couverture. Aucun avertissement ne se lève, aucune suite ne rougit, aucun
seuil ne bouge. **Le répertoire reste là, plein, crédible, cité dans les documents
d'architecture.**

Coût mesuré sur `services/gateway/src/dma-interoperability/` : 3 231 lignes de
Signal Protocol (X3DH, Double Ratchet, gestion de clés, moteur, adaptateurs) hors
compilateur et hors banc, importées par personne. Quatre de ses modules
importaient un chemin qui ne résout **nulle part** — ni dans le dépôt, ni dans
l'image Docker. Remis sous le compilateur : **8 erreurs, dont 4 défauts
d'exécution**, dont trois qui cassaient l'établissement de session par des chemins
indépendants.

Et le détail qui donne la mesure exacte de ce que le silence coûte : le seul
endroit du chemin fautif où le compilateur AURAIT pu parler malgré l'exclusion
portait un `(pk: any)`.

> **Avant de conclure qu'un défaut est un oubli d'auteur, demander ce qui aurait
> dû le voir.** Le suivi qui a ouvert ce cycle nommait un IV de 4 octets de trop.
> Ce qu'il fallait aller chercher, c'est ce qui laissait un écart pareil vivre
> entre trois déclarations partagées et leur unique producteur : deux lignes de
> configuration, écrites une fois, jamais relues.

Corollaire de manœuvre, pour ne pas transformer la remise sous compilateur en lot
sans fin : **ce qu'on rallume et ce qu'on laisse éteint se DÉCIDENT séparément, et
se disent.** Ici — le compilateur : oui, tout de suite (8 erreurs, tractable). Les
3 suites du sous-arbre : non (mesuré 56 échecs / 114 ; les rendre vertes est un lot
qui se fait en regardant chaque échec, pas en desserrant des assertions). La
couverture : non (3 231 lignes quasi non couvertes feraient rougir la CI sous le
seuil, ce qui n'a aucun rapport avec le défaut). La suppression : non — c'est une
obligation réglementaire, donc une décision de feuille de route, pas un arbitrage
d'hygiène de code. **Publier la mesure de ce qu'on n'a pas fait est ce qui permet
au cycle suivant de partir d'un chiffre plutôt que d'une estimation.**
