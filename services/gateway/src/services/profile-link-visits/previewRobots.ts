/**
 * Les ROBOTS D'APERÇU et les clients scriptés qui ouvrent une fiche sans être une personne
 * (#19206). Une messagerie qui déplie un lien collé (WhatsApp, Telegram, Slack, Discord…), un
 * moteur qui indexe ou un `curl` ne sont pas des visites : les compter gonflerait le billet
 * « Mon lien » à chaque partage.
 *
 * Une requête SANS agent est traitée comme un robot : aucun navigateur ni aucune application
 * Meeshy n'en envoie. « bot » ne se lit qu'en mot ou suivi d'une version : un téléphone CUBOT
 * n'est pas un robot. Les bibliothèques HTTP des applications (`okhttp` d'Android,
 * `CFNetwork` d'iOS) ne sont jamais visées.
 *
 * Seul le ROBOT d'une messagerie est visé (`TelegramBot`, `Slackbot`, `Slack-ImgProxy`, les
 * `…bot/` de LinkedIn, Pinterest et Discord), jamais le nom de l'application : le navigateur
 * INTÉGRÉ de Telegram, Snapchat, LinkedIn, Pinterest ou Slack porte ce nom dans son agent, et
 * c'est une personne qui a touché le lien.
 */
const PREVIEW_ROBOT = new RegExp(
  [
    '(?:^|[^a-z])bot\\b', 'bot/', 'facebot', 'crawler', 'spider', 'slurp', 'preview', 'externalhit', 'facebookcatalog',
    'whatsapp', 'telegrambot', 'slackbot', 'slack-imgproxy', 'embedly', 'skypeuripreview',
    'vkshare', 'iframely', 'outbrain', 'quora link',
    'curl/', 'wget/', 'python-requests', 'python-urllib', 'go-http-client', 'node-fetch', 'undici', 'headlesschrome',
  ].join('|'),
  'i',
);

export function isPreviewRobot(userAgent: string | undefined): boolean {
  const agent = userAgent?.trim() ?? '';
  return agent.length === 0 || PREVIEW_ROBOT.test(agent);
}
