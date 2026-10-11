/**
 * LA TRADUCTION SUR L'APPAREIL (#9898), FRANÇAIS — la SOURCE des clés de la
 * rangée de Réglages. Hors du catalogue d'interface, arrivé à son plafond :
 * chargée par la rangée (`i18n-device-translation-catalog.ts`), jamais au
 * démarrage. La légende nomme les sept langues du moteur
 * (`opus-mt-routes.ts`) et la taille mesurée d'une paire (~110 Mo, une seule
 * fois) ; le serveur garde les autres langues dans les conversations non
 * chiffrées de bout en bout. Elle dit aussi que ce qui est traduit ici est
 * PARTAGÉ aux autres membres — sauf accusés de lecture coupés, un partage en
 * étant un (#9899).
 */
const frDeviceTranslation = {
  'settings.device_translation': 'Traduire sur cet appareil',
  'settings.device_translation.info': 'Les messages sont traduits ici, avec un modèle téléchargé une seule fois — environ 110 Mo par paire de langues. Langues prises en charge : français, anglais, espagnol, portugais, allemand, italien et arabe. Les autres langues restent traduites par le serveur, dans les conversations non chiffrées de bout en bout. Ce que cet appareil traduit est partagé avec les autres membres de la conversation, sauf si vos accusés de lecture sont désactivés.',
} as const;

export default frDeviceTranslation;
