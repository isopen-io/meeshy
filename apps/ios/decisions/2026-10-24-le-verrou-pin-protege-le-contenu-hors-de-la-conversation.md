## 2026-10-24 : le verrou PIN protège le CONTENU — la rangée, l'aperçu, le préchargement, le widget et la bannière n'en montrent rien (#11387)

**Contexte.** L'audit adversarial de #11385 (constat 4) a mesuré qu'une conversation verrouillée par PIN ne gardait que son OUVERTURE : la rangée de liste affichait le dernier message en clair (`ThemedConversationRow`, `LentilleConversationRow`), avec la frappe, le brouillon et la vignette ; le widget d'écran d'accueil publiait ce même aperçu ; l'extension de notification ne savait rien du verrou — le cliché App Group portait `userState.isLocked`, qu'aucun code de l'app ne posait — et la bannière montrait le message, sa photo et son lecteur audio. L'aperçu d'appui long était déjà scellé (#11526), mais un chargement en vol au moment du verrou allait encore jusqu'au réseau.

**Décision porteur (2026-10-24).** Le verrou PIN protège le CONTENU, pas seulement l'ouverture. Sans PIN : la rangée n'affiche pas le dernier message, l'aperçu d'appui long ne montre aucun message, et aucun préchargement ne met en cache les messages d'une conversation verrouillée.

**Mise en œuvre.**

- UNE décision pure : `ConversationLockManager.hidesContent(of:lockedConversationIds:)` (et sa projection d'instance). La liste la résout une fois par rangée (`ConversationRowItem.isContentLocked`) ; le chargeur d'aperçu, le widget et le cliché de l'extension la consultent. Aucun site ne réécrit la règle.
- La seconde ligne d'une rangée est une décision PARTAGÉE par les deux rangs : `ConversationRowLine2Kind` (verrou > frappe > brouillon > aperçu), dont `LentilleConversationRow.Line2Kind` n'est qu'un alias. Verrouillée, elle peint `ConversationLockedPreviewLine` — un cadenas et « Conversation verrouillée » (`preview.conversation_locked`, sept langues, le libellé de l'aperçu scellé) — et VoiceOver dit la même chose. Le nom, l'heure, le badge de non-lus et l'avatar restent : ils disent QUI et QUAND, pas QUOI.
- Le chargeur d'aperçu relit le verrou après chaque attente (cache, réseau) et ne publie jamais pour une conversation verrouillée : un verrou posé pendant un chargement ne laisse ni publication, ni revalidation réseau.
- Le widget publie le libellé du verrou à la place du dernier message ; le cliché App Group déclare le verrou (`ConversationSnapshotPayload.isLocked`) ; tout changement du jeu verrouillé s'annonce (`.conversationContentLocksDidChange`) et `WidgetDataManager.republishForContentLocks` republie ce qui était sorti — jamais après le wipe de logout, jamais sans compte connecté.
- L'extension de notification scelle la charge d'une conversation verrouillée AVANT toute décision (`NSEAttachmentPolicy.sealingLockedConversation` pose `notificationLocKey`, que tous les seconds verrous lisent : média, détail, vignette, lecteur audio, catégorie) et remplace le corps EN DERNIER par `notification.locked_conversation` (huit langues du catalogue de l'extension), après déchiffrement, repli audio, détail et échéance. Les clés de routage restent : toucher la bannière ouvre la conversation, que la porte du routeur garde par le PIN (#11386).

**Conséquences.**

- Le web n'a pas de verrou PIN : rien n'y change.
- La NSE ne connaît le verrou que des 500 conversations du cliché ; un verrou posé l'app tuée avant toute republication ne la rejoint qu'au prochain lancement.
- La NSE continue de déposer le message reçu dans le dossier App Group que l'app fusionne dans le fil : c'est le cache de la conversation elle-même, que seul le PIN ouvre — pas un préchargement d'aperçu.
- Restent hors de ce lot : le toast in-app d'un message reçu et l'aperçu de la recherche globale (#12642). La bannière garde le nom de l'expéditeur et le titre de la conversation (marqué 🔒) : ils disent QUI, pas QUOI.
- Le miroir Kotlin, gelé, n'a rien reçu.
