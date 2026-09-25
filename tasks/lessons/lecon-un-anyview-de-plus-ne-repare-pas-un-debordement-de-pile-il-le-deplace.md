## Leçon — un `AnyView` de plus ne répare pas un débordement de pile ; il le déplace (2026-08-19)

18 des 34 `.ips` device extraits ce jour meurent au même endroit : le décodeur
de métadonnées RÉCURSIF du runtime Swift, `EXC_BAD_ACCESS` **dans la page de
garde de la pile** (`sp` sous le plancher, région `---`). Six `AnyView` avaient
déjà été posés sur la chaîne du header entre le 30/07 et le 17/08 ; à chaque
fois le crash réapparaissait un maillon plus loin.

Trois choses qu'il fallait comprendre avant de toucher au code :

1. **Mesurer la bonne grandeur.** Le crash est causé par la PROFONDEUR
   d'imbrication du type concret d'un `body` (~17 Ko de pile par niveau).
   `ConversationView.body` en imbriquait **87**. Un test qui mesure cette
   profondeur au runtime (`_typeName` sur un thread à grosse pile, puis
   profondeur de chevrons) est un instrument DIRECT — et il tourne au
   simulateur, là où le crash lui-même ne se reproduit jamais.

2. **Le simulateur est structurellement aveugle à cette classe.** Pile du main
   thread : **1008 Ko sur device**, **8 Mo au simulateur** (hérité de macOS).
   Tout gate simulateur passait au vert. Ne jamais conclure « pas reproductible »
   d'un simulateur vert sur un crash de pile.

3. **`AnyView` au bon endroit ≠ `AnyView` n'importe où.** `AnyView(x)` plafonne
   le type vu par l'APPELANT, mais le getter doit quand même matérialiser le
   type de `x` À SA PROPRE PROFONDEUR DE PILE. Éraser des FEUILLES ne fait donc
   rien tant qu'une couche intermédiaire reste `some View` : la matérialisation
   unique doit toujours résoudre l'ensemble. Ce qui borne réellement, c'est
   d'éraser CHAQUE MAILLON de la chaîne à sa DÉCLARATION — chaque couche ne
   matérialise plus que la sienne.

L'expérience naturelle qui a désigné le remède était déjà dans les données :
sur 34 `.ips`, les seuls `body` de structs NOMINALES présents dans une pile
fautive sont les trois RACINES d'évaluation. Aucune struct nominale ENFANT n'y
apparaît jamais imbriquée, alors que chaque propriété calculée de la chaîne y
figure. Une frontière de vue nominale (ou de `ViewModifier`) crée un nœud
d'attribut, donc un point où le graphe DÉROULE la pile ; une propriété calculée,
non. Lire les traces avant d'écrire un correctif aurait fait gagner trois
semaines de jeu de taupes.

Corollaire retenu : la cause SYSTÉMIQUE n'était pas dans l'écran, mais dans
`Compatibility/`. `adaptiveOnChange` (233 sites) et `adaptiveGlass` (87 sites)
étaient des `@ViewBuilder` portant un `if #available` — donc un
`_ConditionalContent<A, B>` qui embarque les DEUX branches : le type de
l'appelant DOUBLE à chaque appel, pour 2 niveaux au lieu de 1. Convertis en
`ViewModifier` (comportement inchangé, deux fichiers), ils allègent 320 sites
d'un coup. Chercher le multiplicateur partagé avant de réécrire l'écran.
