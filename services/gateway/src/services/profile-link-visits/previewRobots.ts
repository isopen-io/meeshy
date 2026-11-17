/**
 * Les ROBOTS D'APERÇU et les clients scriptés qui ouvrent une fiche sans être une personne
 * (#19206). Une messagerie qui déplie un lien collé (WhatsApp, Telegram, Slack, Discord…), un
 * moteur qui indexe ou un `curl` ne sont pas des visites : les compter gonflerait le billet
 * « Mon lien » à chaque partage.
 *
 * Une requête SANS agent est traitée comme un robot : aucun navigateur ni aucune application
 * Meeshy n'en envoie. Les bibliothèques HTTP des applications (`okhttp` d'Android,
 * `CFNetwork` d'iOS) ne sont jamais visées.
 */
const PREVIEW_ROBOT = new RegExp(
  [
    'bot\\b', 'bot/', 'crawler', 'spider', 'slurp', 'preview', 'externalhit', 'facebookcatalog',
    'whatsapp', 'telegram', 'slack', 'discord', 'linkedin', 'embedly', 'skypeuripreview',
    'vkshare', 'pinterest', 'snapchat', 'iframely', 'outbrain', 'quora link',
    'curl/', 'wget/', 'python-requests', 'python-urllib', 'go-http-client', 'node-fetch', 'undici', 'headlesschrome',
  ].join('|'),
  'i',
);

export function isPreviewRobot(userAgent: string | undefined): boolean {
  const agent = userAgent?.trim() ?? '';
  return agent.length === 0 || PREVIEW_ROBOT.test(agent);
}
