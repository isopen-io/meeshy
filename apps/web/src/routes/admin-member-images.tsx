import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/avatar';
import { personInitials, personLabel } from '@/lib/admin/interpret/labels';
import type { AdminDeps } from '@/lib/api/admin';
import { adminUserDetailQueryKey, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import type { ProfileImageKind } from '@/lib/api/profile';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { MemberSection, SectionButton, type SectionState } from './admin-member-parts';
import { AdminUserImageSheet } from './admin-user-image-sheet';

/**
 * **LA PHOTO ET LA BANNIÈRE D'UN MEMBRE, MONTRÉES ET MODIFIÉES** (#8289).
 *
 * Relevé sur staging avant ce lot : la bannière s'affichait dans une bande de
 * 96 px sans repli (une adresse morte peignait l'icône d'image cassée), la
 * photo dans un disque de 44 px, et le seul endroit où on les voyait en
 * grand était un carrousel de 900 px de haut mêlé aux pièces jointes. Ici
 * elles sont composées comme sur le profil — bannière au format 3:1, photo
 * qui la chevauche — et chacune se change par sa feuille, CENTRÉE.
 *
 * L'aperçu est IMMÉDIAT : l'image choisie s'affiche avant même la fin du
 * téléversement (adresse `blob:` locale), et la valeur servie la remplace
 * quand la passerelle a répondu. Un échec retire l'aperçu : l'écran ne
 * garde jamais une image que le serveur n'a pas.
 */
export function AdminMemberImagesSection({
  membre,
  language,
  onAnnounce,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly deps?: AdminDeps;
}) {
  const client = useQueryClient();
  const [feuille, setFeuille] = useState<ProfileImageKind | null>(null);
  const [apercu, setApercu] = useState<Partial<Record<ProfileImageKind, string | null>>>({});
  const [etat, setEtat] = useState<SectionState>({ phase: 'idle' });
  const locales = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of locales.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const avatar = apercu.avatar !== undefined ? apercu.avatar : membre.avatar;
  const banniere = apercu.banner !== undefined ? apercu.banner : membre.banner;

  const previsualiser = (kind: ProfileImageKind, url: string | null) => {
    if (url?.startsWith('blob:') === true) locales.current.push(url);
    setApercu((precedent) => ({ ...precedent, [kind]: url }));
  };
  const oublierApercu = (kind: ProfileImageKind) =>
    setApercu((precedent) => {
      const { [kind]: _oublie, ...reste } = precedent;
      return reste;
    });

  return (
    <MemberSection name="images" titre={translateAdmin(language, 'admin.gallery.title')} language={language} dirty={null} state={etat}>
      <div className="relative" data-admin-member-images="">
        <Banniere url={banniere ?? ''} language={language} />
        <div className="absolute bottom-0 translate-y-1/2 rounded-full p-1" style={{ insetInlineStart: 16, backgroundColor: 'var(--color-ios-surface)' }}>
          <Avatar
            initials={personInitials(personLabel(membre, language))}
            color="var(--color-ios-brand)"
            size={88}
            name={translateAdmin(language, 'admin.gallery.avatar')}
            {...(avatar === null || avatar === '' ? {} : { src: avatar })}
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-10 sm:pt-2">
        <SectionButton data={{ 'data-admin-image-open': 'avatar' }} onClick={() => setFeuille('avatar')}>
          {translateAdmin(language, 'admin.images.avatarOpen')}
        </SectionButton>
        <SectionButton data={{ 'data-admin-image-open': 'banner' }} onClick={() => setFeuille('banner')}>
          {translateAdmin(language, 'admin.images.bannerOpen')}
        </SectionButton>
      </div>

      {feuille === null ? null : (
        <AdminUserImageSheet
          membre={membre}
          kind={feuille}
          language={language}
          deps={deps}
          onClose={() => setFeuille(null)}
          onAnnounce={(texte) => {
            onAnnounce(texte);
            setEtat({ phase: 'saved', message: texte });
          }}
          onPreview={previsualiser}
          onFailed={(kind, message) => {
            oublierApercu(kind);
            setEtat({ phase: 'error', message });
          }}
          onSaved={(aJour, kind) => {
            client.setQueryData(adminUserDetailQueryKey(membre.id), aJour);
            oublierApercu(kind);
            void client.invalidateQueries({ queryKey: ['admin', 'user', membre.id, 'media'] });
            void client.invalidateQueries({ queryKey: ['admin', 'users'] });
          }}
        />
      )}
    </MemberSection>
  );
}

/** La bannière, ou son dégradé quand elle manque — ou quand son adresse ne répond plus. */
function Banniere({ url, language }: { readonly url: string; readonly language: InterfaceLanguage }) {
  const [echec, setEchec] = useState<string | null>(null);
  const montre = url !== '' && echec !== url;
  return (
    <div className="aspect-[3/1] w-full overflow-hidden rounded-card" data-admin-member-banner={montre ? url : ''} style={{ minHeight: 96 }}>
      {montre ? (
        <img
          src={attachmentSrc(url)}
          alt={translateAdmin(language, 'admin.gallery.banner')}
          decoding="async"
          className="block size-full object-cover"
          onError={() => setEchec(url)}
        />
      ) : (
        <span
          aria-hidden="true"
          className="block size-full"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--color-ios-brand) 30%, transparent), color-mix(in srgb, var(--ios-indigo-300) 20%, transparent))',
          }}
        />
      )}
    </div>
  );
}
