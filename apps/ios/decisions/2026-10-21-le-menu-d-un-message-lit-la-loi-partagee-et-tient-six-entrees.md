## 2026-10-21 : Le menu d'un message lit la loi partagée et tient six entrées (#11214)

**Contexte.** Le contexte du menu d'un message (`MessageMenuContext`) se construisait en trois sites — l'overlay d'appui long, la feuille « Plus… » et un menu natif mort — et une quatrième règle d'éditabilité vivait au double toucher. Chacun recomposait les droits : l'édition sans fenêtre (`msg.isMe || isAdminOrMod`), la suppression composée à la main, un `isCurrentUserAdminOrMod` qui oubliait le créateur et pliait la casse que la passerelle compare exactement, l'épinglage ouvert à tous, le signalement offert sur son propre message.

**Décision.**

- Un seul site de production : `MessageMenuContext.make` (`Components/MessageMenuContext+Make.swift`) projette `MessageActionPolicy` (SDK, miroir de `messageActionsFor`). L'overlay, la feuille, le double toucher et l'aperçu d'une pièce le lisent. Une garde de source interdit `MessageMenuContext(` ailleurs dans l'app.
- `ConversationMenuAuthority` (le lecteur `ConversationViewerAuthority` + la conversation telle que la loi la lit) est construite une fois par `ConversationView` (`menuAuthority`) et remise aux couches.
- La liste de l'appui long met **Répondre** en tête (**Réessayer** sur un envoi raté), puis les actions du TYPE (ouvrir et copier le lien, ouvrir dans Plans, copier l'adresse), et tient **six entrées avant « Plus… »**. Au-delà, ce qui a un jumeau dans « Plus… » y passe d'abord — l'export rapide, « Imager », « Copier », « Traduire », « Éditer » ; ce qui n'en a pas (Répondre, les actions du type, Sélectionner, Enregistrer, Composer) reste à un geste.
- « Supprimer pour tous » suit `admitMessageDelete` : l'auteur, sans fenêtre. La fenêtre de 2 h n'existait que dans `ConversationCommandHandler`.
- E2EE, fail-closed : `requestTextTranslation` / `requestAudioTranslation` exigent le régime de la conversation et refusent tout appel serveur pour un message que le serveur ne lit pas (`ServerTranslationAdmission`), le refus étant dit. Transcription et sentiment côté serveur sortent de la feuille.

**Conséquences.** `isDeclaredMinor` n'est pas servi à l'app : le refus des mineurs dans Global reste à la passerelle. Le rôle de conversation se lit tel que servi (minuscules) ; une casse inattendue rend le rang 0, jamais plus. Le miroir Kotlin, gelé, n'a rien reçu.
