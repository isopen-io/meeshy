import { Fragment, useMemo, type CSSProperties, type ReactNode } from 'react';

import type { ContentTrackingLink } from '@meeshy/shared/types/post';
import { segmentText, type EmphasisStyle, type InlineSegment, type TextSegment } from '@meeshy/shared/utils/text-segments';

import { Link } from '@/routes/route-table';

/**
 * **LE TEXTE ÉCRIT PAR QUELQU'UN, RENDU** (#7032) — le site UNIQUE de la v2
 * qui transforme un contenu utilisateur en liens, mentions, hashtags et
 * emphase. Les trois surfaces de texte (bulle, rangée plate, carte de
 * publication) l'appellent ; aucune ne réécrit la boucle.
 *
 * ## Ce que ce composant ne fait pas
 *
 * Il n'interprète AUCUNE chaîne : `segmentText` (`@meeshy/shared`) rend des
 * segments, et chacun devient un nœud React. Il n'y a donc rien à assainir,
 * parce qu'il n'y a jamais de HTML — pas de `innerHTML`, pas de sérialisation,
 * pas de dépendance Markdown (le budget de première peinture est de 90 Ko,
 * gardé par `measure-weight.mjs`).
 *
 * ## Le schéma d'URL est décidé par la LOI, pas par ce rendu
 *
 * `segmentText` ancre les liens sur `https?://` : un `javascript:` ou un
 * `data:` ne peut pas produire de segment `url`, donc aucun `href` d'ici ne
 * peut en porter. La garde est structurelle — filtrer à l'affichage aurait
 * laissé la question rouverte à chaque nouvelle forme hostile.
 *
 * ## Les deux adresses internes EXISTENT avant ce rendu
 *
 * `/u/$username` et `/hashtag/$tag` sont déclarées dans `route-table.tsx`.
 * Sans elles, chaque mention serait un lien vers « adresse inconnue » — un
 * contrôle qui ment (loi 4), et c'est l'état que la v2 portait avant ce lot.
 *
 * ## Le HASHTAG N'EST PAS de la parité à compléter
 *
 * `hashtags` vaut `false` par défaut, et il DOIT rester faux en conversation :
 * mesuré, il n'existe aucune jointure message ↔ hashtag dans `schema.prisma`
 * ni aucune route serveur qui rende les messages d'un hashtag. Le rendre
 * cliquable là-bas installerait un lien vers un écran qui ne peut rien servir.
 */

/**
 * LE LIBELLÉ D'UN LIEN COURT (#7827) — `m+Ab12cd` est un code, pas une
 * adresse : l'afficher tel quel ne dit pas au lecteur qu'il peut le suivre.
 * L'URL d'origine n'est plus dans le texte (la passerelle l'a réécrite), donc
 * le libellé montre l'adresse PUBLIQUE du lien de suivi — celle que le lien
 * ouvre, et celle qu'iOS construit (`MessageTextRenderer.swift`).
 */
const trackedLinkLabel = (token: string): string => `meeshy.me/l/${token}`;

/** La teinte d'un lien, quand la surface ne la donne pas. */
const DEFAULT_LINK_COLOR = 'var(--color-ios-brand)';

type InlineHosts = {
  readonly linkColor: string;
  /**
   * LA PROSE EST DÉJÀ DITE AILLEURS (rangée plate) — seules les parties
   * INTERACTIVES restent dans l'arbre d'accessibilité.
   *
   * `focal-row.tsx` pose le texte servi dans l'`aria-label` de la rangée
   * (`composeMessageLabel`) et masquait donc son `<p>` en entier. Un `<a>` sous
   * un `aria-hidden` est une violation ARIA (`aria-hidden-focus`) : un élément
   * focusable que les technologies d'assistance ne voient pas. Masquer les
   * seuls segments NON interactifs garde les deux propriétés — la phrase n'est
   * pas lue deux fois, et les liens restent atteignables et nommés.
   */
  readonly plainTextHidden: boolean;
};

