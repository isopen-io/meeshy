import type { NotificationCategory } from '@/lib/notifications/categories';

import { Glyph, GlyphSvg } from './glyph';
import type { GlyphName } from './glyphs';
import { NOTIFICATIONS_GLYPHS, type NotificationsGlyphName } from './glyphs-notifications';

type CategoryGlyph = { readonly set: 'socle'; readonly name: GlyphName } | { readonly set: 'ecran'; readonly name: NotificationsGlyphName };

/**
 * `NotificationCategory.icon` d'iOS, glyphe pour glyphe (`extract-glyphs.mjs` §
 * NOTIFICATIONS) — UNE table pour le rail de la cloche et pour la pastille de
 * TYPE de la bannière in-app (#8727) : même famille, même icône.
 */
const CATEGORY_GLYPHS: Readonly<Record<NotificationCategory, CategoryGlyph>> = {
  all: { set: 'socle', name: 'bell' },
  unread: { set: 'ecran', name: 'circle' },
  messages: { set: 'ecran', name: 'chatCircle' },
  reactions: { set: 'ecran', name: 'heart' },
  mentions: { set: 'ecran', name: 'at' },
  social: { set: 'ecran', name: 'thumbsUp' },
  contacts: { set: 'ecran', name: 'userPlus' },
  groups: { set: 'ecran', name: 'usersThree' },
  calls: { set: 'socle', name: 'phone' },
  translations: { set: 'ecran', name: 'globe' },
  system: { set: 'ecran', name: 'gear' },
};

export function CategoryGlyphView({ category, size }: { readonly category: NotificationCategory; readonly size: number }) {
  const glyph = CATEGORY_GLYPHS[category];
  return glyph.set === 'socle' ? <Glyph name={glyph.name} size={size} /> : <GlyphSvg glyph={NOTIFICATIONS_GLYPHS[glyph.name]} size={size} />;
}
