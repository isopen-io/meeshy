## Leçon 499 — Un témoin écrit sur la valeur où deux implémentations SONT D'ACCORD ne prouve rien sur aucune des deux

**#5045, 2026-09-03.** Le sélecteur de fonds du composer peignait ses pastilles
avec `Color(hex:)` ; le renderer qui peint réellement la story lit le même champ
avec `StoryTextLayer.parseHexColorNonisolated`. **Deux parseurs pour une seule
valeur** — et le premier ne connaissait pas la forme à huit chiffres.

La convention du dépôt est « RRGGBBAA », écrite sur le modèle (`StoryTextObject`
: « Hex "RRGGBB" ou "RRGGBBAA" ») et honorée par Android comme par le renderer
iOS. `Color(hex:)`, lui, masquait les 24 bits de POIDS FAIBLE — ce qui ne rend
pas une couleur approximative mais une couleur SANS RAPPORT :

```
000000A6  « Noir 65 % »    ->  (0, 0, 166)     un BLEU franc
6366F1A6  « Indigo 65 % »  ->  (102, 241, 166) un VERT
FFFFFFA6  « Blanc 65 % »   ->  (255, 255, 166) un jaune pâle
```

Trois pastilles sur douze annonçaient une couleur que la publication ne
peindrait jamais. C'est la loi 6 prise à revers : **l'aperçu mentait sur le
rendu**, et il le faisait depuis la seule surface dont le métier est de montrer.

### Ce qui rend cette leçon différente de « deux sources de vérité »

Le défaut n'a pas survécu par absence de témoin. `ColorHexInitTests` en avait un,
nommé pour ce cas exact :

```swift
func test_eightDigit_masksLow24Bits() { assertHex("FFFFFFFF", (255, 255, 255)) }
```

Il passait. Il passe **encore** après le correctif — et c'est tout le problème :
`FFFFFFFF` est le SEUL hex à huit chiffres sur lequel le masquage faux et la
lecture juste rendent le même RGB. Le témoin épinglait le point de RENCONTRE des
deux implémentations.

> **Un témoin choisi sur une valeur où l'implémentation fausse et l'implémentation
> juste s'accordent est vert dans les deux mondes : il ne discrimine rien.** Son
> nom (« masksLow24Bits ») DÉCRIVAIT pourtant le bug, et sa présence donnait à la
> suite l'air de couvrir le cas.

C'est la forme générale des leçons 261 (« un témoin de RANG s'écrit sur un rang
AUTRE que le premier ») et 486, poussée d'un cran : là-bas le témoin manquait
d'un cas, ici il en avait un — le mauvais. **Devant un témoin qui garde une
CONVERSION, demander : sur quelle entrée les deux lectures possibles
divergent-elles ? C'est celle-là qu'il faut écrire, et elle seule.**

### La parade, en trois gestes

1. **Épingler le consommateur au producteur, pas à une constante.** Le témoin qui
   compte désormais ne dit pas « `000000A6` vaut noir » mais « le SÉLECTEUR et le
   RENDERER lisent le même hex » — une égalité entre les deux implémentations,
   qui tombe dès qu'elles divergent, quelle que soit la valeur juste.
2. **Assertionner ce que la conversion TRANSPORTE, pas seulement ce qu'elle
   rend.** Trois témoins vérifiaient la teinte ; aucun l'alpha. Un parseur qui
   aurait rendu la bonne teinte à opacité pleine les passait tous — et « 65 % »
   serait resté indiscernable de son opaque voisin, le défaut d'origine sous une
   autre forme (écho de la leçon 275 : ce qui part À CÔTÉ de ce qu'on garde).
3. **Ne pas supprimer le témoin non discriminant — le RENOMMER et le doter de
   voisins qui discriminent.** Il vaut comme non-régression ; c'est son nom, qui
   promettait une couverture, qu'il fallait corriger.

### Le corollaire de recherche

Le défaut a été trouvé en implémentant une DIRECTIVE D'AFFICHAGE (« montrer
l'exemple dans la boîte »), pas en cherchant un bug. **Rendre une valeur plus
VISIBLE est la façon la moins chère de découvrir qu'on la lisait mal** : tant
que « Noir 65 % » n'était qu'une pastille de 16 pt à côté d'un libellé, personne
ne comparait le bleu au noir. Une vignette de 56 pt qui MONTRE le fond rend
l'écart impossible à manquer. Quand une directive demande de mieux montrer une
donnée, s'attendre à ce qu'elle exhume la façon dont on la calcule.

---
