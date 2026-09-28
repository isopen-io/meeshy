import { hexColorCss } from '@/lib/canvas/background';
import type { StoryFilterId } from '@/lib/canvas/media-filter';
import { SERVED_TEXT_STYLES, sceneTextAppearance } from '@/lib/canvas/text-appearance';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioPose } from '@/lib/stories/studio-pose';
import { STUDIO_TEXT_LANGUAGES, type StudioTextLayer } from '@/lib/stories/studio-text';

import { StudioAltField, StudioFilterSection, StudioSection as Section } from './story-compose-media-fields';
import { StudioChip } from './story-compose-parts';

/**
 * **LE RAIL D'ÉDITION D'UN OBJET** (#6943) — le couloir DROIT du plateau
 * (« à DROITE les dimensions des objets », `apps/ios/CLAUDE.md` § 1). Aucun
 * de ces contrôles ne se pose SUR la scène : la géographie du dépôt est
 * explicite, et #4561/#4633 l'ont tranchée contre le document des vues.
 *
 * Il sert la grammaire de `ComposerObjectEditorRail.swift` dans l'ordre de
 * ses outils — **style, effet, couleur, alignement, fond, langue** —, plus la
 * POSE, qu'iOS confie au pincement à deux doigts et que le web doit rendre
 * atteignable au clavier (dimension 5).
 *
 * **Les DIX-HUIT familles de `StoryTextStyle` y sont** depuis #6951 : les cinq
 * à coût nul, et les treize qu'iOS rend par une police embarquée, désormais
 * peintes par un substitut redistribuable chargé à la demande
 * (`lib/canvas/story-fonts.ts`). La pastille se peint dans sa propre famille,
 * donc une police qui n'arrive pas SE VOIT — la pastille reste sur la pile
 * native, comme le texte de la scène.
 */

/**
 * Une clé de libellé par famille SERVIE. `satisfies Record<ServedTextStyle, …>`
 * en fait un INVENTAIRE que la compilation tient : offrir une famille que le
 * moteur ne peint pas, ou peindre une famille que le rail n'offre pas, sont
 * les deux moitiés du même défaut — « une famille à moitié servie est pire
 * que son absence » (#6951). `story-compose-styles.test.ts` le redit à
 * l'exécution, les deux gates couvrant des ensembles disjoints.
 */
export const STUDIO_STYLE_KEYS = {
  bold: 'story.studio.style.bold',
  neon: 'story.studio.style.neon',
  typewriter: 'story.studio.style.typewriter',
  handwriting: 'story.studio.style.handwriting',
  classic: 'story.studio.style.classic',
  calligraphy: 'story.studio.style.calligraphy',
  cartoon: 'story.studio.style.cartoon',
  futuristic: 'story.studio.style.futuristic',
  fantasy: 'story.studio.style.fantasy',
  curve: 'story.studio.style.curve',
  tag: 'story.studio.style.tag',
  italic: 'story.studio.style.italic',
  retro: 'story.studio.style.retro',
  elegant: 'story.studio.style.elegant',
  poster: 'story.studio.style.poster',
  bubble: 'story.studio.style.bubble',
  note: 'story.studio.style.note',
  brush: 'story.studio.style.brush',
} as const satisfies Record<StudioTextLayer['style'], InterfaceCatalogKey>;

/** L'ordre des pastilles est celui des pickers iOS (`StoryTextStyle.allCases`,
 * projeté par `SERVED_TEXT_STYLES`) — jamais celui de l'objet ci-dessus, dont
 * la forme sert l'inventaire et pas l'affichage. */
const STYLES = SERVED_TEXT_STYLES.map((id) => ({ id, key: STUDIO_STYLE_KEYS[id] }));

/** Six effets NOMMÉS sur les vingt-cinq de la table (`text-effect.ts`) — un
 * nom traduit par effet coûte sept lignes de catalogue, et six couvrent les
 * familles de la table : lueur, néon, contour, ombre, ombre portée, relief.
 * Les dix-neuf autres restent lisibles par un document venu d'iOS, que le
 * moteur peint déjà — ils ne sont simplement pas PROPOSÉS ici. */
