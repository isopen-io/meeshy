import { Fragment, useMemo, type CSSProperties, type ReactNode } from 'react';

import type { ContentTrackingLink } from '@meeshy/shared/types/post';
import { hasBlockSyntax, parseBlocks, type TextBlock } from '@meeshy/shared/utils/text-blocks';
import { segmentText, type EmphasisStyle } from '@meeshy/shared/utils/text-segments';

import { apiConfig } from '@/lib/api/config';
import { internalPathOf } from '@/lib/links/internal-link';
import { displaySegments, type DisplaySegment, type LinkDisplay } from '@/lib/links/link-display';
import { webOriginOf } from '@/lib/links/web-origin';
import { peekProfileOnClick } from '@/lib/view/profile-peek';
import { CLAIMS_GESTURE_ATTRIBUTE } from '@/lib/view/shortcut-scope';
import { isAppPath } from '@/routes/app-paths';
import { Link, navigate } from '@/routes/route-table';

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

const inAppPathOf = (href: string): string | null =>
  internalPathOf(href, {
    origins: [webOriginOf(apiConfig.base, window.location.origin), window.location.origin],
    isAppPath,
  });

const CLAIMED_LINK: Readonly<Record<string, string>> = { [CLAIMS_GESTURE_ATTRIBUTE]: '' };
const UNMARKED_LINK: Readonly<Record<string, string>> = {};

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
  /** Les attributs posés sur CHAQUE lien — `data-claims-gesture` quand le
   * texte vit sur une scène qui a son propre geste (`ViewerCaption`). */
  readonly linkAttributes: Readonly<Record<string, string>>;
};

type InlineDisplaySegment = Exclude<DisplaySegment, { readonly kind: 'emphasis' }>;

/**
 * UN LIEN, TEL QUE LA LOI L'A RÉSOLU (#9093) — `resolveLinkDisplay` a déjà dit
 * QUOI montrer et OÙ aller ; ce rendu ne choisit que la NAVIGATION.
 */
function linkNode(display: LinkDisplay, key: string, hosts: InlineHosts): ReactNode {
  const marks = hosts.linkAttributes;
  if (display.tracked) {
    /* INTERNE — `/l/$token` est une route de l'app (`routes/tracking-link.tsx`)
       qui compte le clic puis ouvre la cible : même onglet, routeur. */
    return (
      <Link {...marks} key={key} to="trackingLink" params={{ token: display.token }} style={{ color: hosts.linkColor }} className="underline">
        {display.text}
      </Link>
    );
  }
  /* INTERNE (#7849) — un lien Meeshy navigue DANS l'app, comme une mention :
     même onglet, routeur, et dans la coque on ne sort pas vers le navigateur
     externe. Les gestes « nouvel onglet » restent au navigateur. */
  const inApp = inAppPathOf(display.href);
  if (inApp !== null) {
    return (
      <a
        {...marks}
        key={key}
        href={inApp}
        style={{ color: hosts.linkColor }}
        className="underline"
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          navigate(inApp);
        }}
      >
        {display.text}
      </a>
    );
  }
  return (
    /* `noopener noreferrer` : la page ouverte ne reçoit ni la main sur
       l'onglet d'origine (`window.opener`) ni l'adresse d'où elle vient. */
    <a {...marks} key={key} href={display.href} target="_blank" rel="noopener noreferrer" style={{ color: hosts.linkColor }} className="underline">
      {display.text}
    </a>
  );
}

