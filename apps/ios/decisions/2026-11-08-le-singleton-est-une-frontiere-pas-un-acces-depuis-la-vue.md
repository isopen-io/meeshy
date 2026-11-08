## 2026-11-08 : Un singleton reste un défaut d'`init`, jamais un accès depuis le corps d'une vue, et la liste de six singletons de 2025-01 est remplacée (#16901)

**Contexte.** La décision `2025-01-services-singletons-static-let-shared.md` réserve `static let shared` à six managers (AuthManager, APIClient, MessageSocketManager, PresenceManager, MediaCacheManager, ThemeManager) et écarte l'injection de dépendances. Mesuré sur `dev` le 2026-11-08 :
- `static let shared` est déclaré 187 fois dans `apps/ios/Meeshy` et 178 fois dans `packages/MeeshySDK/Sources` ;
- `DependencyContainer.shared` (`Core/DependencyContainer.swift`) existe et possède la persistance du compte actif ;
- les ViewModels échantillonnés reçoivent leurs services par l'`init`, avec le singleton en valeur par défaut (`StoryViewModel`, `ConversationViewModel`), comme l'exige `CLAUDE.md` ;
- mais environ 3 850 références `.shared` dans l'app contournent ce point d'injection, souvent depuis le corps d'une vue.

**Décision.**
1. **`static let shared` reste permis** pour un service coûteux à recréer ou qui tient une connexion, un cache ou une file. Il n'y a plus de liste fermée : le critère est le coût et l'unicité, pas le nom.
2. **Tout service avec un `shared` déclare son protocole `…Providing`** dans le même fichier, au-dessus du type concret.
3. **Le singleton n'est qu'une valeur par défaut d'`init`.** Un ViewModel, un coordinateur ou un service reçoit ses dépendances par son `init`. Une vue feuille ne lit pas `X.shared` dans son `body` : elle reçoit une valeur primitive ou passe par son ViewModel (principe « Zero Unnecessary Re-render »).
4. **Le SDK n'impose pas de singleton produit à l'app** : une brique `MeeshyUI` reçoit `CacheCoordinator`, les préférences de téléchargement ou l'état du réseau par injection (règle de pureté de `packages/MeeshySDK/CLAUDE.md`).

**Conséquences.**
- `2025-01-services-singletons-static-let-shared.md` passe au statut « Remplacée » et pointe ici.
- Une garde de source qui interdit un NOUVEAU `.shared` dans un `*View.swift` (cliquet descendant) est la suite naturelle ; elle relève de son issue.