const EFFECTS = [
  { id: 'glow', key: 'story.studio.effect.glow' },
  { id: 'neon', key: 'story.studio.effect.neon' },
  { id: 'outline', key: 'story.studio.effect.outline' },
  { id: 'shadow', key: 'story.studio.effect.shadow' },
  { id: 'longShadow', key: 'story.studio.effect.longShadow' },
  { id: 'emboss', key: 'story.studio.effect.emboss' },
] as const satisfies readonly { readonly id: StudioTextLayer['effect']; readonly key: InterfaceCatalogKey }[];

/** Huit couleurs NOMMÉES sur les quatorze de la palette iOS — une pastille
 * sans nom ne se choisit pas au lecteur d'écran, et un nom par couleur se
 * paie en catalogue. */
const COLORS = [
  { hex: 'FFFFFF', key: 'story.studio.color.FFFFFF' },
  { hex: '000000', key: 'story.studio.color.000000' },
  { hex: 'FF2E63', key: 'story.studio.color.FF2E63' },
  { hex: '08D9D6', key: 'story.studio.color.08D9D6' },
  { hex: 'F8B500', key: 'story.studio.color.F8B500' },
  { hex: '9B59B6', key: 'story.studio.color.9B59B6' },
  { hex: '2ECC71', key: 'story.studio.color.2ECC71' },
  { hex: '3498DB', key: 'story.studio.color.3498DB' },
] as const satisfies readonly { readonly hex: string; readonly key: InterfaceCatalogKey }[];

/** Les trois alignements. Le GLYPHE est un tracé local — le jeu de glyphes du
 * dépôt n'en porte pas pour l'alignement, et en ajouter au registre partagé
 * (`glyphs-*.ts`) toucherait une surface que d'autres lots écrivent. */
const ALIGNS = [
  { id: 'left', key: 'story.studio.align.left', bars: [1, 0.6, 1, 0.6] },
  { id: 'center', key: 'story.studio.align.center', bars: [1, 0.6, 1, 0.6] },
  { id: 'right', key: 'story.studio.align.right', bars: [1, 0.6, 1, 0.6] },
] as const satisfies readonly { readonly id: StudioTextLayer['align']; readonly key: InterfaceCatalogKey; readonly bars: readonly number[] }[];

/** Quatre traits, alignés comme le texte qu'ils désignent. */
function AlignGlyph({ align, bars }: { readonly align: 'left' | 'center' | 'right'; readonly bars: readonly number[] }) {
  return (
    <span aria-hidden="true" className="flex w-[18px] flex-col gap-[2px]" style={{ alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }}>
      {bars.map((width, index) => (
        <span key={index} className="block rounded-full" style={{ width: `${width * 100}%`, height: 2, backgroundColor: 'currentColor' }} />
      ))}
    </span>
  );
}

/** Les langues du sélecteur iOS (`TextEditToolOptions.swift:454-460`) — les
 * sept de l'app, dans leur ordre. Le code s'affiche en majuscules, comme la
 * barre d'édition iOS (`StoryTextEditTopBar.swift:84`). */
const LANGUAGES = STUDIO_TEXT_LANGUAGES;

export type StudioObjectEditorProps = {
  readonly lang: InterfaceLanguage;
  /** L'objet texte SÉLECTIONNÉ, ou `null` — le rail dit alors quoi faire
   * plutôt que de disparaître : une surface qui s'évapore ne se retrouve pas. */
  readonly layer: StudioTextLayer | null;
  readonly onChange: (change: (layer: StudioTextLayer) => StudioTextLayer) => void;
  readonly onPose: (pose: StudioPose) => void;
  readonly onRemove: () => void;
};

