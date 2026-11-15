## 2026-08-22 (sexies) : chips d'étiquettes plus petites, marge autour de la carte de liste, garde sur l'aperçu vide

**Statut**: Accepté (directive utilisateur)

**Décision**: chips d'étiquettes de la carte de focus en 8 pt (`LentilleMetrics.Tags.chipFontSize`, rembourrage 6/2) ; respiration des rangées voisines 18 → 30 pt pour que les chips qui débordent sous la carte gardent une marge avec la rangée suivante. Garde : l'aperçu « Auteur : texte » n'est monté que s'il y a quelque chose à dire — une carte VIDE (fond + encoche de mode seuls, rien dans l'arbre d'accessibilité) a été observée deux fois pendant une scène sur une rangée sans dernier message (« charlie amah ») ; hypothèse : un `Text` vide concaténé avec `fixedSize` casse la mise en page du bloc. À re-vérifier au simulateur (l'élection de cette rangée est difficile à reproduire à la main).
