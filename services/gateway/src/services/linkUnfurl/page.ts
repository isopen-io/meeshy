/**
 * L'APERÇU D'UN LIEN DE CONVERSATION POUR LES ROBOTS (#9712) — ce qui part,
 * balise par balise.
 *
 * Décision : `services/gateway/decisions/2026-10-09-un-lien-de-conversation-se-deplie-chez-les-robots-d-apercu-par-la-passerelle-9712.md`.
 *
 * Ce module ne lit rien et ne décide pas qui a droit à quoi : il reçoit la
 * ligne du lien (ou son absence) et compose la page. Il ne sert que l'HÔTE qui
 * invite et le TITRE — ce que l'aperçu public du lien sert déjà à quiconque le
 * tient — jamais un message, un participant, une description ou un décompte
 * (#5561 : rien de la conversation ne part avant le choix).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { escapeHtml } from '../../utils/sanitize';
import { RECIPIENT_LANG_SELECT, recipientLanguages, type RecipientLanguagePrefs } from '../../utils/recipient-language';
import { isConversationClosed } from '../messaging/conversationWriteAdmission';
import { isShareLinkOpen, shareLinkInviterOf, shareLinkWhereByIdentifier } from '../conversationCard';
import { UNFURL_COPY, unfurlLanguageOf, type UnfurlCopy, type UnfurlLanguage } from './catalog';

/** L'image de marque, générée une fois (`apps/web/scripts/generate-og-image.py`) et servie par l'image web. */
export const LINK_UNFURL_IMAGE = {
  path: '/og/invitation-v1.png',
  width: 1200,
  height: 630,
  type: 'image/png'
} as const;

const TITLE_MAX = 80;
const HOST_MAX = 40;
const DEFAULT_LANGUAGE: UnfurlLanguage = 'fr';

const UNFURLABLE_IDENTIFIER = /^[A-Za-z0-9_.-]{1,128}$/;

/** Un identifiant de lien plausible : `linkId` (`mshy_…`), slug ou id de base. Tout le reste est inconnu. */
export function isUnfurlableIdentifier(identifier: string): boolean {
  return UNFURLABLE_IDENTIFIER.test(identifier);
}

export type LinkUnfurlSource = {
  readonly linkId: string;
  readonly name: string | null;
  readonly isActive: boolean;
  readonly expiresAt: Date | null;
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly conversation: {
    readonly title: string | null;
    readonly isActive: boolean;
    readonly closedAt: Date | null;
  };
  readonly creator: (RecipientLanguagePrefs & {
    readonly displayName: string | null;
    readonly username: string | null;
    readonly isActive: boolean;
    readonly deletedAt: Date | null;
  }) | null;
};

const linkUnfurlSelect = {
  linkId: true,
  name: true,
  isActive: true,
  expiresAt: true,
  maxUses: true,
  currentUses: true,
  conversation: { select: { title: true, isActive: true, closedAt: true } },
  creator: {
    select: {
      displayName: true,
      username: true,
      isActive: true,
      deletedAt: true,
      ...RECIPIENT_LANG_SELECT
    }
  }
} as const;

export async function loadLinkUnfurlSource(prisma: PrismaClient, identifier: string): Promise<LinkUnfurlSource | null> {
  return prisma.conversationShareLink.findFirst({
    where: shareLinkWhereByIdentifier(identifier),
    select: linkUnfurlSelect
  });
}

export type LinkUnfurl = {
  readonly lang: UnfurlLanguage;
  readonly dir: 'ltr' | 'rtl';
  readonly locale: string;
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly linkLabel: string;
};

