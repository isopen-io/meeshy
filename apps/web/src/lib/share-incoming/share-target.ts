/**
 * LE `share_target` DE LA PWA (#8884) — le membre de manifeste qui inscrit
 * Meeshy dans la feuille de partage du système (Android Chrome, ChromeOS,
 * Windows). Déclaré ICI et lu par `vite.config.ts`, pour qu'un témoin puisse
 * le juger sans construire l'application.
 *
 * Le système envoie un `POST /share` multipart ; `public/sw-share-target.js`
 * le reçoit, `routes/share-incoming.tsx` le montre. Les champs portent les
 * noms que le service worker lit (`media`, `title`, `text`, `url`).
 *
 * `image/*` et `video/*` : les mêmes types que l'intent-filter de la coque
 * Android (`AndroidManifest.xml`) — ce que la feuille d'envoi sait envoyer.
 */
export const SHARE_PATH = '/share';

export const SHARE_TARGET: {
  action: string;
  method: 'POST';
  enctype: string;
  params: { title: string; text: string; url: string; files: { name: string; accept: string[] }[] };
} = {
  action: SHARE_PATH,
  method: 'POST',
  enctype: 'multipart/form-data',
  params: {
    title: 'title',
    text: 'text',
    url: 'url',
    files: [{ name: 'media', accept: ['image/*', 'video/*'] }],
  },
};
