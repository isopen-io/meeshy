import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import '@/styles/onboarding-profile.css';

import { Avatar } from '@/components/avatar';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import type { ProfileImageKind } from '@/lib/api/profile';
import { appProfileActionDeps } from '@/lib/api/profile-action-deps';
import { performImageUpdate } from '@/lib/api/profile-actions';
import { translateOnboarding } from '@/lib/i18n-onboarding-catalog';
import { loadOnboardingProfileCatalog, translateOnboardingProfile } from '@/lib/i18n-onboarding-profile-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { needsServedPreview } from '@/lib/media/heif';
import { PROFILE_IMAGE_ACCEPT } from '@/lib/profile/image-upload';
import { initialsOf } from '@/lib/view/conversation';

import { CardFrame, type CardHost } from './onboarding-cards';
import { PrimaryButton, SecondaryButton } from './onboarding-visuals';

/**
 * **« MONTRE-TOI »** (#17237) — la carte facultative qui conseille de poser
 * une photo et une bannière dès l'inscription, miroir de la carte iOS du même
 * lot. Elle montre le profil TEL QUE LES AUTRES LE VERRONT (bannière 3:1,
 * avatar rond qui la chevauche, nom et @pseudo), et chaque cible ouvre le
 * sélecteur de fichiers du système.
 *
 * Le téléversement est celui de l'écran Profil (`performImageUpdate`, câblé
 * par `onboarding.tsx`) : recompression, `POST attachments.upload`, puis
 * `PATCH /users/me/avatar|banner` — la session et le cache du profil suivent
 * la valeur servie. L'image choisie s'affiche AUSSITÔT (aperçu local) ; un
 * échec rend l'état d'avant et offre « Réessayer » avec le MÊME fichier.
 *
 * « Continuer » vaut `done` dès qu'une image est posée ou en route ; tant que
 * rien ne l'est, le bouton principal dit « Plus tard » et vaut `skipped` —
 * un second « Plus tard » identique n'apparaît qu'à côté de « Continuer ».
 */

/** La carte arrive dans son propre chunk, AVEC son catalogue (#17237) : le parcours ne paie ni l'une ni l'autre avant d'y entrer. */
export const prepareProfileCard = (language: InterfaceLanguage): Promise<unknown> => loadOnboardingProfileCatalog(language);

/** Le téléversement de l'écran Profil (`performImageUpdate`) : la session, le cache du profil et la fiche publique suivent la valeur servie. */
export async function uploadWithProfilePath(kind: ProfileImageKind, file: Blob): Promise<ProfileImageUpload> {
  const outcome = await performImageUpdate({ kind, file, deps: appProfileActionDeps() });
  if (outcome.status === 'saved') return { status: 'saved', url: outcome.url };
  return outcome.status === 'cancelled' ? { status: 'cancelled' } : { status: 'failed' };
}

export type ProfileImageUpload = { readonly status: 'saved'; readonly url: string } | { readonly status: 'failed' } | { readonly status: 'cancelled' };

type Slot = {
  readonly url: string | null;
  readonly pending: string | null;
  readonly failed: Blob | null;
};

const idle = (url: string | null): Slot => ({ url, pending: null, failed: null });

const PREVIEW_PENDING = '';

const KINDS = ['banner', 'avatar'] as const satisfies readonly ProfileImageKind[];

export async function localPreview(file: Blob): Promise<string | null> {
  if (file instanceof File && (await needsServedPreview(file))) return null;
  return URL.createObjectURL(file);
}

const revoke = (url: string | null) => {
  if (url !== null && url.startsWith('blob:')) URL.revokeObjectURL(url);
};

