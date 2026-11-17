import { MeeshyButton } from '@/components/kit/meeshy-button';
import { GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { profileShareUrl } from '@/lib/feed/share-url';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { copyPlainText } from '@/lib/view/copy-text';

/**
 * **LA FACE LIENS D'UN AUTRE** (#18879) — l'adresse canonique de sa fiche, à copier ou à envoyer. Les
 * adresses courtes et le QR viennent du contrat « mes adresses » : tant que le serveur ne les sert pas,
 * la face n'en montre aucune (aucune adresse inventée), et le reste part.
 */
export function ProfileLinksFace({
  language,
  username,
  onSend,
  onCopied,
}: {
  readonly language: InterfaceLanguage;
  readonly username: string;
  readonly onSend: (() => void) | undefined;
  readonly onCopied: (message: string, tone: 'neutral' | 'error') => void;
}) {
  const url = profileShareUrl(username);
  const copy = () =>
    void copyPlainText(url).then((outcome) =>
      onCopied(translate(language, outcome === 'copied' ? 'userProfile.relation.links.copied' : 'userProfile.relation.links.copyFailed'), outcome === 'copied' ? 'neutral' : 'error'),
    );
  return (
    <section data-profile-links="" className="grid gap-3">
      <h2 className="text-caption font-bold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink-secondary, inherit)' }}>
        {translate(language, 'userProfile.relation.links.title')}
      </h2>
      <p dir="ltr" className="break-all font-mono text-body">
        {url}
      </p>
      <MeeshyButton title={translate(language, 'userProfile.relation.links.copy')} onPress={copy} />
      {onSend === undefined ? null : (
        <MeeshyButton title={translate(language, 'userProfile.relation.links.send')} glyph={<GlyphSvg glyph={FEED_GLYPHS.shareNetwork} size={18} />} kind="tinted" onPress={onSend} />
      )}
    </section>
  );
}
