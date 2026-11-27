import type { ContactDiscoveryCatalogSlice } from './catalog-fr-contact-discovery';

/** Ce que mes contacts savent de moi, et ce que j'apprends d'eux (#8105, #8285) — miroir de `catalog-fr-contact-discovery.ts`. */
const ptContactDiscovery = {
  'settings.privacy.hide_from_search': 'Ocultar meu número e meu e-mail',
  'settings.privacy.hide_from_search.info':
    'Seus contatos não vão te encontrar pelo seu número ou e-mail, e não serão avisados da sua chegada.',
  'settings.privacy.notify_contacts_on_return': 'Anunciar meu retorno',
  'settings.privacy.notify_contacts_on_return.info':
    'Seus amigos e quem tem seu número ou e-mail veem “esteve no Meeshy recentemente”, no máximo uma vez a cada 3 horas. Nunca se o seu status online estiver oculto.',
  'settings.notif.contact_activity': 'Retorno de um contato',
  'settings.notif.contact_activity.info': 'Uma notificação quando um contato volta ao Meeshy.',
  'settings.notif.blood_proximity': 'Alguém do meu Sangue por perto',
  'settings.notif.blood_proximity.info': 'Uma notificação quando alguém do seu Sangue se aproxima, para ver vocês dois no mapa.',
  'settings.notif.bring': 'Receber Brings',
  'settings.notif.bring.info':
    'Uma pessoa próxima pode fazer seu telefone tocar numa emergência extrema, mesmo no silencioso. Desativado, ninguém poderá fazer você tocar.',
  'settings.notif.together': 'Receber convites «juntos»',
  'settings.notif.together.info':
    'Uma pessoa próxima pode convidar você para assistir ou ouvir juntos um vídeo ou um áudio. Desativado, ninguém poderá convidar você.',
} satisfies ContactDiscoveryCatalogSlice;

export default ptContactDiscovery;
