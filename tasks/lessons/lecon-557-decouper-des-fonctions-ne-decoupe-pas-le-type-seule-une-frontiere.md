## Leçon 557 — Découper des FONCTIONS ne découpe pas le TYPE : seule une frontière nominale non générique coupe la chaîne d'un `body`

**Le fait (#5837, 2026-09-09).** `RootView.body` = 66 niveaux d'imbrication de
type (~1 095 Ko de pile de démangleur), `iPadRootView.body` = 69 (~1 145 Ko),
contre 1 008 Ko de pile principale sur l'appareil : chaque racine débordait SEULE,
avant même les ~180 Ko que la traversée SwiftUI consomme. Crash au lancement sur
iPhone en Debug, intermittent (cache de métadonnées global au process), invisible
au simulateur (8 Mo de pile). Les trois `body` déjà bornés à 40 étaient verts.

**Ce qui comptait, et que le découpage existant ne touchait pas.** L'iPad avait
DÉJÀ « découpé » sa chaîne : `applyingSheets(_ content: some View) -> some View`
dans un fichier à part, `rightPanelContent(for:)` dans une extension. Zéro effet
sur la profondeur — une fonction générique ou un `@ViewBuilder` d'extension rend
un type opaque qui se re-niche INTÉGRALEMENT chez l'appelant. Ce qui coupe la
chaîne, c'est une frontière **nominale et non générique** : le parent ne voit
qu'un nom (`ModifiedContent<…, RootSheetsLayer>`, `RootRouteDestination`), et le
contenu est matérialisé dans son propre nœud d'attribut, pile déroulée.

Trois gestes, mesurés :

| geste | avant → après |
|---|---|
| `switch` de 27 routes de `navigationDestination` → `RootRouteDestination` (struct) | le type de retour de la closure est un paramètre GÉNÉRIQUE de `navigationDestination` : l'arbre `_ConditionalContent` des 27 cas et leurs chaînes entraient dans la racine |
| 46 modificateurs → 6 `ViewModifier` nominaux par tranches CONTIGUËS (`RootLayers/`) | 46 maillons → 6 ; l'ordre interne à chaque tranche est celui de la chaîne d'origine |
| `NavigationStack` + toolbar du panneau iPad → `iPadRightPanel` (struct) | 27 → 24 sur l'iPad, le dernier palier |

`RootView.body` **66 → 21**, `iPadRootView.body` **69 → 24** ; couche la plus
profonde : 16. Aucun `AnyView`.

**La règle.**
1. **Une racine n'est pas un écran de plus** : tout ce qu'elle imbrique s'ajoute
   à la pile de CHAQUE vue qu'elle matérialise. Le budget de profondeur mesure
   les racines ET chaque couche — sinon la racine passe au vert pendant qu'une
   couche regrossit en silence, et le découpage a DÉPLACÉ la dette.
2. **Convertir un modificateur en `ViewModifier` ne retire rien** (un maillon
   reste un maillon) ; c'est le REGROUPEMENT en tranches nominales qui compte.
   Un `ViewModifier` GÉNÉRIQUE (`AdaptiveOnChangeModifier<V>`) coûte un niveau
   de plus par argument générique : passer `AnyHashable` plutôt que `[Route]`.
3. **L'ordre porte du comportement** : une feuille présentée sous un
   `environmentObject` ne voit pas le même environnement qu'au-dessus. On tranche
   par runs contigus ; on ne réordonne jamais pour partager davantage.
4. **Le coût réel est le câblage de l'état**, pas la vue : un `@State` lu par une
   seule tranche déménage dans son `ViewModifier` ; un état partagé reste à la
   racine et voyage en `Binding`. Les corps de `.task` et les `onReceive` restent
   des méthodes de la racine, remis en fermetures — la couche ne possède rien.
5. **Un vert « ConversationView.body = 0 niveau (7 caractères) » est vacuous** :
   le `body` rend un `AnyView`, la garde certifie le type que l'effacement a
   aplati. À relire avant d'être cru (leçon du 2026-09-03).

**Le piège d'outillage payé au passage.** `git add <a> <b> <chemin-déjà-supprimé>`
échoue sur le pathspec manquant et n'indexe RIEN — puis un `;` laisse passer le
`git commit`, qui embarque la seule suppression déjà indexée par `git rm`. Le
commit poussé disait « 21 fichiers » dans son message et en contenait UN.
`git show --stat HEAD` avant tout `push`, et jamais `;` entre un `add` et son
`commit`.

Détail : `apps/ios/Meeshy/Features/Main/Views/RootLayers/`,
`ConversationViewBodyTypeDepthTests` (racines, destinations, couches, plafond
racine 24), #5837.
