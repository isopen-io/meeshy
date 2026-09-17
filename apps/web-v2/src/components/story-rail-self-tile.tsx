import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { MIN_TOUCH_TARGET, railCellWidth, railRingBox, railStroke } from '@/components/rail-tile';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StoryRailSelfEntry } from '@/lib/view/story-rail-self';
import { Link } from '@/routes/route-table';

/**
 * **MA CELLULE DU RAIL, ET SES DEUX PORTES** (#6150) — directive porteur du
 * 2026-09-17 : « mettre le bouton (+) au dessus de gauche de l'avatar de
 * l'auteur pour créer une nouvelle story et (bulle pensant) en bas droite pour
 * créer un mood ou afficher le smiley animé du mood en cours comme sous iOS ».
 *
 * Géographie reprise TRAIT POUR TRAIT de `LentilleRailSelfEntryView`
 * (`apps/ios/.../Lentille/Chrome/StoriesVivantsRail.swift`) :
 * `ZStack(alignment: .bottomTrailing)` porte la pastille d'humeur,
 * `.overlay(alignment: .topLeading)` porte le badge de création, et ce sont
 * DEUX `Button(.plain)` distincts. Le commentaire d'iOS tranche l'ambiguïté
 * qu'un lecteur pourrait avoir : « le badge bas-droit reste le MOOD (💭 /
 * emoji), jamais un second plus ambigu ».
 *
 * ## TROIS CONTRÔLES, TROIS ARBRES — jamais l'un DANS l'autre
 *
 * L'avatar (quand j'ai une story) ouvre ma story ; le (+) ouvre le studio ; la
 * pastille ouvre ma composition d'humeur. Les trois sont FRÈRES dans un
 * conteneur positionné, jamais imbriqués : un bouton dans un `<a>` produit un
 * arbre d'accessibilité invalide, et taper la pastille ouvrirait AUSSI la
 * story. C'est exactement pourquoi iOS les monte en `ZStack` plutôt qu'en
 * `label:` du bouton principal.
 *
 * ## LE DÉBORD DES CIBLES EST DÉLIBÉRÉ
 *
 * Chaque pastille MESURE ~26 px et se TOUCHE sur 44 (dimension 5). Les deux
 * cibles sont centrées aux coins opposés d'un anneau de 94 : leurs centres sont
 * à 68 px l'un de l'autre sur chaque axe, donc deux carrés de 44 ne peuvent pas
 * se recouvrir — c'est ce qui rend chacune atteignable SEULE. La zone déborde
 * de la cellule d'environ 9 px : ma cellule est la PREMIÈRE du rail, dont le
 * `paddingInline` vaut 16, et le `gap` de 8 tient le reste.
 *
 * ## EN RTL, LA GÉOGRAPHIE SE MIROITE — et c'est le sens de la directive
 *
 * « haut-gauche » et « bas-droite » nomment un DÉBUT et une FIN de ligne, pas
 * deux bords physiques : en arabe, le (+) se pose en haut à DROITE et l'humeur
 * en bas à GAUCHE. Les deux pastilles sont donc posées en `inset-inline-start`
 * / `inset-inline-end`, jamais en `left` / `right` — la propriété logique EST
 * la décision, elle n'est pas une commodité d'écriture.
 */

/** La bulle de pensée, quand aucune humeur n'est posée — le MÊME glyphe que le
 * tray historique d'iOS, et pour la raison qu'il documente : « le "+" disait
 * "ajouter" sans dire quoi » (retour utilisateur 2026-08-21). Exportée pour que
 * les témoins mesurent la constante plutôt que de la recopier. */
export const MOOD_BADGE_PLACEHOLDER = '\u{1F4AD}';

/**
 * Le diamètre des deux pastilles, DÉRIVÉ de l'anneau — jamais une cote neuve.
 * iOS le dérive de la même façon (`ringWidth * 2 + emojiSize`) et sa garde R15
 * interdit d'en inventer une : une pastille qui ne suit pas l'anneau se
 * décolle du visage dès qu'une cote bouge.
 */
export const selfBadgeDiameter = (size: number): number => Math.max(20, Math.round(size * 0.28));

/**
 * La respiration du glyphe d'humeur, trame de `MeeshyMoodBadge`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/MoodBadge.swift`) : repos
 * 1.0 → 1.18, puis LA PASTILLE SE POSE. Le ressort d'iOS tournait sans fin et
 * l'audit de chauffe du 2026-08-26 l'a borné à ~8 s ; on porte la borne avec
 * l'animation, sinon on porte le défaut sans le correctif.
 *
 * L'écart assumé avec iOS est l'inverse de celui qu'on attendrait : sur SOI,
 * iOS monte `animates: false` (la pastille « moi » vit hors de la borne
 * d'animation du rail). La directive porteur demande explicitement l'emoji
 * animé ; on la suit, en gardant la borne — et `prefers-reduced-motion` éteint
 * tout, comme le portillon `shouldAnimate` d'iOS.
 *
 * La trame elle-même vit dans `styles/app.css` (`.mood-breathe`, 2 s × 4 ≈ la
 * `breathingDuration` de 8 s), avec son pourquoi : une animation qui n'est pas
 * dans la feuille ne peut pas être coupée par la règle générale de
 * `prefers-reduced-motion`.
 */

