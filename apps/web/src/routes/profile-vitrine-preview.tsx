import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import type { RelationLevel } from '@meeshy/shared/types/relation';

import { VitrinePreview } from '@/components/vitrine-preview';
import { Sheet } from '@/components/sheet';
import { apiDeps } from '@/lib/api/deps';
import type { MyProfile } from '@/lib/api/profile';
import { profileViewAsQueryOptions } from '@/lib/api/profile-circle';
import { appQueryClient } from '@/lib/api/query-client';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { localVitrineView } from '@/lib/profile/vitrine-preview';

/**
 * **« VOIR COMME »** (#18878) — ma Vitrine telle que chaque cercle la voit, Public en tête.
 *
 * **CACHE D'ABORD, JAMAIS DE SPINNER** : le verdict LOCAL de la loi d'accès (`localVitrineView`) peint
 * l'aperçu au premier rendu et à chaque changement d'onglet ; la passerelle répond ensuite
 * (`?as=<cercle>`, avec mon âge déclaré et mon rôle RÉELS) et son verdict REMPLACE le local. Hors
 * ligne, ou face à une passerelle plus ancienne, le local reste — c'est la même loi, sans mes faits.
 */

export function VitrinePreviewSheet({
  language,
  profile,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly profile: Pick<MyProfile, 'id' | 'username' | 'displayName' | 'avatar' | 'bio'>;
  readonly onClose: () => void;
}) {
  const [level, setLevel] = useState<RelationLevel>('PUBLIC');
  const online = useOnline();
  const local = useMemo(() => localVitrineView({ level, targetId: profile.id }), [level, profile.id]);
  const served = useQuery(
    { ...profileViewAsQueryOptions({ ...apiDeps, handle: profile.username, level }), enabled: online },
    appQueryClient,
  );
  return (
    <Sheet title={translate(language, 'userProfile.vitrine.sheet.title')} bodyAs="div" onClose={onClose}>
      <VitrinePreview
        language={language}
        profile={{ displayName: profile.displayName, username: profile.username, avatar: profile.avatar, bio: profile.bio === '' ? null : profile.bio }}
        level={level}
        onLevel={setLevel}
        view={served.data ?? local}
      />
    </Sheet>
  );
}
