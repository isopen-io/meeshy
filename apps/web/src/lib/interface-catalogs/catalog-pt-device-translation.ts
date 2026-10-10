import type { DeviceTranslationCatalogSlice } from './catalog-fr-device-translation';

/** A tradução no dispositivo (#9898) — veja `catalog-fr-device-translation.ts`. */
const ptDeviceTranslation = {
  'settings.device_translation': 'Traduzir neste dispositivo',
  'settings.device_translation.info': 'As mensagens são traduzidas aqui, com um modelo baixado uma única vez: cerca de 110 MB por par de idiomas. Idiomas compatíveis: francês, inglês, espanhol, português, alemão, italiano e árabe. Os outros idiomas continuam sendo traduzidos pelo servidor, nas conversas sem criptografia de ponta a ponta. O que este aparelho traduz é compartilhado com os outros membros da conversa, a menos que suas confirmações de leitura estejam desativadas.',
} satisfies DeviceTranslationCatalogSlice;

export default ptDeviceTranslation;
