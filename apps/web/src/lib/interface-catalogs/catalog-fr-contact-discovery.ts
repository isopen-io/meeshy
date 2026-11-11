/**
 * CE QUE MES CONTACTS SAVENT DE MOI, ET CE QUE J'APPRENDS D'EUX (#8105, #8285)
 * — tranche du catalogue, extraite pour tenir le budget de taille (motif
 * `catalog-fr-quote.ts`) : chaque langue RÉPAND la sienne dans son catalogue.
 * La discrétion de la recherche par identifiant, l'annonce de mon retour sur
 * Meeshy (réglage de l'ÉMETTEUR) et sa réception (préférence du DESTINATAIRE).
 */
const frContactDiscovery = {
  'settings.privacy.hide_from_search': 'Ne pas me proposer à ceux qui ont mon numéro ou mon e-mail',
  'settings.privacy.hide_from_search.info':
    'Vos contacts ne vous retrouveront pas par votre numéro ou votre e-mail, et ne seront pas prévenus de votre arrivée.',
  'settings.privacy.notify_contacts_on_return': 'Prévenir mes contacts quand je reviens sur Meeshy',
  'settings.privacy.notify_contacts_on_return.info':
    'Vos amis et ceux qui ont votre numéro ou votre e-mail voient « était sur Meeshy récemment », au plus une fois toutes les 3 heures. Jamais si votre statut en ligne est masqué.',
  'settings.notif.contact_activity': 'Quand un contact revient sur Meeshy',
} as const;

export type ContactDiscoveryCatalogSlice = Readonly<Record<keyof typeof frContactDiscovery, string>>;

export default frContactDiscovery;