function inlineNodes(segments: readonly InlineSegment[], hosts: InlineHosts, keyPrefix: string): readonly ReactNode[] {
  const linkStyle: CSSProperties = { color: hosts.linkColor, fontWeight: 600 };
  return segments.map((segment, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (segment.kind) {
      case 'mention':
        return (
          <Link key={key} to="userProfile" params={{ username: segment.username }} style={linkStyle} className="hover:underline">
            {segment.text}
          </Link>
        );
      case 'hashtag':
        return (
          <Link key={key} to="hashtag" params={{ tag: segment.tag }} style={linkStyle} className="hover:underline">
            {segment.text}
          </Link>
        );
      case 'tracked-link':
        /* INTERNE — `/l/$token` est une route de l'app (`routes/tracking-link.tsx`)
           qui compte le clic puis ouvre la cible : même onglet, navigation du
           routeur. Une URL brute suivie garde son TEXTE ; seul le lien change. */
        return (
          <Link key={key} to="trackingLink" params={{ token: segment.token }} style={{ color: hosts.linkColor }} className="underline">
            {segment.url === null ? trackedLinkLabel(segment.token) : segment.text}
          </Link>
        );
      case 'url':
        return (
          /* `noopener noreferrer` : la page ouverte ne reçoit ni la main sur
             l'onglet d'origine (`window.opener`) ni l'adresse d'où elle vient. */
          <a
            key={key}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: hosts.linkColor }}
            className="underline"
          >
            {segment.text}
          </a>
        );
      default:
        return hosts.plainTextHidden ? (
          <span key={key} aria-hidden>
            {segment.text}
          </span>
        ) : (
          <Fragment key={key}>{segment.text}</Fragment>
        );
    }
  });
}

/**
 * **LES QUATRE EMPHASES, ET LA BALISE QUI PORTE LEUR SENS** — jamais un
 * `<span>` stylé : `<s>` dit « ceci ne vaut plus » et `<u>` « ceci est
 * souligné » à un lecteur d'écran, là où une classe CSS ne dit rien à
 * personne.
 *
 * Cette table est un `Record<EmphasisStyle, …>` EXHAUSTIF, et c'est le point :
 * le jour où un cinquième style entre dans `EmphasisStyle`, `tsc` rougit ICI.
 * La forme précédente — un ternaire `bold ? <strong> : <em>` — rendait
 * silencieusement un `<em>` pour tout style non prévu, et c'est exactement ce
 * qu'elle a fait quand le souligné et le barré sont arrivés.
 */
const EMPHASIS_TAG = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strikethrough: 's',
} as const satisfies Record<EmphasisStyle, string>;

function segmentNodes(segments: readonly TextSegment[], hosts: InlineHosts): readonly ReactNode[] {
  return segments.map((segment, index) => {
    if (segment.kind !== 'emphasis') return inlineNodes([segment], hosts, `s${index}`)[0];
    const Tag = EMPHASIS_TAG[segment.style];
    return <Tag key={`e${index}`}>{inlineNodes(segment.children, hosts, `e${index}`)}</Tag>;
  });
}

export function RichText({
  text,
  className,
  lang,
  style,
  hashtags = false,
  mentions,
  linkColor = DEFAULT_LINK_COLOR,
  plainTextHidden = false,
  trackingLinks,
  ...rest
}: {
  readonly text: string;
  readonly className?: string;
  /** La langue RÉELLEMENT servie — jamais celle de l'original quand le Prisme
   * a traduit : c'est elle que la synthèse vocale prononce. */
  readonly lang?: string;
  readonly style?: CSSProperties;
  /** `true` en PUBLICATION seulement — voir le doc-comment de tête. */
  readonly hashtags?: boolean;
  /** Les pseudos VALIDÉS par le serveur ; `undefined` ⇒ tout handle est un
   * lien (le serveur ne s'est pas prononcé), `[]` ⇒ aucun. */
  readonly mentions?: readonly string[] | undefined;
  /** La teinte des liens SUR CETTE SURFACE — une bulle envoyée a un fond
   * indigo, sur lequel la teinte de marque ne se lit pas. */
  readonly linkColor?: string;
  readonly plainTextHidden?: boolean;
  /** Les URL BRUTES que la passerelle a rendues traçables (#7827) — décodées
   * par `trackingLinksOf` ; absentes ⇒ chaque URL est un lien direct. */
  readonly trackingLinks?: readonly ContentTrackingLink[] | undefined;
} & Omit<React.HTMLAttributes<HTMLParagraphElement>, 'children' | 'className' | 'lang' | 'style'>) {
  const segments = useMemo(
    () =>
      segmentText(text, {
        hashtags,
        ...(mentions === undefined ? {} : { mentions }),
        ...(trackingLinks === undefined ? {} : { trackingLinks }),
      }),
    [text, hashtags, mentions, trackingLinks],
  );
  return (
    <p data-rich-text="" className={className} lang={lang} style={style} {...rest}>
      {segmentNodes(segments, { linkColor, plainTextHidden })}
    </p>
  );
}