export function StudioObjectEditor({ lang, layer, onChange, onPose, onRemove }: StudioObjectEditorProps) {
  if (layer === null) {
    return (
      <p data-story-editor-empty className="px-1 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(lang, 'story.studio.editor.empty')}
      </p>
    );
  }
  const none = translate(lang, 'story.studio.editor.none');
  return (
    <div data-story-object-editor={layer.id} className="flex flex-col gap-3" role="group" aria-label={translate(lang, 'story.studio.editor.label')}>
      <Section label={translate(lang, 'story.studio.editor.style')}>
        {STYLES.map(({ id, key }) => {
          // La pastille se PEINT dans sa propre famille : le nom d'une police
          // ne dit rien tant qu'on ne la voit pas.
          const look = sceneTextAppearance({ textStyle: id });
          return (
            <StudioChip
              key={id}
              label={translate(lang, key)}
              pressed={layer.style === id}
              onPress={() => onChange((current) => ({ ...current, style: id }))}
              probe={`style:${id}`}
              style={{
                ...(look.fontFamily !== undefined ? { fontFamily: look.fontFamily } : {}),
                ...(look.fontStyle !== undefined ? { fontStyle: look.fontStyle } : {}),
                ...(look.fontWeight !== undefined ? { fontWeight: look.fontWeight } : {}),
              }}
            />
          );
        })}
      </Section>

      <Section label={translate(lang, 'story.studio.editor.effect')}>
        <StudioChip label={none} pressed={layer.effect === 'none'} onPress={() => onChange((current) => ({ ...current, effect: 'none' }))} probe="effect:none" />
        {EFFECTS.map(({ id, key }) => (
          <StudioChip
            key={id}
            label={translate(lang, key)}
            pressed={layer.effect === id}
            onPress={() => onChange((current) => ({ ...current, effect: id }))}
            probe={`effect:${id}`}
            style={{ textShadow: sceneTextAppearance({ textEffect: id, fontSize: 16 }).textShadow }}
          />
        ))}
      </Section>

      <Section label={translate(lang, 'story.studio.editor.color')}>
        {COLORS.map(({ hex, key }) => (
          <StudioChip
            key={hex}
            label={translate(lang, key)}
            pressed={layer.color === hex}
            onPress={() => onChange((current) => ({ ...current, color: hex }))}
            probe={`color:${hex}`}
            style={{ backgroundColor: hexColorCss(hex), color: 'transparent', minWidth: 44, border: '1px solid var(--color-edge)' }}
          >
            <span aria-hidden="true">·</span>
          </StudioChip>
        ))}
      </Section>

      <Section label={translate(lang, 'story.studio.editor.background')}>
        <StudioChip
          label={none}
          pressed={layer.background === null}
          onPress={() => onChange((current) => ({ ...current, background: null }))}
          probe="textbg:none"
        />
        {COLORS.map(({ hex, key }) => (
          <StudioChip
            key={hex}
            label={translate(lang, key)}
            pressed={layer.background === hex}
            onPress={() => onChange((current) => ({ ...current, background: hex }))}
            probe={`textbg:${hex}`}
            style={{ backgroundColor: hexColorCss(hex), color: 'transparent', minWidth: 44, border: '1px solid var(--color-edge)' }}
          >
            <span aria-hidden="true">·</span>
          </StudioChip>
        ))}
      </Section>

      <Section label={translate(lang, 'story.studio.editor.align')}>
        {ALIGNS.map(({ id, key, bars }) => (
          <StudioChip key={id} label={translate(lang, key)} pressed={layer.align === id} onPress={() => onChange((current) => ({ ...current, align: id }))} probe={`align:${id}`}>
            <AlignGlyph align={id} bars={bars} />
          </StudioChip>
        ))}
      </Section>

      {/* LA LANGUE DE L'OBJET — celle que le serveur TRADUIRA
          (`triggerStoryTextObjectTranslation`), pas celle de l'interface. Un
          studio qui la devine fait traduire un texte arabe depuis le français. */}
      <Section label={translate(lang, 'story.studio.editor.language')}>
        {LANGUAGES.map((code) => (
          <StudioChip
            key={code}
            label={code.toUpperCase()}
            pressed={layer.language === code}
            onPress={() => onChange((current) => ({ ...current, language: code }))}
            probe={`language:${code}`}
          />
        ))}
      </Section>

      <StudioPoseSection lang={lang} pose={layer.pose} onPose={onPose} />

      <button
        type="button"
        data-story-text-remove
        onClick={onRemove}
        className="self-start rounded-chip px-3 text-caption font-semibold"
        style={{ minHeight: 44, color: 'var(--color-error)' }}
      >
        {translate(lang, 'story.studio.text.remove')}
      </button>
    </div>
  );
}

type PoseKey =
  | 'story.studio.pose.left'
  | 'story.studio.pose.right'
  | 'story.studio.pose.up'
  | 'story.studio.pose.down'
  | 'story.studio.pose.smaller'
  | 'story.studio.pose.bigger'
  | 'story.studio.pose.rotateLeft'
  | 'story.studio.pose.rotateRight'
  | 'story.studio.pose.reset';

