import type { CapacitorConfig } from '@capacitor/cli';

/**
 * VARIANTE B — la coque native.
 *
 * Le contrat de cette variante : le MEME `dist/` que le web, empaquete. Aucune
 * ligne de code applicatif ne connait Capacitor ; c'est la condition pour que
 * la promesse « transformable sans friction » soit vraie plutot qu'annoncee.
 * La construction ne differe que par MEESHY_CIBLE=capacitor, qui bascule la
 * base en chemins relatifs et retire le service worker (la coque gere son
 * propre cycle de vie — deux caches sur le meme bundle se marcheraient dessus).
 */
const config: CapacitorConfig = {
  appId: 'me.meeshy.app',
  appName: 'Meeshy',
  webDir: 'dist',
  android: {
    // Le fond de la WebView pendant le chargement : sans lui, un flash blanc
    // precede l'application en schema sombre, sur l'appareil lent qui est
    // precisement la cible.
    backgroundColor: '#0b0c14',
  },
  ios: {
    backgroundColor: '#0b0c14',
    contentInset: 'never',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
