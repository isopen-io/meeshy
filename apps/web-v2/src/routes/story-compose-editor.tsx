import type { ReactNode } from 'react';

import { hexColorCss } from '@/lib/canvas/background';
import { sceneTextAppearance } from '@/lib/canvas/text-appearance';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioPose } from '@/lib/stories/studio-pose';
import { STUDIO_TEXT_LANGUAGES, type StudioTextLayer } from '@/lib/stories/studio-text';

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
 * **Ce que ce rail NE sert PAS, et pourquoi** : treize des dix-huit familles
 * de `StoryTextStyle` nomment une police EMBARQUÉE dans l'app iOS. Le poids
 * de première peinture est déjà au-dessus de son plafond (#6940), donc ce lot
 * ne télécharge aucun fichier de police : cinq familles passent (système,
 * Georgia, Courier), les autres attendent leur budget — une issue de suivi.
 */

/** Les cinq familles servies et leur clé de libellé. */
const STYLES = [
  { id: 'bold', key: 'story.studio.style.bold' },
  { id: 'neon', key: 'story.studio.style.neon' },
  { id: 'classic', key: 'story.studio.style.classic' },
  { id: 'italic', key: 'story.studio.style.italic' },
  { id: 'typewriter', key: 'story.studio.style.typewriter' },
] as const satisfies readonly { readonly id: StudioTextLayer['style']; readonly key: InterfaceCatalogKey }[];

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

function Section({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-check font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

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
        <StudioChip label={none} pressed={layer.effect === 'none'} onPress={() => onChange((current) => ({ ...current, effect: 'none' }))} />
        {EFFECTS.map(({ id, key }) => (
          <StudioChip
            key={id}
            label={translate(lang, key)}
            pressed={layer.effect === id}
            onPress={() => onChange((current) => ({ ...current, effect: id }))}
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
            style={{ backgroundColor: hexColorCss(hex), color: 'transparent', minWidth: 44, border: '1px solid var(--color-ios-separator)' }}
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
        />
        {COLORS.map(({ hex, key }) => (
          <StudioChip
            key={hex}
            label={translate(lang, key)}
            pressed={layer.background === hex}
            onPress={() => onChange((current) => ({ ...current, background: hex }))}
            style={{ backgroundColor: hexColorCss(hex), color: 'transparent', minWidth: 44, border: '1px solid var(--color-ios-separator)' }}
          >
            <span aria-hidden="true">·</span>
          </StudioChip>
        ))}
      </Section>

      <Section label={translate(lang, 'story.studio.editor.align')}>
        {ALIGNS.map(({ id, key, bars }) => (
          <StudioChip key={id} label={translate(lang, key)} pressed={layer.align === id} onPress={() => onChange((current) => ({ ...current, align: id }))}>
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
          />
        ))}
      </Section>

      {/* LA POSE AU CLAVIER ET AU BOUTON — le geste au pointeur vit sur la
          scène (`story-compose-stage.tsx`), mais « un objet déplaçable doit
          aussi être déplaçable au clavier ». Ces quatre cibles sont la voie
          de secours VISIBLE, en plus des raccourcis de la poignée. */}
      <Section label={translate(lang, 'story.studio.pose.label')}>
        <StudioChip
          label={translate(lang, 'story.studio.pose.smaller')}
          pressed={false}
          onPress={() => onPose({ ...layer.pose, scale: layer.pose.scale / 1.2 })}
        >
          <span aria-hidden="true">−</span>
        </StudioChip>
        <StudioChip
          label={translate(lang, 'story.studio.pose.bigger')}
          pressed={false}
          onPress={() => onPose({ ...layer.pose, scale: layer.pose.scale * 1.2 })}
        >
          <span aria-hidden="true">+</span>
        </StudioChip>
        <StudioChip
          label={translate(lang, 'story.studio.pose.rotateLeft')}
          pressed={false}
          onPress={() => onPose({ ...layer.pose, rotation: layer.pose.rotation - 15 })}
        >
          <span aria-hidden="true">↺</span>
        </StudioChip>
        <StudioChip
          label={translate(lang, 'story.studio.pose.rotateRight')}
          pressed={false}
          onPress={() => onPose({ ...layer.pose, rotation: layer.pose.rotation + 15 })}
        >
          <span aria-hidden="true">↻</span>
        </StudioChip>
        <StudioChip
          label={translate(lang, 'story.studio.pose.reset')}
          pressed={false}
          onPress={() => onPose({ x: 0.5, y: 0.5, scale: 1, rotation: 0 })}
        >
          <span aria-hidden="true">⊙</span>
        </StudioChip>
      </Section>

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
