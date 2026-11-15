## Leçon 533 — Un facteur d'échelle DÉDUIT au lieu d'être MESURÉ décale chaque geste

**Coût mesuré le 2026-09-05** : une demi-douzaine de taps au mauvais endroit,
trois ouvertures du mauvais écran, et un diagnostic (« le rail n'est pas
accessible ») ouvert puis refermé pour rien.

La capture d'un simulateur iPhone 16 Pro fait 1206 × 2622 px pour un écran de
402 × 874 pt. Redimensionnée pour la lecture, elle fait **322 × 700 px**. Le
facteur juste est donc **874 / 700 = 1,2486**. J'avais supposé un rendu de 672
px de haut — jamais mesuré — d'où un facteur de 1,3006 : **4 % d'erreur**, soit
plus de 30 points en bas d'écran, largement de quoi taper la rangée voisine
d'un rail dont les entrées font 56 points.

> **Le facteur d'échelle d'une capture se MESURE (`sips -g pixelHeight`), il ne
> se suppose pas.** Et il se VÉRIFIE sur une ancre dont l'arbre d'accessibilité
> donne la position exacte : si « Publier » est à y=806 pt et paraît à y=645
> px, le facteur est 1,2496 — un contrôle qui coûte une ligne et qui aurait
> économisé toute la série.

**Corollaire, plus général que l'échelle** : une coordonnée MÉMORISÉE d'un tour
précédent est fausse dès que la mise en page bouge. Le bouton « Flux » était à
y=152 puis à y=254 — sa position dépend d'une bannière de signaux présente ou
non. **Aucune coordonnée ne se réutilise d'un écran à l'autre** : elle se relit
dans l'arbre, et à défaut elle se recalcule depuis une capture dont l'échelle
vient d'être mesurée.

**Et une non-correction, qui compte autant** : j'ai cru trouver un défaut
d'accessibilité (« les boutons du rail ne sont pas exposés ») parce qu'`idb ui
describe-all` ne rendait que le conteneur. Vérification faite, le rail porte
`.accessibilityElement(children: .contain)` et chaque bouton son
`.accessibilityLabel` — VoiceOver descend, c'est l'outil qui n'énumère pas.
**L'absence dans un outil d'inspection n'est pas une absence dans le produit**
(leçon 532, autre visage). Rien n'a été « corrigé ».
