/**
 * L'INFORMATION SUR CE QUI PART CHEZ META ET LE SIGNALEMENT D'UN CONTENU WHATSAPP (#17120, chantier #17007) —
 * la source des clés `externalInterop.*`. Chargée par l'écran d'information et la feuille de signalement
 * (`lib/i18n-external-interop-catalog.ts`), jamais au démarrage. Le texte est PROVISOIRE : sa version
 * définitive est l'affaire du juriste (#16999), et change `EXTERNAL_INTEROP_NOTICE_VERSION`.
 */
const fr = {
  'externalInterop.notice.title': 'Écrire à un ami WhatsApp',
  'externalInterop.notice.lead': 'Pour joindre votre ami sur WhatsApp, Meeshy transmet à Meta, qui exploite WhatsApp :',
  'externalInterop.disclosure.phone-number': 'votre numéro de téléphone vérifié, qui vous identifie chez WhatsApp ;',
  'externalInterop.disclosure.profile-name': 'votre nom affiché ;',
  'externalInterop.disclosure.public-keys': 'les clés publiques de chiffrement de vos appareils ;',
  'externalInterop.disclosure.encrypted-content': 'vos messages et médias, chiffrés de bout en bout : Meta ne peut pas les lire ;',
  'externalInterop.disclosure.delivery-metadata': 'qui écrit à qui, quand, la taille des envois et les accusés de réception.',
  'externalInterop.notice.retention': 'Meeshy garde le numéro de votre ami {days} jours après votre dernière ouverture de la conversation, puis l’efface.',
  'externalInterop.notice.retention.unknown': 'Meeshy garde le numéro de votre ami pendant une durée limitée, puis l’efface.',
  'externalInterop.notice.translation': 'La traduction se fait sur votre appareil : Meeshy ne voit jamais le contenu de cette conversation.',
  'externalInterop.notice.withdraw': 'Vous pouvez retirer ce consentement à tout moment : Meeshy efface alors les numéros de vos amis WhatsApp.',
  'externalInterop.notice.accept': 'J’accepte et je continue',
  'externalInterop.notice.accept.busy': 'Enregistrement…',
  'externalInterop.notice.cancel': 'Annuler',
  'externalInterop.notice.outdated': 'Cette information a changé : mettez Meeshy à jour pour la relire avant d’accepter.',
  'externalInterop.notice.unavailable': 'Écrire à un ami WhatsApp n’est pas encore disponible ici.',
  'externalInterop.notice.error': 'Votre consentement n’a pas pu être enregistré. Réessayez.',
  'externalInterop.report.title': 'Signaler ce contenu WhatsApp',
  'externalInterop.report.lead': 'Meeshy ne peut pas lire cette conversation : seul ce que vous choisissez de joindre est transmis à notre équipe de modération.',
  'externalInterop.report.reason': 'Motif',
  'externalInterop.report.attach': 'Joindre le texte du message',
  'externalInterop.report.attach.hint': 'Le texte joint est transmis en clair à la modération de Meeshy.',
  'externalInterop.report.block': 'Bloquer ce contact sur Meeshy',
  'externalInterop.report.submit': 'Envoyer le signalement',
  'externalInterop.report.submit.busy': 'Envoi…',
  'externalInterop.report.cancel': 'Annuler',
  'externalInterop.report.done.title': 'Signalement envoyé',
  'externalInterop.report.done.blocked': 'Ce contact est bloqué : vous ne recevrez plus ses messages sur Meeshy.',
  'externalInterop.report.done.orientation': 'Meeshy ne peut pas agir sur son compte WhatsApp. Pour faire retirer ce contenu de WhatsApp, utilisez le signalement proposé par Meta.',
  'externalInterop.report.done.close': 'Fermer',
  'externalInterop.report.error': 'Le signalement n’a pas pu être envoyé. Réessayez.',
} as const;

export default fr;
