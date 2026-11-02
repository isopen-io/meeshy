/**
 * LE CHIFFREMENT D'UNE CONVERSATION EXPLIQUÉ (#12880), FRANÇAIS — la SOURCE des
 * clés `conversationEncryption.*` : la section « Chiffrement » de la feuille de
 * détails, avec les mots de la fiche Chiffrement d'iOS
 * (`ConversationEncryptionExplanation+Text.swift`), et le choix du mode à
 * l'écran de création (`conversationEncryption.creation.*`, décision du
 * 2026-11-01, dont ce fichier porte les mots). Aucune phrase ne dit que le
 * serveur « peut lire » : l'utilisateur lit ce qui le concerne, jamais qui
 * détient une clé. Hors du catalogue
 * d'interface, arrivé à son plafond : chargé par la section
 * (`i18n-conversation-encryption-catalog.ts`), jamais au démarrage.
 */
const fr = {
  'conversationEncryption.section': 'Chiffrement',
  'conversationEncryption.summary.none': 'Conversation créée avant le chiffrement systématique : ses messages ne sont pas chiffrés',
  'conversationEncryption.summary.server': 'Chiffrée sur nos serveurs',
  'conversationEncryption.summary.hybrid': 'Chiffrée sur nos serveurs (mode hybride)',
  'conversationEncryption.summary.endToEnd': 'Chiffrée de bout en bout : seuls les appareils des participants lisent les messages',
  'conversationEncryption.topic.whoReads': 'Protection des messages',
  'conversationEncryption.topic.available': 'Ce qui fonctionne',
  'conversationEncryption.topic.absent': 'Absent dans ce mode',
  'conversationEncryption.topic.notYet': 'Pas encore disponible',
  'conversationEncryption.topic.devices': 'Vos appareils',
  'conversationEncryption.topic.switching': 'Changer de mode',
  'conversationEncryption.topic.permanence': 'Définitif',
  'conversationEncryption.fact.transitProtected': 'Entre votre appareil et le serveur, les messages voyagent toujours protégés.',
  'conversationEncryption.fact.storedWithoutEncryption': 'Cette conversation a été créée avant que le chiffrement devienne systématique : ses messages sont stockés sans chiffrement. Toute nouvelle conversation est chiffrée.',
  'conversationEncryption.fact.encryptedOnServerServerReads': 'Vos messages sont chiffrés sur nos serveurs. La traduction, la transcription et la recherche restent disponibles.',
  'conversationEncryption.fact.hybridIsServerToday': 'Le mode hybride chiffre aujourd’hui comme le mode Serveur ; le double chiffrement par vos appareils arrive bientôt.',
  'conversationEncryption.fact.onlyParticipantsRead': 'Seuls les appareils des participants peuvent lire les messages. Meeshy n’a pas les clés et ne peut pas les lire. Une réserve, tant que la vérification des numéros de sécurité n’est pas disponible : un serveur piraté pourrait ajouter en secret un appareil au nom d’un contact, sans que vous le voyiez.',
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
  'conversationEncryption.fact.whoMayToggle': 'Pendant la phase de test, seuls les membres de la conversation qui ont un rôle d’équipe Meeshy (analyste ou plus) peuvent changer son mode de chiffrement ; dans un groupe, il faut aussi en être modérateur.',
  'conversationEncryption.fact.switchKeepsHistory': 'Un changement de mode ne touche que les nouveaux messages : ceux déjà chiffrés de bout en bout le restent, lisibles sur les appareils qui les ont reçus.',
  'conversationEncryption.fact.switchIsShownInThread': 'Chaque changement de mode s’affiche dans le fil, pour tous les membres.',
  'conversationEncryption.fact.endToEndIsFinal': 'Une fois activé, le chiffrement de bout en bout ne se désactive plus.',
  'conversationEncryption.fact.endToEndNeverTurnedOff': 'Le chiffrement de bout en bout ne se désactive jamais. Vous pourrez toujours ouvrir une autre conversation, sans chiffrement de bout en bout, avec les mêmes personnes.',
  'conversationEncryption.fact.endToEndNeverTurnedOffDirect': 'Le chiffrement de bout en bout ne se désactive jamais : ce tête-à-tête le reste. Vous pouvez toujours ouvrir, à côté, une conversation sans chiffrement de bout en bout avec cette personne : les deux sont dans la liste, celle-ci marquée d’un cadenas.',
  'conversationEncryption.fact.serverCannotTurnItOff': 'Sur ce navigateur, une fois cette conversation vue chiffrée de bout en bout, votre compte n’y écrit plus jamais sans ce chiffrement, même si le serveur la présentait ensuite autrement.',
  'conversationEncryption.fact.webCannotReadYet': 'Sur le web, les messages chiffrés de bout en bout ne peuvent pas encore être lus ni écrits : ouvrez cette conversation dans l’application iOS.',
  'conversationEncryption.plaintextDirect.open': 'Ouvrir une conversation sans chiffrement de bout en bout avec {name}',
  'conversationEncryption.plaintextDirect.busy': 'Ouverture…',
  'conversationEncryption.plaintextDirect.failed': 'La conversation sans chiffrement de bout en bout n’a pas pu être ouverte. Réessayez.',
  'conversationEncryption.plaintextDirect.offline': 'Hors connexion : reconnectez-vous pour ouvrir la conversation sans chiffrement de bout en bout.',
  'conversationEncryption.creation.server.title': 'Serveur',
  'conversationEncryption.creation.server.detail': 'Vos messages sont chiffrés sur nos serveurs. Traduction, transcription et recherche fonctionnent.',
  'conversationEncryption.creation.hybrid.title': 'Hybride',
  'conversationEncryption.creation.hybrid.detail': 'Chiffré sur nos serveurs, comme Serveur. Le double chiffrement par vos appareils arrive bientôt.',
  'conversationEncryption.creation.endToEnd.title': 'Bout en bout',
  'conversationEncryption.creation.unavailable.groupsNotYet': 'Bientôt disponible pour les groupes',
  'conversationEncryption.creation.unavailable.clientNotYet': 'Bientôt disponible sur le web',
} as const;

export default fr;
