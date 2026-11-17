import type { AddressGlyph } from '@meeshy/shared/utils/profile-addresses';

import { GlyphSvg } from '@/components/glyph';
import { LINKS_GLYPHS, type LinksGlyphName } from '@/components/glyphs-links';
import { SECTION_INK_2 } from '@/components/grouped-section';
import { MeeshyTicket } from '@/components/kit/meeshy-ticket';
import type { MyAddress } from '@/lib/api/my-addresses';
import { translateLinkFamilies } from '@/lib/i18n-link-families-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { addressHost } from '@/lib/links/hub-face';
import { SECTION_TITLE_CLASS } from '@/routes/links-parts';

/** Le glyphe choisi par le propriétaire, miroir des huit choix de `Mes-Adresses.dc.html`. */
const ADDRESS_GLYPH: Readonly<Record<AddressGlyph, LinksGlyphName>> = {
  site: 'globeHemisphereWest',
  music: 'vinylRecord',
  photos: 'camera',
  videos: 'filmReel',
  shop: 'storefront',
  contact: 'envelopeSimple',
  agenda: 'calendarBlank',
  favorite: 'heart',
};

/**
 * **MES ADRESSES** (#18880) — la rangée de billets compacts : chacun ouvre son site hors de
 * l'application. La section n'existe que si le serveur en sert au moins une. Une adresse masquée
 * sur la fiche reste ici, dite en toutes lettres : son propriétaire la retrouve.
 */
export function LinksAddresses({ language, addresses }: { readonly language: InterfaceLanguage; readonly addresses: readonly MyAddress[] | null }) {
  if (addresses === null || addresses.length === 0) return null;
  const hidden = translateLinkFamilies(language, 'links.face.addresses.hidden');
  return (
    <section data-links-addresses="" aria-labelledby="links-addresses-title" className="grid gap-2" lang={language}>
      <h2 id="links-addresses-title" className={SECTION_TITLE_CLASS} style={{ color: SECTION_INK_2 }}>
        {translateLinkFamilies(language, 'links.face.addresses.title')}
      </h2>
      <ul className="flex snap-x gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {addresses.map((address) => (
          <li key={address.id} data-links-address={address.id} className="w-44 shrink-0 snap-start">
            <a href={address.url} target="_blank" rel="noopener noreferrer" aria-label={`${address.title}, ${addressHost(address.url)}${address.isShown ? '' : `, ${hidden}`}`} className="block">
              <MeeshyTicket size="compact" title={address.title} code={addressHost(address.url)} glyph={<GlyphSvg glyph={LINKS_GLYPHS[ADDRESS_GLYPH[address.glyph]]} size={16} />} tint="var(--ios-indigo-500)" {...(address.isShown ? {} : { statusLabel: hidden })} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
