import { useCallback, useId, useState, type ReactNode } from 'react';

import { MeeshyChipRow } from '@/components/kit/meeshy-chip-row';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { faceSearch, PROFILE_FACES, requestedFaceOf, resolveProfileFace, type ProfileFace } from '@/lib/profile/relation-face';
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
      const chain = faceSearch({ search: route.search, face, fallback }).toString();
      navigate(`${window.location.pathname}${chain === '' ? '' : `?${chain}`}`, true);
    },
    [fallback, route],
  );
  return [active, select, idBase] as const;
}

export const profileFacePanelId = (base: string, face: ProfileFace): string => `${base}-face-${face}`;

/**
 * Le panneau d'une face, NOMMÉ par sa face : les pastilles du sélecteur ne portent pas d'identifiant à
 * pointer, et un panneau d'onglet sans nom se lit « panneau » au lecteur d'écran, sans dire lequel.
 * Sa colonne est `minmax(0, 1fr)` : une carte de réel dont la largeur naît de sa hauteur (320×568)
 * élargissait sinon la colonne de 2 px, la barre d'onglets en `-mx-4` débordait l'écran, et chaque
 * texte du fil se recoupait autrement.
 */
export function ProfileFacePanel({ language, face, idBase, children }: { readonly language: InterfaceLanguage; readonly face: ProfileFace; readonly idBase: string; readonly children: ReactNode }) {
  return (
    <div role="tabpanel" id={profileFacePanelId(idBase, face)} aria-label={translate(language, `userProfile.relation.face.${face}`)} data-profile-face={face} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      {children}
    </div>
  );
}

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
