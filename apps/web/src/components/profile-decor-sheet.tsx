import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';

import type { AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import type { AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import type { BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';
import type { ProfileDecorRef, ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';
import type { AppearanceScheme } from '@meeshy/shared/utils/appearance-svg';

import { translateProfileDecor, type ProfileDecorCatalogKey } from '@/lib/i18n-profile-decor-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { appearanceNames, type AppearanceNames } from '@/lib/profile-decor/catalog';
import type { DecorSide } from '@/lib/profile-decor/equip';
import type { OptionGroup } from '@/lib/profile-decor/resolve';
import { nextRadioIndex } from '@/lib/profile-decor/radio-keys';
import { useDecorOptions } from '@/lib/profile-decor/use-decor-options';
import { Link } from '@/routes/route-table';

import { AvatarRing } from './avatar-ring';
import { BannerFrame } from './frame-art';
import { ProfileBannerDesign, useScheme } from './profile-banner-design';
import { Sheet } from './sheet';

/**
 * **LA FEUILLE DU DÉCOR DE PROFIL** (#10632, § 9) — « Bannière », « Cadre »
 * (#10936) et « Contour » : ce que l'utilisateur POSSÈDE et a INSTALLÉ pour le domaine,
 * jamais un pack de la boutique, puis une dernière tuile « Plus dans la
 * boutique » qui ouvre la vitrine filtrée (`?volet=packs&domaine=…`). Deux
 * gestes : ouvrir, toucher un choix. Chaque toucher s'applique tout de suite
 * (`onChoose` est optimiste chez l'hôte) et la feuille se ferme d'elle-même.
 *
 * « Photo » (bannière) retire le design et rend la main à l'image téléversée ;
 * « Aucun » (contour, cadre) retire le contour ou le cadre. Un cadre se montre
 * posé sur une bannière neutre : son centre est transparent. Les noms viennent des chaînes
 * partagées dans la langue de l'interface.
 */

const SHOP_DOMAIN = { avatarRing: 'avatar-ring', banner: 'banner', bannerFrame: 'banner-frame' } as const satisfies Record<DecorSide, string>;
const TILE_LABEL_KEY = { avatarRing: 'profileDecor.none', banner: 'profileDecor.photo', bannerFrame: 'profileDecor.none' } as const satisfies Record<DecorSide, ProfileDecorCatalogKey>;
const TITLE_KEY = { avatarRing: 'profileDecor.ring.title', banner: 'profileDecor.banner.title', bannerFrame: 'profileDecor.frame.title' } as const satisfies Record<DecorSide, ProfileDecorCatalogKey>;
const WIDE = { avatarRing: false, banner: true, bannerFrame: true } as const satisfies Record<DecorSide, boolean>;
const NAME_TABLE = { avatarRing: 'rings', banner: 'designs', bannerFrame: 'frames' } as const satisfies Record<DecorSide, 'rings' | 'designs' | 'frames'>;

type AnyDesign = AvatarRingDesign | AppearanceDesign | BannerFrameDesign;

const TILE_CLASS =
  'relative grid min-h-11 w-full place-items-center gap-1 rounded-card p-2 text-center text-caption focus-visible:outline-2 focus-visible:outline-offset-2';

export const decorChoiceOf = (group: OptionGroup<unknown>, ref: ProfileDecorRef): ServedProfileDecorItem => ({
  pack: ref.pack,
  item: ref.item,
  origin: group.origin,
  contract: group.contract,
});

const sameChoice = (current: ServedProfileDecorItem | null, ref: ProfileDecorRef): boolean => current?.pack === ref.pack && current.item === ref.item;

function Tile({ label, checked, choice, onChoose, children }: { readonly label: string; readonly checked: boolean; readonly choice: string; readonly onChoose: () => void; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      aria-label={label}
      data-decor-choice={choice}
      onClick={onChoose}
      className={TILE_CLASS}
      style={{
        outlineColor: 'var(--color-ios-brand)',
        border: `2px solid ${checked ? 'var(--color-ios-brand)' : 'transparent'}`,
        backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 5%, transparent)',
      }}
    >
      {children}
      <span className="max-w-full truncate" style={{ color: 'var(--color-ios-ink)' }}>
        {label}
      </span>
    </button>
  );
}

const RING_SAMPLE = 48;

const moveFocus = (event: KeyboardEvent<HTMLElement>): void => {
  const group = event.currentTarget;
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
  const from = radios.indexOf(document.activeElement as HTMLElement);
  const rtl = getComputedStyle(group).direction === 'rtl';
  const to = nextRadioIndex(event.key, from < 0 ? 0 : from, radios.length, rtl);
  if (to === null) return;
  event.preventDefault();
  radios[to]?.focus();
};

export function DecorChoices({
  side,
  language,
  groups,
  names,
  current,
  accent,
  scheme,
  onChoose,
}: {
  readonly side: DecorSide;
  readonly language: InterfaceLanguage;
  readonly groups: readonly OptionGroup<AvatarRingDesign>[] | readonly OptionGroup<AppearanceDesign>[] | readonly OptionGroup<BannerFrameDesign>[];
  readonly names: AppearanceNames | null;
  readonly current: ServedProfileDecorItem | null;
  readonly accent: string;
  readonly scheme: AppearanceScheme;
  readonly onChoose: (choice: ServedProfileDecorItem | null) => void;
}) {
  const nameOf = (key: string): string => names?.[NAME_TABLE[side]]?.[key] ?? key;
  const wide = WIDE[side];
  const noneLabel = translateProfileDecor(language, TILE_LABEL_KEY[side]);
  return (
    <div className="grid gap-4 p-4" data-decor-sheet={side}>
      <div role="radiogroup" aria-label={translateProfileDecor(language, TITLE_KEY[side])} className="grid gap-4" onKeyDown={moveFocus}>
        <div className="grid grid-cols-3 gap-2">
          <Tile label={noneLabel} checked={current === null} choice={side === 'banner' ? 'photo' : 'none'} onChoose={() => onChoose(null)}>
            <span aria-hidden="true" className={wide ? 'block aspect-[3/1] w-full rounded-chip' : 'block rounded-chip'} style={{ width: wide ? '100%' : RING_SAMPLE, height: wide ? undefined : RING_SAMPLE, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 12%, transparent)' }} />
          </Tile>
        </div>
        {(groups as readonly OptionGroup<AnyDesign>[]).map((group) => (
          <section key={group.pack} aria-label={names?.packs[group.pack]?.name ?? group.pack} className="grid gap-2">
            <h3 className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
              {names?.packs[group.pack]?.name ?? group.pack}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {group.items.map(({ ref, design }) => (
                <Tile key={ref.item} label={nameOf(ref.item)} checked={sameChoice(current, ref)} choice={ref.item} onChoose={() => onChoose(decorChoiceOf(group, ref))}>
                  {side === 'banner' ? (
                    <span className="block aspect-[3/1] w-full overflow-hidden rounded-chip">
                      <ProfileBannerDesign design={design as AppearanceDesign} accent={accent} scheme={scheme} />
                    </span>
                  ) : side === 'bannerFrame' ? (
                    <span className="relative block aspect-[3/1] w-full overflow-hidden rounded-chip" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 18%, transparent)' }}>
                      <BannerFrame frame={design as BannerFrameDesign} />
                    </span>
                  ) : (
                    <AvatarRing ring={design as AvatarRingDesign} size={RING_SAMPLE}>
                      <span aria-hidden="true" className="block rounded-chip" style={{ width: RING_SAMPLE, height: RING_SAMPLE, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 18%, transparent)' }} />
                    </AvatarRing>
                  )}
                </Tile>
              ))}
            </div>
          </section>
        ))}
      </div>
      <Link
        to="settings"
        search={{ volet: 'packs', domaine: SHOP_DOMAIN[side] }}
        data-decor-shop={SHOP_DOMAIN[side]}
        className="flex min-h-11 items-center justify-center rounded-card px-4 text-body font-semibold focus-visible:outline-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)', backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 10%, transparent)' }}
      >
        {translateProfileDecor(language, 'profileDecor.shop')}
      </Link>
    </div>
  );
}

type ChoicesProps = Omit<Parameters<typeof DecorChoices>[0], 'groups' | 'names' | 'scheme'>;

function ChoicesInEnvironment({ groups, ...rest }: ChoicesProps & { readonly groups: Parameters<typeof DecorChoices>[0]['groups'] }) {
  const scheme = useScheme();
  const [names, setNames] = useState<AppearanceNames | null>(null);
  useEffect(() => {
    let live = true;
    void appearanceNames(rest.language)
      .then((loaded) => live && setNames(loaded))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [rest.language]);
  return <DecorChoices {...rest} groups={groups} names={names} scheme={scheme} />;
}

const RingChoices = (props: ChoicesProps) => <ChoicesInEnvironment {...props} groups={useDecorOptions('avatarRing')} />;
const BannerChoices = (props: ChoicesProps) => <ChoicesInEnvironment {...props} groups={useDecorOptions('banner')} />;
const BannerFrameChoices = (props: ChoicesProps) => <ChoicesInEnvironment {...props} groups={useDecorOptions('bannerFrame')} />;

const CHOICES = { avatarRing: RingChoices, banner: BannerChoices, bannerFrame: BannerFrameChoices } as const satisfies Record<DecorSide, (props: ChoicesProps) => ReactNode>;

export function ProfileDecorSheet({
  side,
  language,
  current,
  accent,
  onChoose,
  onClose,
}: {
  readonly side: DecorSide;
  readonly language: InterfaceLanguage;
  readonly current: ServedProfileDecorItem | null;
  readonly accent: string;
  readonly onChoose: (choice: ServedProfileDecorItem | null) => void;
  readonly onClose: () => void;
}) {
  const Choices = CHOICES[side];
  return (
    <Sheet title={translateProfileDecor(language, TITLE_KEY[side])} bodyAs="div" presentation="bottom" onClose={onClose}>
      <Choices
        side={side}
        language={language}
        current={current}
        accent={accent}
        onChoose={(choice) => {
          onChoose(choice);
          onClose();
        }}
      />
    </Sheet>
  );
}
