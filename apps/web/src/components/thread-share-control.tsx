import { useEffect, useState } from 'react';

import { ChromeActionDisc, CHROME_ACTION_HIT_CLASS } from './chrome-action';
import { GlyphSvg } from './glyph';
import { THREAD_IDENTITY_GLYPHS } from './glyphs-thread-identity';
import { publicWebOrigin } from '@/lib/links/public-origin';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { LINK_ANNOUNCE_MS } from '@/lib/links/link-copy';
import { partagerLien, type PortailPartage } from '@/lib/view/invitation';
import { conversationShareUrl } from '@/lib/view/public-conversation-link';

/**
 * **PARTAGER LA CONVERSATION, À CÔTÉ DE SON AVATAR** (#10206, directive
 * porteur du 2026-10-11 : « puisqu'on ne peut plus ouvrir le détail de
 * conversation, il faut mettre à côté de l'avatar le lien pour partager la
 * conversation ») — miroir `ShareLink` d'iOS.
 *
 * Le geste ouvre la feuille de partage du système (`navigator.share`, ou le
 * pont de la coque Android), sinon copie l'adresse — et la copie se DIT dans
 * une bulle visible sous le bouton, annoncée au lecteur d'écran : une copie
 * muette est un geste sans effet perçu. Une annulation de la feuille ne dit
 * rien : l'utilisateur a décidé.
 *
 * Chargé à part (`ThreadShareButton`) : seuls les fils qui ONT une clé de
 * lien — l'invité, World Wide — paient ce geste ; le chunk du fil reste sous
 * son budget.
 */
export function ThreadShareControl({
  link,
  title,
  portail,
}: {
  readonly link: string;
  readonly title: string;
  /** Injecté par les témoins ; l'application passe par le navigateur. */
  readonly portail?: PortailPartage | undefined;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (notice === null) return undefined;
    const timer = setTimeout(() => setNotice(null), LINK_ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const language = currentInterfaceLanguage();
  const url = conversationShareUrl(link, publicWebOrigin(typeof window === 'undefined' ? '' : window.location.origin));

  const share = () => {
    void partagerLien({ title, text: title, url }, portail).then((issue) => {
      if (issue === 'copie') setNotice(translate(language, 'conversation.details.share.copied'));
      if (issue === 'indisponible') setNotice(translate(language, 'conversation.details.share.unavailable', { url }));
    });
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className={CHROME_ACTION_HIT_CLASS}
        style={{ color: 'var(--accent)' }}
        aria-label={translate(language, 'thread.header.share')}
        data-thread-share
        onClick={share}
      >
        <ChromeActionDisc>
          <GlyphSvg glyph={THREAD_IDENTITY_GLYPHS.export} size={13} />
        </ChromeActionDisc>
      </button>
      <p
        role="status"
        aria-live="polite"
        data-thread-share-notice
        className={notice === null ? 'sr-only' : 'absolute end-0 top-full z-10 mt-1 w-max max-w-64 rounded-chip px-3 py-1.5 text-mini font-semibold'}
        style={notice === null ? undefined : { color: 'var(--color-ios-card)', backgroundColor: 'var(--color-ios-ink)' }}
      >
        {notice ?? ''}
      </p>
    </div>
  );
}
