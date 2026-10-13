## 2026-10-13 : une conversation qui s'ouvre referme les surfaces présentées — elles se déclarent, le routeur décide (#10539)

**Statut**: Accepté (#10539, retour porteur du 2026-10-13).

**Contexte**: Toucher une notification de message pendant une story, un réel ou une galerie changeait la pile de navigation SOUS la surface : la conversation s'ouvrait derrière, invisible. Aucun chemin d'ouverture (toast, push, lien profond, réponse) ne refermait rien, et un écran recouvert ne sait pas qu'il l'est (#9052).

**Décision**:

- **Un registre, un site.** `PresentedSurfaceRegistry` tient ce qui est présenté par-dessus la navigation ; `Router.clearPresentedSurfaces(thenOpen:)` est le seul à lui demander le passage. `navigateToConversation` (iPhone) et `iPadRootView.openConversation` passent par lui ; aucun appelant ne referme lui-même (témoin `test_onlyTheRouterAsksTheRegistryToClear`).
- **Le contenu présenté se déclare**, à son point de montage unique : `StoryViewerContainer` (tous les hôtes du lecteur), `ReelsPresenter` (calque iPhone et couverture iPad), `.conversationCover` (les pleins écrans d'une conversation), `SocialMediaGalleryPresentation` (galeries du fil), `MeeshyComposerHost` (toutes les portes du composer). Refermer la surface du dessous emporte ce qu'elle a présenté (commentaires, profil, partage). Les fiches de profil du routeur se referment par leur état.
- **Une surface répond `closes` ou `retains`.** Le composer ne se referme que par la porte vierge, dont le brouillon s'écrit à la fermeture et se relit à la réouverture (`ComposerConversationYield`). Toute autre porte retient : elle reste, tout ce qui est sous elle reste, et la conversation s'ouvre à son départ — dans les deux minutes, sinon la demande est oubliée.
- **Une seule transition.** Quand une surface part, la conversation se pose dessous sans animation (`Transaction.disablesAnimations`) et c'est la fermeture qui la révèle. Attendre la fin de la fermeture ajoutait un temps mort puis une seconde animation.
- **L'appel ne se déclare pas** : il vit dans sa fenêtre (`CallWindowPresenter`) et reste.
- **Pas de balayage UIKit** (`rootViewController.dismiss`) : il refermerait la porte de mise à jour obligatoire et les écrans d'accès, et laisserait les états SwiftUI à `true`.

**Limites**: une feuille (`.sheet`) présentée seule, hors fiches de profil, ne se déclare pas. Le registre est commun aux fenêtres d'un iPad.
