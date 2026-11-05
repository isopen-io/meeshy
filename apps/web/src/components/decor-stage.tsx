import type { ReactNode } from 'react';

import type { AppearanceScheme } from '@meeshy/shared/utils/appearance-svg';

import { attachmentSrc } from '@/lib/api/media-url';

import type { MyProfile } from '@/lib/api/profile';
import { designStyle } from '@/lib/appearance/backdrop-view';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { translatePackPreview } from '@/lib/i18n-pack-preview-catalog';
import type { DecorItem } from '@/lib/packs/decor-items';
import type { DecorDesigns } from '@/lib/profile-decor/use-decor-designs';
import { initialsOf } from '@/lib/view/conversation';

import { Avatar } from './avatar';
import { AvatarRing } from './avatar-ring';
import { BannerFrame } from './frame-art';
import { PackLottieLayer } from './pack-lottie-layer';
import { bannerPaint, bannerSvgMarkup, ProfileBannerDesign, ProfileBannerFrame } from './profile-banner-design';

/**
 * **UN ÉLÉMENT DE DÉCOR, EN VIGNETTE OU POSÉ SUR CE QU'IL DÉCORE** (#16267) —
 * la vignette (fiche du pack, « Autres propositions ») reste FIXE : une grille
 * de vingt films joués coûterait plus qu'elle ne montre. La scène du plein
 * écran pose l'élément sur MOI : un contour sur mon avatar, une bannière ou un
 * cadre sur ma bannière, un fond derrière quelques bulles — et l'élément y
 * joue son animation (Lottie, mouvements) s'il en a une. Décoratif : le nom
 * de l'élément est porté par le contrôle qui l'entoure.
 */

const RING_SAMPLE = 48;
const NEUTRAL_FILL = 'color-mix(in srgb, var(--color-ios-ink) 18%, transparent)';

export function DecorThumb({ item, accent, scheme }: { readonly item: DecorItem; readonly accent: string; readonly scheme: AppearanceScheme }) {
  switch (item.domain) {
    case 'avatar-ring':
      return (
        <span aria-hidden="true" className="grid place-items-center">
          <AvatarRing ring={item.design} size={RING_SAMPLE}>
            <span className="block rounded-full" style={{ width: RING_SAMPLE, height: RING_SAMPLE, backgroundColor: NEUTRAL_FILL }} />
          </AvatarRing>
        </span>
      );
    case 'banner':
      return (
        <span
          aria-hidden="true"
          className="block aspect-[3/1] w-full overflow-hidden rounded-chip [&>svg]:block [&>svg]:size-full"
          dangerouslySetInnerHTML={{ __html: bannerSvgMarkup({ design: item.design, scheme, accent }) }}
        />
      );
    case 'banner-frame':
      return (
        <span aria-hidden="true" className="relative block aspect-[3/1] w-full overflow-hidden rounded-chip" style={{ backgroundColor: NEUTRAL_FILL }}>
          <BannerFrame frame={item.design} />
        </span>
      );
    case 'wallpaper':
      return <span aria-hidden="true" className="block aspect-[3/4] w-full overflow-hidden rounded-chip" style={designStyle({ pack: item.pack, design: item.design, scheme, accent })} />;
  }
}

type StageProps = {
  readonly item: DecorItem;
  readonly profile: MyProfile | undefined;
  readonly mine: DecorDesigns;
  readonly accent: string;
  readonly scheme: AppearanceScheme;
  readonly language: InterfaceLanguage;
};

const nameOf = (profile: MyProfile | undefined): string => profile?.displayName ?? profile?.username ?? '';

function MyAvatar({ profile, accent, size, ring }: { readonly profile: MyProfile | undefined; readonly accent: string; readonly size: number; readonly ring: DecorDesigns['ring'] }) {
  const name = nameOf(profile);
  return <Avatar initials={initialsOf(name === '' ? '?' : name)} color={accent} size={size} name={name} ring={ring} {...(profile?.avatar == null ? {} : { src: profile.avatar })} />;
}

