## 2026-08-22 (quater) : effectif → participants, carte de liste ample, chips uniformes sur toutes les bulles en focus, aperçu « Auteur : texte » sur deux lignes

**Statut**: Accepté (directives utilisateur)

**Décision**:
1. **Carte de liste** : hauteur 84 → 104, rembourrage vertical 8 → 14, respiration 12 → 18 pt (jeton partagé `list.focusCard` mis à jour dans `packages/shared/design/lentille-tokens.json`, garde `test_focusCardHeight_isTheMagnifiedToken…`). L'aperçu est UN texte « Auteur : début du texte » (`senderPrefix + Text(previewText)`) qui coule sur deux lignes — retour à la ligne naturel. L'effectif est un bouton → feuille des participants (`handleConversationInfoView`, onglet Membres par défaut).
2. **Bulles en focus (fil)** : chips généralisées à TOUTES les bulles — haut-gauche avatar + auteur (toucher = profil), haut-droite date complète + coche d'état de réception (toucher = détails de lecture), bas : traduction, drapeaux, (+), réactions — **une seule coquille** (`focusChip`, capsule opaque, contour accent, pleine quand active / à moi). L'en-tête inséré des têtes de groupe garde sa place et s'efface en focus (hauteur stable, instantané). Inset des chips = 14 pt du bord de la carte, comme l'encoche de la liste.

**Alternatives rejetées**: retirer l'en-tête de tête de groupe en focus (changement de hauteur pendant le défilement) ; garder des cercles pour les icônes du bas (directive « exactement comme ces chips »).