function inlineNodes(segments: readonly InlineDisplaySegment[], hosts: InlineHosts, keyPrefix: string): readonly ReactNode[] {
  const linkStyle: CSSProperties = { color: hosts.linkColor, fontWeight: 600 };
  const marks = hosts.linkAttributes;
  return segments.map((segment, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (segment.kind) {
      case 'mention':
        return (
          <Link
            {...marks}
            key={key}
            to="userProfile"
            params={{ username: segment.username }}
            onClick={peekProfileOnClick(segment.username)}
            style={linkStyle} className="hover:underline">
            {segment.text}
          </Link>
        );
      case 'hashtag':
        return (
          <Link {...marks} key={key} to="hashtag" params={{ tag: segment.tag }} style={linkStyle} className="hover:underline">
            {segment.text}
          </Link>
        );
      case 'code':
        return (
          <code
            key={key}
            aria-hidden={hosts.plainTextHidden ? true : undefined}
            className="rounded-[4px] px-1 font-mono text-[0.9em]"
            style={{ backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)' }}
          >
            {segment.text}
          </code>
        );
      case 'link':
        return linkNode(segment.display, key, hosts);
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

function segmentNodes(segments: readonly DisplaySegment[], hosts: InlineHosts): readonly ReactNode[] {
  return segments.map((segment, index) => {
    if (segment.kind !== 'emphasis') return inlineNodes([segment], hosts, `s${index}`)[0];
    const Tag = EMPHASIS_TAG[segment.style];
    return <Tag key={`e${index}`}>{segmentNodes(segment.children, hosts)}</Tag>;
  });
}

/**
 * **LES BLOCS** (#7849) — titres, listes, citations, code. Rendus par les
 * balises qui portent leur sens (`<ul>`, `<blockquote>`, `<pre>`), jamais par
 * un `<div>` stylé. Un titre de message n'est PAS un titre de document : il
 * reste un paragraphe en gras plus grand, sans quoi chaque `# Salut` d'une
 * conversation s'insérerait dans le plan des titres de l'écran.
 */
const HEADING_SIZE = { 1: '1.25em', 2: '1.12em', 3: '1em' } as const satisfies Record<1 | 2 | 3, string>;

function blockNode(
  block: TextBlock,
  index: number,
  render: (text: string) => readonly ReactNode[],
  textHidden: boolean,
): ReactNode {
  const key = `b${index}`;
  switch (block.kind) {
    case 'paragraph':
      return <p key={key}>{render(block.text)}</p>;
    case 'heading':
      return (
        <p key={key} data-md-heading={block.level} style={{ fontWeight: 700, fontSize: HEADING_SIZE[block.level] }}>
          {render(block.text)}
        </p>
      );
    case 'list': {
      const items = block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{render(item)}</li>);
      return block.ordered ? (
        <ol key={key} start={block.start} className="list-decimal ps-6">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc ps-6">
          {items}
        </ul>
      );
    }
    case 'quote':
      return (
        <blockquote key={key} className="border-s-[3px] ps-2 opacity-80" style={{ borderColor: 'currentColor' }}>
          {render(block.text)}
        </blockquote>
      );
    case 'code':
      return (
        <pre
          key={key}
          aria-hidden={textHidden ? true : undefined}
          className="overflow-x-auto whitespace-pre rounded-[8px] px-2 py-1 font-mono text-[0.85em]"
          style={{ backgroundColor: 'color-mix(in srgb, currentColor 10%, transparent)' }}
        >
          <code>{block.text}</code>
        </pre>
      );
  }
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
  claimsGesture = false,
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
  /** `true` ⇒ chaque lien porte `data-claims-gesture` : le lecteur qui
   * l'héberge (story, visionneuse) lui cède le geste, et à lui seul. */
  readonly claimsGesture?: boolean;
} & Omit<React.HTMLAttributes<HTMLParagraphElement>, 'children' | 'className' | 'lang' | 'style'>) {
  const blocks = useMemo(() => (hasBlockSyntax(text) ? parseBlocks(text) : null), [text]);
  const render = useMemo(() => {
    const options = {
      hashtags,
      ...(mentions === undefined ? {} : { mentions }),
      ...(trackingLinks === undefined ? {} : { trackingLinks }),
    };
    const linkAttributes = claimsGesture ? CLAIMED_LINK : UNMARKED_LINK;
    return (content: string) =>
      segmentNodes(displaySegments(segmentText(content, options), trackingLinks), { linkColor, plainTextHidden, linkAttributes });
  }, [hashtags, mentions, trackingLinks, linkColor, plainTextHidden, claimsGesture]);
  if (blocks === null) {
    return (
      <p data-rich-text="" className={className} lang={lang} style={style} {...rest}>
        {render(text)}
      </p>
    );
  }
  /* UN TEXTE À BLOCS se rend dans un `<div>` : un `<ul>` ou un `<pre>` ne
     peut pas vivre dans un `<p>`. Le chemin nominal, sans bloc, garde son
     `<p>` inchangé. */
  return (
    <div
      data-rich-text=""
      className={`${className ?? ''} flex flex-col gap-1`}
      lang={lang}
      style={style}
      {...(rest as React.HTMLAttributes<HTMLDivElement>)}
    >
      {blocks.map((block, index) => blockNode(block, index, render, plainTextHidden))}
    </div>
  );
}
