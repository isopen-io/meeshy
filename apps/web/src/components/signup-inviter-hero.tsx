import { useEffect, useState } from 'react';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import type { InviterCard } from '@/lib/api/affiliate';
import { attachmentSrc } from '@/lib/api/media-url';
import { loadInviteCatalog, translateInvite } from '@/lib/i18n-invite-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * LE CADRE « QUI M'INVITE » DE L'INSCRIPTION (#10559) — bannière de l'invitant
 * (sinon le dégradé de sa couleur), avatar qui mord dessus (sinon ses
 * initiales), « <nom> t'invite sur Meeshy », puis son @pseudo.
 *
 * Même disposition que la carte du groupe d'une invitation
 * (`routes/chat-join-parts.tsx § GroupCard`) : le nom commence SOUS la bannière,
 * sur le fond de la carte — sa lisibilité ne dépend jamais de l'image.
 *
 * Le squelette occupe la MÊME boîte que le cadre : la réponse ne déplace rien.
 * La phrase vient du catalogue des invitations, chargé à la demande ; le temps
 * qu'il arrive, le nom tient sa ligne.
 */

export type InviterHero =
  | { readonly kind: 'none' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'shown'; readonly card: InviterCard };

const CARD = 'var(--color-ios-card)';
const FRAME = 'mb-5 overflow-hidden rounded-[28px]';
const BANNER = 'relative h-[104px]';
const ROW = 'flex min-h-[72px] items-start gap-3.5 px-5 pb-4';
const FRAME_STYLE = { backgroundColor: CARD, boxShadow: '0 18px 40px color-mix(in srgb, var(--ios-indigo-600) 16%, transparent)' } as const;

/** Un nom saisi par un utilisateur, ISOLÉ dans une phrase de l'interface (RTL). */
const isolated = (name: string): string => `⁨${name}⁩`;

const accentGradient = (color: string): string =>
  `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 55%, var(--color-media-backdrop)) 100%)`;

function useInviteCatalog(language: InterfaceLanguage): boolean {
  const [loaded, setLoaded] = useState<InterfaceLanguage | null>(null);
  useEffect(() => {
    let alive = true;
    loadInviteCatalog(language).then(
      () => {
        if (alive) setLoaded(language);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [language]);
  return loaded === language;
}

function InviterHeroCard({ language, card }: { readonly language: InterfaceLanguage; readonly card: InviterCard }) {
  const hasCatalog = useInviteCatalog(language);
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  const banner = card.banner !== null && card.banner !== failedBanner ? card.banner : null;
  const color = colorForName(card.name);
  return (
    <section data-signup-inviter="shown" aria-labelledby="signup-inviter-title" lang={language} className={FRAME} style={FRAME_STYLE}>
      <div data-signup-inviter-banner={banner === null ? 'gradient' : 'image'} className={BANNER} style={{ background: accentGradient(color) }}>
        {banner === null ? null : (
          <img src={attachmentSrc(banner)} alt="" onError={() => setFailedBanner(banner)} className="absolute inset-0 size-full object-cover" />
        )}
      </div>
      <div className={ROW}>
        <span className="relative -mt-7 shrink-0 rounded-full p-[3px]" style={{ backgroundColor: CARD }}>
          <Avatar initials={initialsOf(card.name)} color={color} size={56} name={card.name} {...(card.avatar === null ? {} : { src: card.avatar })} />
        </span>
        <div className="grid min-w-0 gap-0.5 pt-2.5">
          <p id="signup-inviter-title" className="break-words text-thread font-extrabold tracking-tight" style={{ color: 'var(--color-ios-ink)' }}>
            {hasCatalog ? translateInvite(language, 'invite.inviter.onMeeshy', { name: isolated(card.name) }) : isolated(card.name)}
          </p>
          {card.username === null ? null : (
            <p data-signup-inviter-username dir="ltr" className="text-caption text-start" style={{ color: 'var(--color-ios-ink-2)' }}>
              @{card.username}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function InviterHeroPending() {
  const bone = 'color-mix(in srgb, var(--color-ios-ink-3) 22%, transparent)';
  return (
    <div data-signup-inviter="pending" aria-busy="true" className={FRAME} style={FRAME_STYLE}>
      <span aria-hidden="true" className={`block ${BANNER}`} style={{ backgroundColor: bone }} />
      <span aria-hidden="true" className={ROW}>
        <span className="-mt-7 block size-[62px] shrink-0 rounded-full" style={{ backgroundColor: bone, border: `3px solid ${CARD}` }} />
        <span className="mt-3.5 block h-4 w-2/3 rounded-full" style={{ backgroundColor: bone }} />
      </span>
    </div>
  );
}

export function SignupInviterHero({ language, hero }: { readonly language: InterfaceLanguage; readonly hero: InviterHero }) {
  if (hero.kind === 'none') return null;
  if (hero.kind === 'pending') return <InviterHeroPending />;
  return <InviterHeroCard language={language} card={hero.card} />;
}