type SelfTileProps = {
  readonly entry: StoryRailSelfEntry;
  readonly size: number;
  readonly language: InterfaceLanguage;
};

export function StoryRailSelfTile({ entry, size, language }: SelfTileProps) {
  const anneau = railRingBox(size);
  const cellule = railCellWidth(size, true);
  const trait = railStroke(size, entry.hasActiveStory);
  const badge = selfBadgeDiameter(size);
  const hit = Math.max(0, (MIN_TOUCH_TARGET - badge) / 2);
  const emoji = entry.moodEmoji;

  /* L'ANNEAU ET L'AVATAR — le même corps que `StoryTile`, à ceci près qu'il
     n'est un LIEN que si j'ai quelque chose à ouvrir. Sans story, c'est un
     support : un anneau qui promet un contenu que rien n'ouvre est un contrôle
     qui ment (loi 4, déjà écrite dans le doc-comment du rail). */
  const pastille = (
    <span
      data-anneau
      data-accented={entry.hasActiveStory ? 'true' : undefined}
      className="grid place-items-center rounded-chip"
      style={{
        width: anneau,
        height: anneau,
        boxShadow: `inset 0 0 0 ${trait}px ${
          entry.hasActiveStory
            ? 'var(--color-ios-brand)'
            : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)'
        }`,
      }}
    >
      <Avatar initials={translate(language, 'stories.mine').slice(0, 2)} color={'var(--color-ios-brand)'} size={size} />
    </span>
  );

  const badgeStyle = {
    width: badge,
    height: badge,
    minWidth: `${MIN_TOUCH_TARGET}px`,
    minHeight: `${MIN_TOUCH_TARGET}px`,
    margin: -hit,
    outlineColor: 'var(--color-ios-brand)',
  } as const;

  return (
    <li
      data-story-self
      data-rail-tile={size}
      className="flex shrink-0 flex-col items-center gap-1"
      style={{ width: cellule }}
    >
      <div className="relative grid place-items-center" style={{ width: anneau, height: anneau }}>
        {entry.entryStoryId === undefined ? (
          pastille
        ) : (
          <Link
            to="story"
            params={{ post: entry.entryStoryId }}
            data-story-self-open
            aria-label={translate(language, 'stories.mine')}
            className="rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: 'var(--color-ios-brand)' }}
          >
            {pastille}
          </Link>
        )}

        {/* LE (+) — DÉBUT de ligne, en haut. `inset-inline-start` porte le
            miroir RTL : en arabe il se pose en haut à DROITE, ce qui EST « au
            dessus de gauche » dans une langue qui commence à droite. */}
        <Link
          to="storyCompose"
          data-self-create
          aria-label={translate(language, 'stories.self.addStory')}
          className="absolute top-0 start-0 grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            ...badgeStyle,
            color: 'var(--color-ios-on-brand, #fff)',
            background: 'var(--color-ios-brand)',
            boxShadow: '0 0 0 1.5px var(--color-ios-surface)',
          }}
        >
          <Glyph name="plus" size={Math.max(10, Math.round(badge * 0.5))} />
        </Link>

        {/* LA PASTILLE D'HUMEUR — FIN de ligne, en bas. `data-mood` porte
            l'emoji SERVI (prise du gate navigateur) ; son absence dit qu'aucune
            humeur n'est posée, sans qu'il faille lire le texte rendu. */}
        <Link
          to="statusCompose"
          data-self-mood
          {...(emoji === undefined ? {} : { 'data-mood': emoji })}
          aria-label={
            emoji === undefined
              ? translate(language, 'stories.self.mood.add')
              : translate(language, 'stories.self.mood.change', { emoji })
          }
          className="absolute bottom-0 end-0 grid place-items-center rounded-full leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            ...badgeStyle,
            background: 'var(--color-ios-surface)',
            boxShadow: '0 0 0 1.5px var(--color-ios-surface)',
          }}
        >
          <span
            aria-hidden="true"
            {...(emoji === undefined ? {} : { 'data-mood-animates': 'true' })}
            className={emoji === undefined ? 'grid place-items-center' : 'grid place-items-center mood-breathe'}
            style={{
              width: badge,
              height: badge,
              fontSize: Math.max(10, Math.round(badge * 0.65)),
            }}
          >
            {emoji ?? MOOD_BADGE_PLACEHOLDER}
          </span>
        </Link>
      </div>

      <span data-libelle className="w-full truncate text-center text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'stories.mine')}
      </span>
    </li>
  );
}