/** LA POSE AU CLAVIER ET AU BOUTON (lot 6) — plus aucune poignée sur la
 * scène : le glissé au doigt déplace, et ces petits boutons sont la voie du
 * clavier (dimension 5) pour DÉPLACER, agrandir, tourner et recentrer un
 * texte ou le calque. */
export function StudioPoseSection({ lang, pose, onPose }: { readonly lang: InterfaceLanguage; readonly pose: StudioPose; readonly onPose: (pose: StudioPose) => void }) {
  const STEP = 0.05;
  const nudge = (dx: number, dy: number) => onPose({ ...pose, x: Math.min(1, Math.max(0, pose.x + dx)), y: Math.min(1, Math.max(0, pose.y + dy)) });
  const chip = (probe: string, key: PoseKey, glyph: string, next: () => void) => (
    <StudioChip label={translate(lang, key)} probe={`pose:${probe}`} pressed={false} onPress={next}>
      <span aria-hidden="true">{glyph}</span>
    </StudioChip>
  );
  return (
    <Section label={translate(lang, 'story.studio.pose.label')}>
      {chip('left', 'story.studio.pose.left', '←', () => nudge(-STEP, 0))}
      {chip('right', 'story.studio.pose.right', '→', () => nudge(STEP, 0))}
      {chip('up', 'story.studio.pose.up', '↑', () => nudge(0, -STEP))}
      {chip('down', 'story.studio.pose.down', '↓', () => nudge(0, STEP))}
      {chip('smaller', 'story.studio.pose.smaller', '−', () => onPose({ ...pose, scale: pose.scale / 1.2 }))}
      {chip('bigger', 'story.studio.pose.bigger', '+', () => onPose({ ...pose, scale: pose.scale * 1.2 }))}
      {chip('rotateLeft', 'story.studio.pose.rotateLeft', '↺', () => onPose({ ...pose, rotation: pose.rotation - 15 }))}
      {chip('rotateRight', 'story.studio.pose.rotateRight', '↻', () => onPose({ ...pose, rotation: pose.rotation + 15 }))}
      {chip('reset', 'story.studio.pose.reset', '⊙', () => onPose({ x: 0.5, y: 0.5, scale: 1, rotation: 0 }))}
    </Section>
  );
}

/** L'ÉDITION DU CALQUE (lot 6) — sa pose au bouton, sa légende
 * (`PostMedia.caption`), qui a quitté la carte du socle, et son texte
 * alternatif (`PostMedia.alt`, #8518). */
export function StudioOverlayEditor({
  lang,
  pose,
  caption,
  alt,
  filter,
  onFilter,
  onPose,
  onCaption,
}: {
  readonly lang: InterfaceLanguage;
  readonly pose: StudioPose;
  readonly caption: string;
  /** LE TEXTE ALTERNATIF — absent d'une retouche, qui ne publie rien. */
  readonly alt?: { readonly value: string; readonly onChange: (value: string) => void };
  /** LE FILTRE de CE média (lot 7) — `null` : aucun. */
  readonly filter: StoryFilterId | null;
  readonly onFilter: (filter: StoryFilterId | null) => void;
  readonly onPose: (pose: StudioPose) => void;
  readonly onCaption: (value: string) => void;
}) {
  return (
    <div data-story-overlay-editor className="flex flex-col gap-3">
      <input
        id="story-studio-caption-overlay"
        type="text"
        value={caption}
        aria-label={translate(lang, 'story.studio.caption.placeholder')}
        placeholder={translate(lang, 'story.studio.caption.placeholder')}
        onInput={(event) => onCaption(event.currentTarget.value)}
        className="h-11 rounded-xl px-3 text-body outline-none"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)', color: 'var(--color-ios-ink)' }}
      />
      {alt !== undefined ? <StudioAltField lang={lang} door="overlay" value={alt.value} onChange={alt.onChange} /> : null}
      <StudioFilterSection lang={lang} filter={filter} onFilter={onFilter} />
      <StudioPoseSection lang={lang} pose={pose} onPose={onPose} />
    </div>
  );
}