export function ProfileCard({
  host,
  userId,
  name,
  handle,
  avatar,
  banner,
  upload,
  preview = localPreview,
  onDone,
  onLater,
}: {
  readonly host: CardHost;
  readonly userId: string | null;
  readonly name: string;
  readonly handle: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly upload: (kind: ProfileImageKind, file: Blob) => Promise<ProfileImageUpload>;
  readonly preview?: (file: Blob) => Promise<string | null>;
  readonly onDone: () => void;
  readonly onLater: () => void;
}) {
  const lang = host.lang;
  const [slots, setSlots] = useState<Readonly<Record<ProfileImageKind, Slot>>>(() => ({ avatar: idle(avatar), banner: idle(banner) }));
  const inputs = useRef<Partial<Record<ProfileImageKind, HTMLInputElement | null>>>({});
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const patch = (kind: ProfileImageKind, update: (slot: Slot) => Slot) => {
    if (alive.current) setSlots((current) => ({ ...current, [kind]: update(current[kind]) }));
  };

  const send = async (kind: ProfileImageKind, file: Blob) => {
    const local = await preview(file);
    patch(kind, (slot) => ({ ...slot, pending: local ?? PREVIEW_PENDING, failed: null }));
    const outcome = await upload(kind, file);
    revoke(local);
    if (outcome.status === 'saved') return patch(kind, () => idle(outcome.url));
    patch(kind, (slot) => ({ url: slot.url, pending: null, failed: outcome.status === 'failed' ? file : null }));
  };

  const picked = (kind: ProfileImageKind, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file !== undefined) void send(kind, file);
  };

  const initial: Readonly<Record<ProfileImageKind, string | null>> = { avatar, banner };
  const posed = KINDS.some((kind) => slots[kind].pending !== null || slots[kind].url !== initial[kind]);
  const failedKind = KINDS.find((kind) => slots[kind].failed !== null);
  const shownOf = (kind: ProfileImageKind): string | null => {
    const slot = slots[kind];
    return slot.pending !== null && slot.pending !== PREVIEW_PENDING ? slot.pending : slot.url;
  };
  const bannerShown = shownOf('banner');
  const avatarShown = shownOf('avatar');
  const color = authorAccentColor(userId, name);

  return (
    <CardFrame
      step="profile"
      title={translateOnboardingProfile(lang, 'onboarding.profile.title')}
      body={translateOnboardingProfile(lang, 'onboarding.profile.body')}
      illustration={null}
      actions={
        <>
          <PrimaryButton id="profile.continue" onClick={posed ? onDone : onLater}>
            {translateOnboarding(lang, posed ? 'onboarding.continue' : 'onboarding.later')}
          </PrimaryButton>
          {posed ? (
            <SecondaryButton id="profile.later" onClick={onLater}>
              {translateOnboarding(lang, 'onboarding.later')}
            </SecondaryButton>
          ) : null}
        </>
      }
    >
      <ul className="onb-profile-perks">
        <li>
          <Glyph name="eye" size={18} />
          <span>{translateOnboardingProfile(lang, 'onboarding.profile.visibility')}</span>
        </li>
        <li>
          <Glyph name="users" size={18} />
          <span>{translateOnboardingProfile(lang, 'onboarding.profile.contacts')}</span>
        </li>
      </ul>

      <div className="onb-profile-preview">
        <button
          type="button"
          className="onb-profile-banner"
          data-onb-profile-pick="banner"
          aria-label={translateOnboardingProfile(lang, 'onboarding.profile.pickBanner')}
          aria-busy={slots.banner.pending !== null || undefined}
          disabled={!host.online}
          onClick={() => inputs.current.banner?.click()}
        >
          {bannerShown === null ? (
            <span className="onb-profile-banner-empty" aria-hidden="true">
              <GlyphSvg glyph={PROFILE_GLYPHS.camera} size={22} />
              <span>{translateOnboardingProfile(lang, 'onboarding.profile.addBanner')}</span>
            </span>
          ) : (
            <img src={bannerShown} alt="" data-onb-profile-image="banner" />
          )}
          {slots.banner.pending === null ? null : <span className="onb-profile-progress" data-onb-profile-pending="banner" aria-hidden="true" />}
        </button>

        <button
          type="button"
          className="onb-profile-avatar"
          data-onb-profile-pick="avatar"
          aria-label={translateOnboardingProfile(lang, 'onboarding.profile.pickAvatar')}
          aria-busy={slots.avatar.pending !== null || undefined}
          disabled={!host.online}
          onClick={() => inputs.current.avatar?.click()}
        >
          <Avatar initials={initialsOf(name)} color={color} size={96} {...(avatarShown === null ? {} : { src: avatarShown })} />
          {slots.avatar.pending === null ? null : <span className="onb-profile-progress" data-onb-profile-pending="avatar" aria-hidden="true" />}
          <span className="onb-profile-badge" aria-hidden="true">
            <Glyph name="plus" size={14} />
          </span>
        </button>

        <p className="onb-profile-name">
          <bdi>{name}</bdi>
        </p>
        {handle === null || handle === '' ? null : (
          <p className="onb-profile-handle" dir="ltr">
            @{handle}
          </p>
        )}
      </div>

      {KINDS.map((kind) => (
        <input
          key={kind}
          ref={(element) => {
            inputs.current[kind] = element;
          }}
          type="file"
          accept={PROFILE_IMAGE_ACCEPT}
          hidden
          tabIndex={-1}
          aria-hidden="true"
          data-onb-profile-input={kind}
          onChange={(event) => picked(kind, event)}
        />
      ))}

      {failedKind === undefined ? null : (
        <div role="alert" className="onb-profile-error">
          <span className="onb-error">{translateOnboardingProfile(lang, 'onboarding.profile.failed')}</span>
          <button
            type="button"
            className="onb-secondary onb-profile-retry"
            data-onb-action="profile.retry"
            onClick={() => {
              const file = slots[failedKind].failed;
              if (file !== null) void send(failedKind, file);
            }}
          >
            {translateOnboardingProfile(lang, 'onboarding.profile.retry')}
          </button>
        </div>
      )}
      {!host.online ? <p className="onb-note">{translateOnboarding(lang, 'onboarding.offline')}</p> : null}
    </CardFrame>
  );
}
