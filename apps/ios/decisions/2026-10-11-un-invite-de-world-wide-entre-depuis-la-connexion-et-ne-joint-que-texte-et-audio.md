## 2026-10-11 : un invité entre dans World Wide depuis l'écran de connexion, et n'y joint que du texte .txt et de l'audio (#10006)

**Statut**: Accepté (#10006, #10001).

**Contexte**: Le milestone « Le monde entier entre dans World Wide depuis meeshy.me » (#168) ouvre la conversation globale `world` aux visiteurs sans compte, sur le web, la coque Android et l'app iOS native. Le serveur sert l'entrée (`GET /api/v1/world`), fait entrer un invité par la porte canonique des liens (`POST /api/v1/links/:key/members`) et refuse, sur la signature réelle du contenu, toute pièce jointe d'invité hors des familles du lien (#10001).

**Décision**:

- **La clé de jonction se LIT, elle ne s'écrit pas.** `WorldService` (SDK) lit `shareLinkIdentifier` dans `GET /world` ; aucun client ne nomme le lien en dur. La carte « Entrer dans World Wide » de `LoginView` n'existe que si l'entrée est servie ouverte, et cède la place à la vérification en deux étapes.
- **Le parcours est celui du web** (planche « Onboarding ») : nom → langue principale proposée depuis l'appareil (l'une des sept, sinon `fr`) → fil. La session déjà ouverte par l'appareil sur la même clé est reprise sans reposer les questions.
- **Ce qu'un invité peut joindre voyage avec sa session** (`AnonymousSessionContext.allowedAttachmentKinds`, optionnel au décodage : rétrocompatible avec les sessions enregistrées avant le champ).
- **World Wide est plafonné côté client aussi** : `GuestSession.effectiveContext(_:)` applique `GuestAttachmentKind.worldGuestCeiling` (`.txt` et audio) — des termes absents prennent le plafond, jamais « tout » ; des termes plus larges y sont resserrés. C'est le seul endroit où la session rejoint le fil.
- **Le composeur n'offre que les portes ouvertes** (`ConversationView+GuestAttachments`) : une porte fermée est retirée, jamais inerte ; la porte « Fichier » ouvre la feuille « Partager dans … » qui dit ce qui passe et pourquoi le reste ne passe pas ; dépôt et collage suivent la même loi.
- **Le refus serveur est définitif** : `GuestAttachmentRefusal` (403/413, codes `GUEST_ATTACHMENT_*`) remonte typé du tus, n'est pas rejoué par l'outbox, et la bulle dit pourquoi.
- Un compte, ou un invité dont le lien ne restreint rien, garde le composeur habituel. Le serveur reste juge du contenu.
