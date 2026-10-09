import type { InterfaceLanguage } from './interface-language';

/**
 * LE LIEN D'ÉVITEMENT DE LA COQUILLE (#9710) — « Aller au contenu », le premier
 * arrêt du clavier et du lecteur d'écran sur chaque page. Il était EN DUR, en
 * français, sous une interface servie en sept langues.
 *
 * Une table SYNCHRONE, pas une clé du catalogue d'interface : la coquille se
 * peint AVANT que ce catalogue ne soit chargé (`components/shell.tsx` ne
 * l'attend que pour ses menus flottants), et un catalogue lu avant d'être
 * chargé lève.
 */
const SKIP_TO_CONTENT: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'Aller au contenu',
  en: 'Skip to content',
  es: 'Ir al contenido',
  pt: 'Ir para o conteúdo',
  de: 'Zum Inhalt springen',
  it: 'Vai al contenuto',
  ar: 'انتقل إلى المحتوى',
};

export function skipLinkLabel(language: InterfaceLanguage): string {
  return SKIP_TO_CONTENT[language];
}
