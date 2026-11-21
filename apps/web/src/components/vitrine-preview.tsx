import { useId } from 'react';

import type { RelationLevel } from '@meeshy/shared/types/relation';
import type { ProfileCircleView } from '@meeshy/shared/utils/profile-circle-view';

import { Avatar } from '@/components/avatar';
import { MeeshyChipRow } from '@/components/kit/meeshy-chip-row';
import { MeeshyLockedRow } from '@/components/kit/meeshy-locked-row';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { relationLevelLabel } from '@/lib/relations/level-labels';
import { VITRINE_LEVELS, localVitrineView, vitrinePreviewOf, type VitrineRow } from '@/lib/profile/vitrine-preview';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **MA VITRINE, TELLE QUE LA VOIT UN CERCLE** (#18878, chantier #18857) — l'aperçu « Voir comme ».
 *
 * L'écran ne décide d'AUCUN accès : `view` est le verdict de la loi d'accès partagée
 * (`lib/profile/vitrine-preview.ts`), et chaque rangée fermée dit le cercle qui l'ouvre
 * — jamais la valeur protégée, que la fiche par cercle ne porte pas.
 */

type Row = { readonly language: InterfaceLanguage; readonly row: VitrineRow };

const words = (language: InterfaceLanguage) => ({
  locked: translate(language, 'userProfile.vitrine.words.locked'),
  unlocked: translate(language, 'userProfile.vitrine.words.unlocked'),
  pending: translate(language, 'userProfile.vitrine.words.pending'),
});

function LockedRow({ language, row }: Row) {
  return (
    <MeeshyLockedRow
      title={translate(language, row.labelKey)}
      requirement={translate(language, 'userProfile.vitrine.opensAt', { level: relationLevelLabel(language, row.circle) })}
      words={words(language)}
    />
  );
}

/**
 * Les deux listes d'une vue — « ouvert à ce niveau » puis « masqué à ce niveau » — et rien quand
 * la vue ne porte aucune capacité (cible bloquée, passerelle plus ancienne) : aucune rangée inventée.
 */
export function VitrineCapabilities({
  language,
  view,
  lockedOnly = false,
  lockedTitleKey = 'userProfile.vitrine.locked.title',
  heading: Heading = 'h2',
}: {
  readonly language: InterfaceLanguage;
  readonly view: ProfileCircleView;
  readonly lockedOnly?: boolean;
  readonly lockedTitleKey?: 'userProfile.vitrine.locked.title' | 'userProfile.vitrine.visitor.locked';
  /** `h2` sur une page ; `h3` dans une feuille, dont le titre est déjà un `h2`. */
  readonly heading?: 'h2' | 'h3';
}) {
  const { opened, locked } = vitrinePreviewOf(view);
  const openedId = useId();
  const lockedId = useId();
  return (
    <>
      {lockedOnly || opened.length === 0 ? null : (
        <section data-vitrine-opened="" aria-labelledby={openedId} className="grid gap-2">
          <Heading id={openedId} className="text-caption font-bold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink-secondary, inherit)' }}>
            {translate(language, 'userProfile.vitrine.opened.title')}
          </Heading>
          <ul className="flex flex-wrap gap-2">
            {opened.map((row) => (
              <li key={row.key} data-vitrine-capability={row.key} className="rounded-chip px-3 py-1.5 text-caption font-semibold" style={{ /* harmony-exempt: repli d'un jeton de charte défini (--color-ios-fill), jamais rendu */ backgroundColor: 'var(--color-ios-fill, rgba(127,127,127,.14))' }}>
                {translate(language, row.labelKey)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {locked.length === 0 ? null : (
        <section data-vitrine-locked="" aria-labelledby={lockedId} className="grid gap-2">
          <Heading id={lockedId} className="text-caption font-bold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink-secondary, inherit)' }}>
            {translate(language, lockedTitleKey)}
          </Heading>
          <div className="grid gap-2">
            {locked.map((row) => (
              <LockedRow key={row.key} language={language} row={row} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/**
 * **LA PAGE D'UN VISITEUR SANS COMPTE EST LE NIVEAU PUBLIC** — le même verdict que l'onglet « Public »
 * de « Voir comme », calculé par la même loi : la personne voit exactement ce que son propriétaire
 * a vu en s'aperçevant « comme un inconnu ». Il n'a que ce qui est fermé à lui à montrer, en
 * rangées verrouillées qui disent le cercle qui les ouvre — et aucune action : un visiteur n'a pas de lien.
 */
export function VisitorVitrine({ language, targetId }: { readonly language: InterfaceLanguage; readonly targetId: string }) {
  return (
    <div data-vitrine-visitor="" className="grid gap-4">
      <p className="text-caption font-semibold">{translate(language, 'userProfile.vitrine.visitor.badge')}</p>
      <VitrineCapabilities
        language={language}
        view={localVitrineView({ level: 'PUBLIC', targetId })}
        lockedOnly
        lockedTitleKey="userProfile.vitrine.visitor.locked"
      />
    </div>
  );
}

export type VitrinePreviewProfile = {
  readonly displayName: string | null;
  readonly username: string;
  readonly avatar: string | null;
  readonly bio: string | null;
};

export function VitrinePreview({
  language,
  profile,
  level,
  onLevel,
  view,
  accent = 'var(--color-ios-brand)',
}: {
  readonly language: InterfaceLanguage;
  readonly profile: VitrinePreviewProfile;
  readonly level: RelationLevel;
  readonly onLevel: (next: RelationLevel) => void;
  readonly view: ProfileCircleView;
  readonly accent?: string;
}) {
  const name = profile.displayName ?? profile.username;
  const seenById = useId();
  return (
    <div data-vitrine-preview={level} className="grid gap-5">
      <MeeshyChipRow
        label={translate(language, 'userProfile.vitrine.tabs.label')}
        semantics="tabs"
        mode="single"
        surface="theme"
        layout="scroll"
        chips={VITRINE_LEVELS.map((entry) => ({ id: entry, title: relationLevelLabel(language, entry) }))}
        selection={[level]}
        onChange={(next, tapped) => {
          if (next.includes(tapped)) onLevel(tapped as RelationLevel);
        }}
      />
      <div role="tabpanel" aria-labelledby={seenById} className="grid gap-5">
        <p id={seenById} className="text-caption font-semibold" aria-live="polite">
          {translate(language, 'userProfile.vitrine.seenBy', { level: relationLevelLabel(language, level) })}
        </p>
        <header className="flex items-center gap-4">
          <Avatar initials={initialsOf(name)} color={accent} size={64} name={name} {...(profile.avatar === null ? {} : { src: profile.avatar })} />
          <div className="min-w-0">
            <h3 className="truncate text-screen font-bold">{name}</h3>
            <p className="truncate text-caption">@{profile.username}</p>
          </div>
        </header>
        {profile.bio === null ? null : <p className="text-body">{profile.bio}</p>}
        <VitrineCapabilities language={language} view={view} heading="h3" />
      </div>
    </div>
  );
}
