import { useCallback, useId, useState } from 'react';

import { MeeshyChipRow } from '@/components/kit/meeshy-chip-row';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { PROFILE_FACES, PROFILE_FACE_PARAM, requestedFaceOf, resolveProfileFace, type ProfileFace } from '@/lib/profile/relation-face';
import { navigate, useOptionalRoute } from '@/lib/router';

/**
 * **LE SÉLECTEUR DES TROIS FACES** (#18879) — Vitrine · Liens · Actions. La face ouverte se lit dans
 * `?face=` et se réécrit EN PLACE (comme l'onglet) : changer de face n'empile pas d'historique. Hors
 * routeur (un témoin monte la vue seule), elle vit dans l'état local et l'adresse n'est pas touchée.
 * Le sélecteur est le `MeeshyChipRow` en onglets du kit : aucun composant dessiné sur place.
 */
export function useProfileFace(fallback: ProfileFace): readonly [ProfileFace, (face: ProfileFace) => void, string] {
  const route = useOptionalRoute();
  const [local, setLocal] = useState<string | null>(null);
  const idBase = useId();
  const requested = route === null ? local : requestedFaceOf(route.search);
  const active = resolveProfileFace({ requested, fallback });
  const select = useCallback(
    (face: ProfileFace) => {
      setLocal(face);
      if (route === null) return;
      const next = new URLSearchParams(route.search);
      if (face === fallback) next.delete(PROFILE_FACE_PARAM);
      else next.set(PROFILE_FACE_PARAM, face);
      const chain = next.toString();
      navigate(`${window.location.pathname}${chain === '' ? '' : `?${chain}`}`, true);
    },
    [fallback, route],
  );
  return [active, select, idBase] as const;
}

export const profileFacePanelId = (base: string, face: ProfileFace): string => `${base}-face-${face}`;

export function ProfileFaces({ language, active, onChange }: { readonly language: InterfaceLanguage; readonly active: ProfileFace; readonly onChange: (face: ProfileFace) => void }) {
  return (
    <div data-profile-faces="">
      <MeeshyChipRow
        label={translate(language, 'userProfile.relation.faces.label')}
        semantics="tabs"
        mode="single"
        surface="theme"
        layout="scroll"
        chips={PROFILE_FACES.map((face) => ({ id: face, title: translate(language, `userProfile.relation.face.${face}`) }))}
        selection={[active]}
        onChange={(next, tapped) => {
          if (next.includes(tapped)) onChange(tapped as ProfileFace);
        }}
      />
    </div>
  );
}
