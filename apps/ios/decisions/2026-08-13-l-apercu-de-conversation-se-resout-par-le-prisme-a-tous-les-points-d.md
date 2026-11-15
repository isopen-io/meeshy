## 2026-08-13 : L'aperçu de conversation se résout par le Prisme à TOUS les points d'affichage, garde d'ensemble à l'appui

**Statut**: Accepté

**Contexte**: `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` est la source de vérité iOS du Prisme Linguistique pour l'aperçu de conversation (`CLAUDE.md` règle #3, jumelle de `resolveLastMessagePreview()` côté gateway). Elle était appelée par deux lecteurs — `ThemedConversationRow` et `GlobalSearchViewModel` — pendant que trois autres surfaces d'affichage lisaient `lastMessagePreview` brut : `WidgetDataManager` (texte publié dans l'App Group, donc affiché sur l'écran d'accueil), `SharePickerView` et `WidgetPreviewView`. Les trois recevaient pourtant les mêmes objets `MeeshyConversation`, `lastMessageTranslations` inclus. Rien ne rougissait : chaque surface affichait un texte plausible, et les deux lecteurs corrects — testés, commentés — donnaient à tout audit l'impression que la règle était tenue.

**Décision**:
1. **Aucune surface n'affiche `lastMessagePreview` brut.** Le champ est une donnée de transport ; la valeur affichable est celle que rend le résolveur, avec le prisme du lecteur.
2. **Le prisme du lecteur a une seule autorité app-side** : `AuthManager.shared.currentUser?.preferredContentLanguages`, exactement comme `ConversationListView`. Une vue qui a besoin du prisme l'expose en propriété calculée ; un service le reçoit par un seam injectable (`WidgetDataManager.preferredContentLanguagesProvider`), jamais par une liste recopiée.
3. **Le dernier point de résolution avant la sortie de l'app est obligatoire.** Un texte publié dans l'App Group ne peut plus être résolu par personne : `publishConversations` doit appliquer le prisme, pas le déléguer au widget (qui n'a ni compte ni traductions).
4. **La règle est tenue par une garde d'ensemble, pas par convention** : `ConversationPreviewPrismSourceGuardTests` extrait tous les accès `.lastMessagePreview` sous `apps/ios/Meeshy/` et exige de chaque fichier une classification — résolu, ou allowlisté avec sa raison. Une garde qui compte des occurrences doit refuser un balayage vide, sinon son silence passe pour un succès.
5. **Le test d'existence et le rendu lisent la MÊME valeur.** `hasText` (qui arbitre entre texte, pièce jointe et position) se calcule sur le texte résolu : deux valeurs différentes sur un même écran font réserver la place d'un texte qui ne s'affichera pas.

**Alternatives rejetées**:
- *Résoudre à l'écriture, dans `ConversationListViewModel` / `ConversationStore`* : figerait la langue du lecteur DANS le cache. Le prisme est une propriété du lecteur au moment du rendu — un changement de langue en réglages doit se voir sans re-télécharger les conversations.
- *Faire résoudre le widget lui-même* : l'extension n'a ni session, ni `lastMessageTranslations` (le payload App Group ne transporte qu'une chaîne), ni le catalogue de langues de l'utilisateur. Lui transmettre la carte de traductions gonflerait `recent_conversations` de 50 conversations × N langues pour un affichage d'une ligne.
- *Corriger les trois surfaces sans garde* : c'est exactement l'état qui a produit ce défaut — deux lecteurs corrects donnaient l'illusion d'une règle tenue.

**Conséquences**: la garde ne balaie que `apps/ios/Meeshy/`. Une surface d'affichage vivant dans une cible d'extension (widget, NSE, partage) resterait hors de sa portée — aujourd'hui aucune n'affiche d'aperçu qu'elle résout elle-même, mais une extension qui le ferait devrait étendre le balayage en même temps.
