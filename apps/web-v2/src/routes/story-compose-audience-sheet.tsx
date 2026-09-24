import type { PostVisibility } from '@meeshy/shared/types/post';

import { Glyph, GlyphSvg, type GlyphShape } from '@/components/glyph';
import { STORY_AUDIENCE_PEOPLE_GLYPHS } from '@/components/glyphs-story-audience-people';
import { Sheet } from '@/components/sheet';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  audienceAvailability,
  audienceLabelKey,
  offeredAudiences,
  type AudienceAvailability,
  type AudienceRefusalKey,
  type ChoosableAudience,
} from '@/lib/stories/publication-audience';
import { CHOOSABLE_AUDIENCE_GLYPH, type AudienceSource } from '@/routes/story-compose-audience';

/**
 * **LA FEUILLE D'AUDIENCE DU STUDIO** (#7683) — la vue `2l` d'iOS
 * (`Composer/ComposerAudienceSheet.swift`), CHARGÉE À LA DEMANDE depuis
 * `story-compose.tsx` : même discipline que `LanguageSheet`/`EffectsSheet`
 * du composeur du fil, elle ne pèse sur le chunk du studio que si l'auteur
 * touche la pastille.
 *
 * Une rangée par audience OFFERTE (`offeredAudiences`, loi D-100) : icône,
 * libellé, sous-titre (`ComposerAudienceSubtitle`,
 * `ComposerAudienceReach.swift:69-93`), coche sur ce qui PARTIRA. Choisir une
 * rangée applique ET ferme (la forme de `language-sheet.tsx`) : la feuille
 * web ne porte que le choix, là où iOS y ajoute mentions et hashtags et a
 * besoin de sa barre « Appliquer ».
 *
 * **Rien choisi ⇒ la rangée du DÉFAUT est la rangée courante**, suffixée
 * « par défaut » : la feuille dit la même chose que la pastille — ce qui
 * partira si l'auteur ne touche à rien. La toucher transforme le défaut en
 * CHOIX (il part alors dans le corps, et se mémorise).
 */

type AudienceSubtitleKey =
  | 'story.studio.audience.subtitle.public'
  | 'story.studio.audience.subtitle.community'
  | 'story.studio.audience.subtitle.friends'
  | 'story.studio.audience.subtitle.private';

/** Les sous-titres des modes CHOISISSABLES — sous `EXCEPT`/`ONLY`, la ligne
 * est la RAISON du refus (`audienceAvailability`), jamais un sous-titre. */
const SUBTITLE_KEY: Readonly<Record<ChoosableAudience, AudienceSubtitleKey>> = {
  PUBLIC: 'story.studio.audience.subtitle.public',
  COMMUNITY: 'story.studio.audience.subtitle.community',
  FRIENDS: 'story.studio.audience.subtitle.friends',
  PRIVATE: 'story.studio.audience.subtitle.private',
};

/** La table de la pastille, ÉTENDUE des deux modes nominatifs — que la
 * feuille seule peint, grisés avec leur raison. */
const AUDIENCE_GLYPH: Readonly<Record<PostVisibility, GlyphShape>> = {
  ...CHOOSABLE_AUDIENCE_GLYPH,
  EXCEPT: STORY_AUDIENCE_PEOPLE_GLYPHS.userMinus,
  ONLY: STORY_AUDIENCE_PEOPLE_GLYPHS.userCheck,
};

const secondLineKey = (availability: AudienceAvailability): AudienceSubtitleKey | AudienceRefusalKey =>
  availability.choosable ? SUBTITLE_KEY[availability.audience] : availability.reasonKey;

export function AudienceSheet({
  lang,
  repostOfId,
  value,
  source,
  onChoose,
  onClose,
}: {
  readonly lang: InterfaceLanguage;
  /** `null` hors republication — le studio n'a pas encore de flux de
   * republication (#7463, seconde tranche) : toujours `null` en pratique
   * aujourd'hui, la loi D-100 étant déjà branchée pour le jour où il en a un. */
  readonly repostOfId: string | null;
  /** Ce qui PARTIRA — la même valeur que la pastille. */
  readonly value: ChoosableAudience;
  readonly source: AudienceSource;
  /** Ne reçoit JAMAIS un mode refusé : le type le dit (`ChoosableAudience`),
   * la rangée grisée n'a aucun effet. */
  readonly onChoose: (audience: ChoosableAudience) => void;
  readonly onClose: () => void;
}) {
  const defaultMark = translate(lang, 'story.studio.audience.defaultMark');
  return (
    <Sheet title={translate(lang, 'story.studio.audience.title')} onClose={onClose}>
      {offeredAudiences({ repostOfId }).map((visibility) => {
        const availability = audienceAvailability(visibility);
        const { choosable } = availability;
        const isCurrent = visibility === value;
        const secondLine = translate(lang, secondLineKey(availability));
        return (
          <li key={visibility}>
            <button
              type="button"
              data-audience-choice={visibility}
              aria-disabled={!choosable}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => {
                if (availability.choosable) onChoose(availability.audience);
              }}
              className="flex w-full items-center gap-3 px-4 text-left"
              style={{ minHeight: 60, color: choosable ? 'var(--color-ios-ink)' : 'var(--color-ios-ink-3)' }}
            >
              <GlyphSvg glyph={AUDIENCE_GLYPH[visibility]} size={22} className="shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-medium">{translate(lang, audienceLabelKey(visibility))}</span>
                <span data-audience-caption className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
                  {isCurrent && source === 'default' ? `${secondLine} · ${defaultMark}` : secondLine}
                </span>
              </span>
              {isCurrent ? <Glyph name="check" size={16} style={{ color: 'var(--accent)' }} /> : null}
            </button>
          </li>
        );
      })}
      <li data-audience-scope className="px-4 py-3 text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
        {translate(lang, 'story.studio.audience.scope')}
      </li>
    </Sheet>
  );
}
