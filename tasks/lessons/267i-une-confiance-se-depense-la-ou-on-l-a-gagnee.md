## 267i — une confiance se DÉPENSE là où on l'a gagnée

- **Un lot volontairement partiel doit nommer ce qui le débloquera, sinon il ne
  se termine jamais.** 263i a épinglé 40 écrans sur 132 en écrivant la condition
  de la suite : « le risque n'est pas par fichier mais par PARSEUR ; on épingle
  un lot que la CI valide, puis on poursuit avec une confiance mesurée ». La CI a
  validé ; le solde se prend sans redébattre. **Un « pas tout de suite » sans
  critère de reprise est un abandon déguisé.**

- **Répliquer les FILTRES, pas la boucle** — la leçon 258i, appliquée
  délibérément cette fois. La réplique a été refaite depuis la source, filtre par
  filtre, et deux d'entre eux changent le résultat sans se voir : `state ==
  "translated"` (un `needs_review` n'est PAS une traduction livrée) et les clés
  PLURIELLES, dont chaque catégorie CLDR doit l'être — sans ce second filtre, les
  neuf clés plurielles du catalogue comptent comme des trous dans toutes les
  locales (défaut réel corrigé au 226i).

- **Deux mesures indépendantes qui tombent sur le même nombre valent une
  preuve.** La réplique rend 92 éligibles, exactement le solde annoncé quatre
  itérations plus tôt (132 − 40). Ce n'est pas une confirmation logique — les
  deux pouvaient se tromper pareil — mais c'est le contrôle le moins cher qui
  existe, et il faut le poser avant de croire un scanner qu'on vient d'écrire.

- **Vérifier une liste qu'on vient d'écrire en la RELISANT depuis le fichier
  édité.** Contrôler les 135 chemins contre la liste que je viens de composer en
  mémoire ne prouve rien sur ce qui est réellement dans le fichier : seule la
  relecture attrape une faute de collage, une entrée dupliquée, une accolade
  déplacée. Même raison que la borne « les chemins existent sur disque ».

- **Un lot produit parfois un renseignement gratuit qui vaut plus que son
  livrable.** En classant les 164 fichiers restants par la règle qui les bloque :
  **154 sur la règle B** (`defaultValue` divergent, #4308) contre 56 sur la règle
  A. Ce n'est donc plus la traduction qui borne ce cliquet, c'est la dette de
  littéraux — et la prochaine action utile sur cette surface n'est pas
  « traduire » mais « réconcilier ». Classer ce qui RESTE par sa cause, pas
  seulement compter ce qui passe.

---
