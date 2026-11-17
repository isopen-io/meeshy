## 2026-11-14 — Un élastique se règle sur le BOUT de la chaîne, pas sur le premier maillon (#18201)

### Ce qui s'est passé

L'échelle du menu flottant devait suivre le disque qu'on glisse « en accordéon ». Première loi : ressort de
0,26 s + 0,04 s par rang, amortissement 0,72. La planche à 30 i/s montrait le dernier barreau à 0,54 s derrière
sur un glisser vif ; j'ai lu ce retard comme un défaut et RESSERRÉ la chaîne (0,22 + 0,03, bout à 0,43 s). Le
porteur, à la recette : « l'effet élastique doit être un peu plus prononcé lors du déplacement, comme une échelle
qu'on tire, le point étant sur le dernier élément ». Le retard du bout n'était pas le défaut : c'était l'effet.

### La règle

- Dans une chaîne de ressorts (accordéon, échelle, traîne), **ce que l'œil lit est l'écart entre le premier et le
  DERNIER maillon**. Régler le premier (« il colle au disque ») ne dit rien de l'effet ; c'est le pas par rang et
  l'amortissement qui le font. Élastique = pas par rang généreux (≥ 0,06 s) et ressort SOUS-amorti (≈ 0,6), pas
  une chaîne serrée et amortie qui suit comme un bloc.
- Un témoin d'élasticité borne le bout **par en DESSOUS** (`response(rung: last) >= 0,5`) autant que par au-dessus.
  Mon premier témoin ne bornait que le plafond (`< 0,6`, puis `< 0,45`) : il protégeait la lenteur, pas l'effet, et
  m'a laissé resserrer sans rougir.
- Avant de « corriger » ce qu'une planche montre, demander **si c'est l'intention** : une traîne visible sur un
  glisser rapide de recette (XCUITest, ~0,3 s) est précisément ce qu'un doigt normal rendra agréable.