/** Ma bannière telle qu'elle est (photo, design ou dégradé), sur laquelle un cadre se pose. */
function MyBannerPaint({ profile, mine, accent, scheme }: Omit<StageProps, 'item' | 'language'>) {
  const paint = bannerPaint({ image: profile?.banner ?? null, design: mine.banner });
  if (paint.kind === 'design') return <ProfileBannerDesign design={paint.design} accent={accent} scheme={scheme} />;
  if (paint.kind === 'photo') return <img src={attachmentSrc(paint.image)} alt="" className="block size-full object-cover" />;
  return <span aria-hidden="true" className="block size-full" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-ios-brand) 30%, transparent), color-mix(in srgb, var(--color-i300) 20%, transparent))' }} />;
}

function ProfileCard({ banner, profile, mine, accent }: { readonly banner: ReactNode; readonly profile: MyProfile | undefined; readonly mine: DecorDesigns; readonly accent: string }) {
  return (
    <div className="grid w-[min(36rem,100%)] justify-items-center overflow-hidden rounded-card pb-4" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <div className="relative aspect-[3/1] w-full overflow-hidden">{banner}</div>
      <div style={{ marginTop: -40 }}>
        <MyAvatar profile={profile} accent={accent} size={80} ring={mine.ring} />
      </div>
      <p className="mt-1 text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {nameOf(profile)}
      </p>
    </div>
  );
}

const BUBBLES = [
  { key: 'packs.preview.bubble.in1', mine: false },
  { key: 'packs.preview.bubble.out', mine: true },
  { key: 'packs.preview.bubble.in2', mine: false },
] as const;

export function DecorStage({ item, profile, mine, accent, scheme, language }: StageProps) {
  switch (item.domain) {
    case 'avatar-ring':
      return (
        <div data-decor-stage="avatar-ring" className="grid place-items-center">
          <MyAvatar profile={profile} accent={accent} size={200} ring={item.design} />
        </div>
      );
    case 'banner':
      return (
        <div data-decor-stage="banner" className="grid w-full place-items-center">
          <ProfileCard
            profile={profile}
            mine={mine}
            accent={accent}
            banner={
              <>
                <ProfileBannerDesign design={item.design} accent={accent} scheme={scheme} />
                <ProfileBannerFrame frame={mine.bannerFrame} />
              </>
            }
          />
        </div>
      );
    case 'banner-frame':
      return (
        <div data-decor-stage="banner-frame" className="grid w-full place-items-center">
          <ProfileCard
            profile={profile}
            mine={mine}
            accent={accent}
            banner={
              <>
                <MyBannerPaint profile={profile} mine={mine} accent={accent} scheme={scheme} />
                <BannerFrame frame={item.design} />
              </>
            }
          />
        </div>
      );
    case 'wallpaper':
      return (
        <div
          data-decor-stage="wallpaper"
          className="relative flex aspect-[9/16] h-[min(60dvh,36rem)] max-w-full flex-col justify-end gap-2 overflow-hidden rounded-card p-3"
          style={designStyle({ pack: item.pack, design: item.design, scheme, accent })}
        >
          <PackLottieLayer lottie={item.design.lottie} className="absolute inset-0" />
          {BUBBLES.map((bubble) => (
            <p
              key={bubble.key}
              aria-hidden="true"
              className={`relative max-w-[75%] rounded-bubble px-3 py-2 text-body ${bubble.mine ? 'self-end' : 'self-start'}`}
              style={
                bubble.mine
                  ? { backgroundColor: 'var(--color-bubble-mine)', color: 'var(--color-ios-on-brand)' }
                  : { backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', border: '1px solid var(--color-ios-hairline)' }
              }
            >
              {translatePackPreview(language, bubble.key)}
            </p>
          ))}
        </div>
      );
  }
}
