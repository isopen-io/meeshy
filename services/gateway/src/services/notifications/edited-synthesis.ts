/**
 * #14309 — le corps d'une notification déjà servie, après l'ÉDITION du message
 * qu'elle annonce. Fonctions PURES.
 *
 * Le corps est une SYNTHÈSE (« Message texte · Image haute définition ») : une
 * édition ne change que son premier membre, la longueur du texte. Le reste —
 * ce que sont les pièces jointes, la mention « réponse à votre story » — décrit
 * le message et non son texte, et se reconduit tel quel. Remplacer le corps par
 * le nouveau texte ferait de l'édition le seul chemin par lequel un texte
 * atteindrait encore une notification.
 *
 * Une ligne d'AVANT la synthèse (corps = texte brut, suivi de badges) est
 * réécrite elle aussi : son extrait est remplacé par la synthèse, ce qui retire
 * le texte au premier passage.
 */

import { notificationString } from '@meeshy/shared/utils/notification-strings';

import { textSynthesis, textSynthesisLabels } from './content-synthesis';

const SEPARATOR = ' · ';
const LEGACY_REACTION_QUOTE = /\s:\s«[\s\S]*»$/;

function replaceTextSegment(lang: string, segments: readonly string[], next: string): readonly string[] | null {
  const labels = textSynthesisLabels(lang);
  const index = segments.findIndex((segment) => labels.includes(segment));
  if (index < 0) return null;
  return next
    ? segments.map((segment, i) => (i === index ? next : segment))
    : segments.filter((_, i) => i !== index);
}

function isStoryReplyPrefix(lang: string, segment: string | undefined): boolean {
  return segment === notificationString(lang, 'content.storyReply.yours')
    || segment === notificationString(lang, 'content.storyReply.other');
}

/** Le corps d'un `new_message` / `message_reply` / `user_mentioned` après édition. */
export function editedMessageBody(params: {
  readonly lang: string;
  readonly body: string;
  readonly previousPreview: string;
  readonly nextText: string;
}): string {
  const next = textSynthesis(params.lang, params.nextText);
  const segments = params.body.split(SEPARATOR);
  const replaced = replaceTextSegment(params.lang, segments, next);
  if (replaced) return replaced.join(SEPARATOR);

  if (params.previousPreview !== '' && params.body.startsWith(params.previousPreview)) {
    const rest = params.body.slice(params.previousPreview.length).trim();
    return [next, rest].filter((part) => part !== '').join(' ');
  }

  if (!next) return params.body;
  if (isStoryReplyPrefix(params.lang, segments[0])) {
    return [segments[0], next, ...segments.slice(1)].join(SEPARATOR);
  }
  return [next, ...segments.filter((segment) => segment !== '')].join(SEPARATOR);
}

/** Le corps d'un `message_reaction` après édition : l'action, puis la synthèse du message réagi. */
export function editedReactionBody(params: {
  readonly lang: string;
  readonly body: string;
  readonly nextText: string;
}): string {
  const next = textSynthesis(params.lang, params.nextText);
  const legacy = params.body.replace(LEGACY_REACTION_QUOTE, '');
  const segments = legacy.split(SEPARATOR);
  const replaced = replaceTextSegment(params.lang, segments, next);
  if (replaced) return replaced.join(SEPARATOR);
  return next ? [segments[0], next, ...segments.slice(1)].join(SEPARATOR) : legacy;
}
