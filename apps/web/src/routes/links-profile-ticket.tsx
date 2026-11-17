import { GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { LINKS_GLYPHS } from '@/components/glyphs-links';
import { MeeshyCodePlate } from '@/components/kit/meeshy-code-card';
import { MeeshyLabeledAction } from '@/components/kit/meeshy-labeled-action';
import { MeeshyTicket } from '@/components/kit/meeshy-ticket';
import { profileShareUrl } from '@/lib/feed/share-url';
import { translateLinkFamilies, type PlainLinkFamiliesKey } from '@/lib/i18n-link-families-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { addressHost } from '@/lib/links/hub-face';

/** Le QR : trois repères et un module, tracés une fois — aucun glyphe du jeu d'écran ne le porte. */
export const QR_GLYPH = (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M20 20v.01M17 20h.01" />
  </svg>
);

const action = (name: string, children: React.ReactNode) => (
  <span key={name} data-links-profile-action={name} style={{ display: 'contents' }}>
    {children}
  </span>
);

/**
 * **LE BILLET DU LIEN DE PROFIL** (#18880, K30 + K31) — mon adresse canonique, son QR en plaque, et
 * le talon : copier, agrandir le QR, envoyer. « Envoyer » n'est dessiné que connecté (`onSend`
 * absent ⇒ aucun bouton qui n'ouvrirait rien). Le partage sans contact est un lot ultérieur.
 */
export function LinksProfileTicket({
  language,
  username,
  onCopy,
  onOpenCode,
  onSend,
}: {
  readonly language: InterfaceLanguage;
  readonly username: string;
  readonly onCopy: () => void;
  readonly onOpenCode: () => void;
  readonly onSend: (() => void) | undefined;
}) {
  const url = profileShareUrl(username);
  const t = (key: PlainLinkFamiliesKey) => translateLinkFamilies(language, key);
  return (
    <section data-links-profile="" aria-label={t('links.face.profile.tag')} lang={language}>
      <MeeshyTicket
        size="hero"
        title={t('links.face.profile.tag')}
        code={addressHost(url)}
        codeTinted
        trailing={<MeeshyCodePlate payload={url} label={t('links.face.profile.codeLabel')} side={72} />}
        stub={
          <div style={{ display: 'flex', gap: 4, justifyContent: 'space-around' }}>
            {action('copy', <MeeshyLabeledAction title={t('links.face.profile.copy')} glyph={<GlyphSvg glyph={LINKS_GLYPHS.copy} size={20} />} onPress={onCopy} />)}
            {action('code', <MeeshyLabeledAction title={t('links.face.profile.code')} label={t('links.face.profile.codeOpen')} glyph={QR_GLYPH} onPress={onOpenCode} />)}
            {onSend === undefined ? null : action('send', <MeeshyLabeledAction title={t('links.face.profile.send')} glyph={<GlyphSvg glyph={FEED_GLYPHS.shareNetwork} size={20} />} onPress={onSend} />)}
          </div>
        }
      />
    </section>
  );
}
