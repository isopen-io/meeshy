import { useId } from 'react';

import { MeeshyActionGrid, MeeshyLabeledAction } from '@/components/kit/meeshy-labeled-action';
import { MeeshyLockedRow } from '@/components/kit/meeshy-locked-row';
import { GlyphSvg } from '@/components/glyph';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { relationLevelLabel } from '@/lib/relations/level-labels';
import type { CircleLadder, RelationActionGroup, RelationActionId, RelationActionItem } from '@/lib/profile/relation-face';

/**
 * **LES PIÈCES DE LA FACE ACTIONS D'UN AUTRE** (#18879, chantier #18857) — faites du kit : l'écriture est
 * une action libellée (K32), ce que le cercle ferme est une rangée verrouillée (K37) qui dit le cercle
 * qui l'ouvre, et « Notre cercle » dit le niveau accordé de chaque côté.
 *
 * Ces composants ne décident d'AUCUN accès : ils peignent les verdicts de `relationActionsOf` /
 * `circleLadderOf`, eux-mêmes projection du verdict servi par la passerelle.
 */

const ACT_LABEL: Readonly<Record<RelationActionId, InterfaceCatalogKey>> = {
  write: 'userProfile.relation.act.write',
  call: 'userProfile.relation.act.call',
  talkie: 'userProfile.relation.act.talkie',
  together: 'userProfile.relation.act.together',
  bring: 'userProfile.relation.act.bring',
  location: 'userProfile.relation.act.location',
  battery: 'userProfile.relation.act.battery',
  unreachable: 'userProfile.relation.act.unreachable',
};

const GROUP_LABEL: Readonly<Record<RelationActionGroup, InterfaceCatalogKey>> = {
  speak: 'userProfile.relation.group.speak',
  together: 'userProfile.relation.group.together',
  device: 'userProfile.relation.group.device',
};

const lockedWords = (language: InterfaceLanguage) => ({
  locked: translate(language, 'userProfile.vitrine.words.locked'),
  unlocked: translate(language, 'userProfile.vitrine.words.unlocked'),
  pending: translate(language, 'userProfile.vitrine.words.pending'),
});

/** « Écrire » (ou « Demander à écrire » au cercle Public) : la première action de la face. */
export function RelationWriteAction({
  language,
  item,
  disabled,
  onWrite,
}: {
  readonly language: InterfaceLanguage;
  readonly item: RelationActionItem;
  readonly disabled: boolean;
  readonly onWrite: () => void;
}) {
  if (item.state !== 'open') return null;
  const title = translate(language, item.request === true ? 'userProfile.relation.act.writeRequest' : ACT_LABEL.write);
  return (
    <div data-relation-lead="">
      <MeeshyActionGrid>
        <MeeshyLabeledAction title={title} glyph={<GlyphSvg glyph={PROFILE_GLYPHS.chatCircle} size={24} />} disabled={disabled} onPress={onWrite} />
      </MeeshyActionGrid>
    </div>
  );
}

/** Ce que le cercle commun ferme : une rangée par action, groupées, avec le cercle qui l'ouvre. Rien d'autre. */
export function RelationLockedRows({ language, items }: { readonly language: InterfaceLanguage; readonly items: readonly RelationActionItem[] }) {
  const locked = items.filter((item) => item.state === 'locked');
  const headingId = useId();
  if (locked.length === 0) return null;
  const groups = (['speak', 'together', 'device'] as const).filter((group) => locked.some((item) => item.group === group));
  return (
    <section data-relation-locked="" aria-labelledby={headingId} className="grid gap-3">
      <h2 id={headingId} className="text-caption font-bold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink-secondary, inherit)' }}>
        {translate(language, 'userProfile.vitrine.visitor.locked')}
      </h2>
      {groups.map((group) => (
        <div key={group} data-relation-group={group} className="grid gap-2">
          <h3 className="text-caption font-semibold">{translate(language, GROUP_LABEL[group])}</h3>
          {locked
            .filter((item) => item.group === group)
            .map((item) => (
              <div key={item.id} data-relation-locked-action={item.id}>
                <MeeshyLockedRow
                  title={translate(language, ACT_LABEL[item.id])}
                  requirement={translate(language, 'userProfile.vitrine.opensAt', { level: relationLevelLabel(language, item.circle) })}
                  words={lockedWords(language)}
                />
              </div>
            ))}
        </div>
      ))}
    </section>
  );
}

/** « Notre cercle » : le niveau commun, ce que chacun accorde, et ce qui manque pour monter. */
export function CircleLadderCard({ language, ladder, name }: { readonly language: InterfaceLanguage; readonly ladder: CircleLadder; readonly name: string }) {
  const headingId = useId();
  const level = (value: Parameters<typeof relationLevelLabel>[1]) => relationLevelLabel(language, value);
  const missing = ladder.missing;
  const missingKey: InterfaceCatalogKey | null =
    missing === null
      ? null
      : missing.byViewer && missing.byTarget
        ? 'userProfile.relation.circle.byBoth'
        : missing.byViewer
          ? 'userProfile.relation.circle.byViewer'
          : 'userProfile.relation.circle.byTarget';
  return (
    <section data-relation-circle={ladder.level} aria-labelledby={headingId} className="grid gap-2 rounded-card p-4" style={{ backgroundColor: 'var(--color-ios-fill, rgba(127,127,127,.14))' }}>
      <h2 id={headingId} className="text-body font-bold">
        {translate(language, 'userProfile.relation.circle.title')}
      </h2>
      <p className="text-caption font-semibold">{translate(language, 'userProfile.relation.circle.common', { level: level(ladder.level) })}</p>
      <p data-relation-granted="viewer" className="text-caption">
        {translate(language, 'userProfile.relation.circle.grantedByYou', { level: level(ladder.grantedByViewer) })}
      </p>
      <p data-relation-granted="target" className="text-caption">
        {translate(language, 'userProfile.relation.circle.grantedByThem', { name, level: level(ladder.grantedByTarget) })}
      </p>
      <p data-relation-missing={missing === null ? 'none' : missing.level} className="text-caption">
        {missing === null || missingKey === null
          ? translate(language, 'userProfile.relation.circle.top')
          : translate(language, missingKey, { name, level: level(missing.level) })}
      </p>
    </section>
  );
}
