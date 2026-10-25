/**
 * LE CHIFFREMENT D'UNE CONVERSATION EXPLIQUÉ (#12880), FRANÇAIS — la SOURCE des
 * clés `conversationEncryption.*` : la section « Chiffrement » de la feuille de
 * détails, avec les mots de la fiche Chiffrement d'iOS
 * (`ConversationEncryptionExplanation+Text.swift`). Hors du catalogue
 * d'interface, arrivé à son plafond : chargé par la section
 * (`i18n-conversation-encryption-catalog.ts`), jamais au démarrage.
 */
const fr = {
  'conversationEncryption.section': 'Chiffrement',
  'conversationEncryption.summary.none': 'Non chiffrée : les messages sont stockés sans chiffrement sur le serveur',
  'conversationEncryption.summary.server': 'Chiffrée sur le serveur : Meeshy peut lire les messages',
  'conversationEncryption.summary.hybrid': 'Chiffrée sur le serveur (mode hybride) : Meeshy peut lire les messages',
  'conversationEncryption.summary.endToEnd': 'Chiffrée de bout en bout : seuls les appareils des participants lisent les messages',
  'conversationEncryption.topic.whoReads': 'Qui peut lire',
  'conversationEncryption.topic.available': 'Ce qui fonctionne',
  'conversationEncryption.topic.absent': 'Absent dans ce mode',
  'conversationEncryption.topic.notYet': 'Pas encore disponible',
  'conversationEncryption.topic.devices': 'Vos appareils',
  'conversationEncryption.topic.switching': 'Activer ou désactiver',
  'conversationEncryption.fact.transitProtected': 'Entre votre appareil et le serveur, les messages voyagent toujours protégés.',
  'conversationEncryption.fact.storedWithoutEncryption': 'Sur le serveur, les messages sont stockés sans chiffrement : Meeshy peut les lire.',
  'conversationEncryption.fact.encryptedOnServerServerReads': 'Sur le serveur, les messages sont chiffrés avec une clé que Meeshy détient : Meeshy peut les lire pour les traduire et les transcrire.',
  'conversationEncryption.fact.hybridIsServerToday': 'Le mode hybride fonctionne aujourd’hui comme le mode Serveur : les appareils n’ajoutent aucun chiffrement de bout en bout.',
  'conversationEncryption.fact.onlyParticipantsRead': 'Seuls les appareils des participants peuvent lire les messages. Meeshy n’a pas les clés et ne peut pas les lire.',
  'conversationEncryption.fact.everyServerFeature': 'Toutes les fonctions sont disponibles : traduction automatique, transcription des vocaux, aperçu des notifications, recherche.',
  'conversationEncryption.fact.translatedOnDevice': 'La traduction automatique se fait sur votre appareil, jamais sur le serveur.',
  'conversationEncryption.fact.noServerTranscription': 'Le serveur ne transcrit pas les messages vocaux.',
  'conversationEncryption.fact.noNotificationPreview': 'Les notifications n’affichent pas le texte du message : le serveur ne le connaît pas.',
  'conversationEncryption.fact.noSearch': 'La recherche du serveur ne trouve pas ces messages.',
  'conversationEncryption.fact.noEdit': 'Un message envoyé ne peut pas être modifié.',
  'conversationEncryption.fact.noForward': 'Un message ne peut pas être transféré.',
  'conversationEncryption.fact.noOfflineSending': 'Hors connexion, un message n’est pas mis en attente : renvoyez-le une fois connecté.',
  'conversationEncryption.fact.notYetAttachments': 'Photos, vidéos, fichiers, vocaux, lieux et stickers ne peuvent pas encore être envoyés.',
  'conversationEncryption.fact.notYetDecryptedNotifications': 'Le déchiffrement des notifications sur l’appareil, pour en afficher le texte, n’est pas encore disponible.',
  'conversationEncryption.fact.notYetGroups': 'Le chiffrement de bout en bout des groupes n’est pas encore disponible dans l’application.',
  'conversationEncryption.fact.groupSendingUnavailable': 'Dans ce groupe, l’application ne peut pas encore envoyer de message chiffré.',
  'conversationEncryption.fact.notYetSafetyNumbers': 'La vérification des numéros de sécurité avec vos contacts n’est pas encore disponible.',
  'conversationEncryption.fact.oneKeyPerDevice': 'Chaque appareil a sa propre clé, qui ne le quitte jamais.',
  'conversationEncryption.fact.deviceLimit': 'Votre compte peut avoir jusqu’à 16 appareils chiffrés. Au-delà, l’application vous propose d’en retirer un ; un appareil retiré ne lit plus les nouveaux messages chiffrés.',
  'conversationEncryption.fact.restoredDeviceIsNew': 'Un appareil réinstallé ou restauré compte comme un nouvel appareil : il ne lit pas les messages chiffrés reçus avant.',
  'conversationEncryption.fact.whoMayToggle': 'Pendant la phase de test, seuls les membres de la conversation qui ont un rôle d’équipe Meeshy (analyste ou plus) peuvent activer ou désactiver le chiffrement ; dans un groupe, il faut aussi en être modérateur.',
  'conversationEncryption.fact.switchKeepsHistory': 'Une bascule ne change que les nouveaux messages : ceux déjà chiffrés de bout en bout le restent, lisibles sur les appareils qui les ont reçus.',
  'conversationEncryption.fact.switchIsShownInThread': 'Chaque activation ou désactivation s’affiche dans le fil, pour tous les membres.',
  'conversationEncryption.fact.switchNeverResendsInClear': 'Si le chiffrement de bout en bout est désactivé, rien ne part sans lui tant que vous n’avez pas vu ce changement dans le fil ou ne l’avez pas confirmé ici.',
  'conversationEncryption.fact.webCannotReadYet': 'Sur le web, les messages chiffrés de bout en bout ne peuvent pas encore être lus ni écrits : ouvrez cette conversation dans l’application iOS.',
} as const;

export default fr;