const LINE_BREAKS = /[\t\n\r\f\v\u2028\u2029]+/g;
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Un texte saisi par un utilisateur, prêt à entrer dans une balise : sans
 * caractère de contrôle ni marque de direction (qui retourneraient l'affichage
 * de l'aperçu entier), espaces resserrés, tronqué. L'échappement HTML vient
 * APRÈS, au rendu.
 */
function cleanUserText(text: string | null | undefined, max: number): string | null {
  const cleaned = (text ?? '').replace(LINE_BREAKS, ' ').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;
  const codePoints = Array.from(cleaned);
  return codePoints.length <= max ? cleaned : `${codePoints.slice(0, max - 1).join('').trimEnd()}…`;
}

/** Les langues de l'`Accept-Language`, de la plus à la moins demandée. */
function acceptedLanguages(header: string | undefined): readonly string[] {
  return (header ?? '')
    .split(',')
    .map((entry, index) => {
      const [tag = '', ...params] = entry.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q === undefined ? 1 : Number.parseFloat(q.slice(2));
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag.length > 0 && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((entry) => entry.tag);
}

const firstServed = (codes: readonly string[]): UnfurlLanguage | null =>
  codes.map(unfurlLanguageOf).find((language): language is UnfurlLanguage => language !== null) ?? null;

/**
 * La langue de l'aperçu : celle de l'HÔTE — la descente de son Prisme, au
 * premier rang que le catalogue sert. Sans hôte ni rang servi, la langue que le
 * robot demande, puis le français.
 */
function unfurlLanguage(creator: LinkUnfurlSource['creator'], acceptLanguage: string | undefined): UnfurlLanguage {
  return firstServed(recipientLanguages(creator)) ?? firstServed(acceptedLanguages(acceptLanguage)) ?? DEFAULT_LANGUAGE;
}

const isOpen = (source: LinkUnfurlSource, now: Date): boolean =>
  isShareLinkOpen(source, now) && !isConversationClosed(source.conversation);

function nameableHost(creator: LinkUnfurlSource['creator']): string | null {
  if (!creator || creator.deletedAt) return null;
  return cleanUserText(shareLinkInviterOf(creator)?.displayName, HOST_MAX);
}

function invitationTitle(copy: UnfurlCopy, host: string | null, title: string | null): string {
  if (host && title) return copy.hostInvitesTo(host, title);
  if (host) return copy.hostInvites(host);
  if (title) return copy.joinTitle(title);
  return copy.genericTitle;
}

export function composeLinkUnfurl(params: {
  readonly source: LinkUnfurlSource | null;
  readonly identifier: string;
  readonly acceptLanguage: string | undefined;
  readonly origin: string;
  readonly now: Date;
}): LinkUnfurl {
  const { source, identifier, acceptLanguage, origin, now } = params;
  const live = source !== null && isUnfurlableIdentifier(identifier) && isOpen(source, now) ? source : null;
  const lang = unfurlLanguage(live?.creator ?? null, acceptLanguage);
  const copy = UNFURL_COPY[lang];
  const shared = {
    lang,
    dir: copy.dir,
    locale: copy.locale,
    imageUrl: `${origin}${LINK_UNFURL_IMAGE.path}`,
    imageAlt: copy.imageAlt
  };

  if (!live) {
    return { ...shared, title: copy.genericTitle, description: copy.genericPromise, url: `${origin}/`, linkLabel: copy.openMeeshy };
  }

  const title = cleanUserText(live.conversation.title, TITLE_MAX) ?? cleanUserText(live.name, TITLE_MAX);
  return {
    ...shared,
    title: invitationTitle(copy, nameableHost(live.creator), title),
    description: copy.invitationPromise,
    url: `${origin}/chat/${encodeURIComponent(identifier)}`,
    linkLabel: copy.openInvitation
  };
}

type MetaTag = readonly [attribute: 'name' | 'property', key: string, value: string];

export function renderLinkUnfurlPage(unfurl: LinkUnfurl): string {
  const tags: readonly MetaTag[] = [
    ['name', 'description', unfurl.description],
    ['name', 'robots', 'noindex, nofollow'],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Meeshy'],
    ['property', 'og:locale', unfurl.locale],
    ['property', 'og:title', unfurl.title],
    ['property', 'og:description', unfurl.description],
    ['property', 'og:url', unfurl.url],
    ['property', 'og:image', unfurl.imageUrl],
    ['property', 'og:image:type', LINK_UNFURL_IMAGE.type],
    ['property', 'og:image:width', String(LINK_UNFURL_IMAGE.width)],
    ['property', 'og:image:height', String(LINK_UNFURL_IMAGE.height)],
    ['property', 'og:image:alt', unfurl.imageAlt],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', unfurl.title],
    ['name', 'twitter:description', unfurl.description],
    ['name', 'twitter:image', unfurl.imageUrl],
    ['name', 'twitter:image:alt', unfurl.imageAlt]
  ];
  const head = tags.map(([attribute, key, value]) => `<meta ${attribute}="${key}" content="${escapeHtml(value)}">`);
  return [
    '<!doctype html>',
    `<html lang="${unfurl.lang}" dir="${unfurl.dir}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(unfurl.title)}</title>`,
    ...head,
    '</head>',
    '<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5">',
    `<h1>${escapeHtml(unfurl.title)}</h1>`,
    `<p>${escapeHtml(unfurl.description)}</p>`,
    `<p><a href="${escapeHtml(unfurl.url)}">${escapeHtml(unfurl.linkLabel)}</a></p>`,
    '</body>',
    '</html>',
    ''
  ].join('\n');
}
