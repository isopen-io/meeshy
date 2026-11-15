## Leçon 438 — Une capture montre ce qui est RENDU, jamais POURQUOI : un écart avec la cible peut être une DÉCISION

**Le fait (2026-09-02, #4508).** Le rail d'actions du lecteur de story diverge de
sa cible `2f.png` sur trois points. J'en ai diagnostiqué deux depuis la seule
capture d'écran, en les écrivant comme des arbitrages tranchés dans l'issue.
**Les deux étaient faux**, et je ne l'ai vu qu'en ouvrant le fichier pour l'éditer :

| ce que la capture montrait | ce que le code disait |
|---|---|
| « il manque les pastilles rondes de la cible » | elles ont été RETIRÉES sur spec porteur du 2026-06-25 (« supprimer les cercles autour des FABs, juste le glyph + ombre ») — le commentaire est trois lignes au-dessus du code que j'allais changer |
| « `Abc` est du TEXTE, seul de son espèce dans un rail de glyphes » | c'est `Image(systemName: "textformat.abc")`, un SF Symbol comme ses voisins ; il *dessine* des lettres |

Sur trois écarts, **un seul** était un oubli. Les deux autres étaient l'un une
décision, l'autre une illusion d'optique.

> **Un écart entre un écran et sa maquette n'est pas une dette par défaut.** Il
> peut être un oubli, une décision antérieure que la maquette ignore, ou une
> lecture fautive du rendu. Les trois se ressemblent parfaitement à l'écran —
> et deux sur trois se dissipent en ouvrant le fichier.

**Ce qui rend le piège coûteux ici** : la maquette est plus RÉCENTE que la
directive (document arrêté au 2026-08-28, spec du 2026-06-25), donc la règle de
préséance du `CLAUDE.md` semblait me donner raison. Mais une planche générique
qui dessine des pastilles ne *demande* pas d'annuler une directive qu'elle ne
connaît pas : elle montre un état antérieur, elle ne prescrit pas un retour en
arrière. Le dépôt avait déjà payé la version voisine de cette faute — le retour
porteur du même jour (revert `328dd69026`) sanctionne un lot qui avait lu le
SILENCE du document comme une prescription.

**How to apply.** Avant de rapprocher un écran de sa cible, pour CHAQUE écart :

1. Ouvrir le site du rendu et lire son doc-comment — les specs datées vivent là,
   pas dans les issues.
2. `git log -S "<la chose absente>"` sur le fichier : ce qui manque a peut-être
   été retiré, et le message de commit dit par qui et pourquoi.
3. Vérifier que ce qu'on lit à l'écran est ce qu'on croit — un symbole qui
   ressemble à du texte reste un symbole.

Et écrire l'arbitrage dans l'issue AVANT de coder ne protège de rien si l'on n'a
pas encore ouvert le code : c'est exactement l'ordre qui m'a fait publier deux
arbitrages faux avant de les corriger deux fois. **La loi 2 dit d'écrire avant de
coder ; elle ne dit pas d'écrire avant de LIRE.**

Voisines : § 435 (une règle appliquée à une seule de ses dimensions),
§ 433 (ce qui s'énumère se périme — les numéros « 1. / 2. / 3. » des blocs du
rail, faux dès qu'on déplace un bloc, ont été retirés dans le même lot).
