## 2026-07-11 — « Limitation système » = diagnostic non prouvé ; toujours faire le différentiel app minimale

**Correction user** : j'ai présenté « iOS 26 n'affiche pas les icônes des menus contextuels natifs » comme
une limitation système documentée (mémoire d'une session antérieure, "confirmé app-wide"). Le user a
répondu : « faux, ceci est un échec de configuration, recherche comment bien faire ». Il avait raison.

**Vraie cause** : `MeeshyRefreshableScroll` (wrapper SDK de TOUTES les listes) posait `.tint(.clear)` sur
le ScrollView entier pour masquer le spinner natif du `.refreshable`. L'environnement tint se propage au
contenu, et sur iOS 26 les icônes des menus Liquid Glass suivent le tint → icônes transparentes partout
dans l'app (d'où le faux "app-wide = système"). Le spinner était déjà masqué par le proxy
`UIRefreshControl.appearance().tintColor = .clear` (AppDelegate).

**Méthode qui a tranché (à refaire systématiquement)** :
1. Menu contextuel SYSTÈME sur le même simulateur (home screen) → icônes présentes → pas l'OS.
2. App SwiftUI MINIMALE (même Xcode, même runtime, même deployment target, même code Label) → icônes
   présentes → c'est NOTRE app. À partir de là c'est une bissection, pas une spéculation.
3. Sondes .contextMenu déplacées dans la hiérarchie (racine → OK ; sous le wrapper → KO) → l'ancêtre
   coupable se cerne en 2 sondes.

**Règles** :
- « Confirmé app-wide » ne signifie PAS « système » : un wrapper partagé par tous les écrans produit
  exactement la même signature. Un état app-wide doit d'abord faire suspecter un ancêtre COMMUN.
- Ne jamais graver en mémoire « limitation OS » sans le différentiel app-minimale. La mémoire erronée a
  coûté un menu custom entier (ConversationContextMenuView) construit pour contourner un bug qui était
  à nous.
- `.tint(.clear)` (ou tout override d'environnement destructif) ne se pose JAMAIS sur un conteneur qui
  a du contenu — le scoper à l'élément visé ou passer par le proxy UIKit dédié.
- Corollaire crash : un `@ViewBuilder () -> MenuContent` générique stocké sur une row `.equatable()`
  ré-exécute le builder à chaque body pass (mesures LazyVStack) et copie un tuple géant en pleine
  récursion de layout → EXC_BAD_ACCESS PAC au lancement (initializeWithCopy for Button). Résoudre le
  menu UNE fois à la construction et le stocker en AnyView (précédent MeeshyAvatar « single, stable
  array » ; AnyView acceptable pour du contenu de menu — pas d'identité structurelle à préserver).
