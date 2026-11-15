import { LANDING_COPY } from '../landing/landing-copy';
import { LanguageMenu, SiteFooter, SiteHeader } from '../landing/site-chrome';
import { BrandSignature } from './brand-signature';
import { meeViewSrc } from './mee-views';
import type { Block, Card, FramedRow, ContentPage, MeeView, Section } from './type';

/**
 * LE RENDU DES SEPT PAGES INSTITUTIONNELLES.
 *
 * Un composant, sept contenus. Ces pages sont PRÉCHAUFFÉES en HTML statique
 * (`scripts/prerender-institutional.tsx`) : elles ne montent aucun composant
 * client, n'embarquent aucun script, et ne paient donc pas un octet du socle
 * applicatif. C'est ce que #5554 demande, et c'est aussi ce qui en fait le
 * premier essai réel du routage en production — sans session, sans API, sans
 * temps réel, elles ne peuvent échouer que sur le routage lui-même.
 *
 * Elles portent l'en-tête et le pied de meeshy.me (`landing/site-chrome.tsx`,
 * #10071), dans la copie FRANÇAISE de la landing : c'est la langue de leur
 * contenu. Le sélecteur de langue mène à la landing de la langue choisie
 * (`LanguageMenu`) — ces pages ne sont pas traduites, il ne le prétend pas.
 *
 * Rendues par `react-dom/server`, comme la landing : un composant partagé ne
 * peut avoir qu'un seul moteur de rendu hors de Vite (`preact-render-to-string`
 * ne lit pas un élément React — il rendait une chaîne VIDE, sans erreur).
 */
const COPY = LANDING_COPY.fr;

function Chips({ items }: { items: readonly string[] }) {
  return (
    <ul className="ms-5 list-disc space-y-1.5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function BlockCard({ card }: { card: Card }) {
  return (
    <li
      className="rounded-card p-4"
      style={{ backgroundColor: 'var(--color-ios-card)', border: '0.5px solid var(--color-edge)' }}
    >
      <h3 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {card.title}
      </h3>
      {card.body ? <p className="mt-1.5">{card.body}</p> : null}
      {card.items ? <div className="mt-2">{Chips({ items: card.items })}</div> : null}
      {card.mention ? (
        /* La ligne qui QUALIFIE la carte — un tarif, une durée. Capitales
           espacées, comme la charte le demande pour un qualifiant. */
        <p className="mt-2 text-caption font-semibold uppercase" style={{ color: 'var(--color-ios-brand)', letterSpacing: '0.08em' }}>
          {card.mention}
        </p>
      ) : null}
    </li>
  );
}

function FramedRowView({ row }: { row: FramedRow }) {
  if (row.href === undefined) return <li>{row.text}</li>;
  return (
    <li>
      {/* Une adresse qu'on ne peut pas ouvrir d'un geste est une adresse qu'il
          faut recopier à la main — deux gestes de trop sur le chemin nominal. */}
      <a href={row.href} className="underline underline-offset-2" style={{ color: 'var(--color-ios-brand)' }}>
        {row.text}
      </a>
    </li>
  );
}

/**
 * MEE DANS LA PAGE (#9034) — le sticker en image (`mee-views.ts` dit
 * pourquoi un fichier), animé par son propre SVG, aucun script. Le dessin
 * est décoratif (`alt` vide) : la légende porte le sens.
 */
function MeeFigure({ view, size, lead }: { view: MeeView; size: number; lead?: boolean }) {
  return (
    <figure
      data-mee-view={view.sticker}
      className="rounded-card p-4"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        margin: 0,
        backgroundColor: lead === true ? 'color-mix(in srgb, var(--color-ios-brand) 8%, transparent)' : 'var(--color-ios-card)',
      }}
    >
      <img src={meeViewSrc(view)} width={size} height={size} alt="" style={{ flex: 'none' }} />
      <figcaption className={lead === true ? 'font-medium' : undefined}>{view.caption}</figcaption>
    </figure>
  );
}

/**
 * Le `switch` est EXHAUSTIF et sans `default` — repris de l'ancienne refonte,
 * avec sa raison : un sixième genre ajouté au type somme ne compilera pas tant
 * qu'il n'est pas rendu. Un `default` qui rendrait `null` transformerait cette
 * erreur de compilation en un bloc SILENCIEUSEMENT absent de la page.
 */
function RenderedBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case 'paragraphes':
      return (
        <>
          {block.body.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </>
      );
    case 'list':
      return <Chips items={block.items} />;
    case 'cartes':
      return (
        <ul className="grid gap-3 sm:grid-cols-2">
          {block.cards.map((card) => (
            <BlockCard key={card.title} card={card} />
          ))}
        </ul>
      );
    case 'accent':
      return (
        <p
          className="rounded-card px-4 py-3 font-medium"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 10%, transparent)',
            borderInlineStart: '3px solid var(--color-ios-brand)',
          }}
        >
          {block.body}
        </p>
      );
    case 'encadre':
      return (
        <ul
          className="space-y-1.5 rounded-card p-4"
          style={{ backgroundColor: 'var(--color-ios-card)', border: '0.5px solid var(--color-edge)' }}
        >
          {block.rows.map((row) => (
            <FramedRowView key={row.text} row={row} />
          ))}
        </ul>
      );
    case 'mee':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {block.views.map((view) => (
            <MeeFigure key={view.sticker} view={view} size={96} />
          ))}
        </div>
      );
  }
}

function RenderedSection({ section }: { section: Section }) {
  return (
    <section className="mt-8 md:mt-12">
      <h2 className="text-thread leading-snug font-bold md:text-[1.625rem]" style={{ color: 'var(--color-ios-ink)' }}>
        {section.title}
      </h2>
      <div className="mt-3 space-y-3">
        {section.blocks.map((block, i) => (
          <RenderedBlock key={i} block={block} />
        ))}
      </div>
    </section>
  );
}

export function InstitutionalPage({ page, version }: { page: ContentPage; version: string }) {
  return (
    /* L'encre PLEINE sur tout le corps — charte règle 18 : « l'encre du contenu
       est --color-text ; le gris est réservé à ce qu'on peut ne pas lire ». La
       première version posait l'encre SECONDAIRE ici, ce qui faisait lire une
       politique de confidentialité entière en couleur d'accompagnement. Seules
       la mention de date et le pied prennent l'encre atténuée. */
    <div className="flex min-h-dvh flex-col" style={{ backgroundColor: 'var(--color-ios-surface)', color: 'var(--color-ios-ink)' }}>
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>

      <SiteHeader language="fr" copy={COPY} onLanding={false} languageControl={<LanguageMenu language="fr" copy={COPY} />} />

      {/* La colonne de lecture : 44 rem au plus (≈ 70 signes par ligne), des
          marges qui s'élargissent avec l'écran — jamais un texte collé au bord. */}
      <main id="contenu" className="mx-auto w-full max-w-[44rem] grow px-5 pt-6 pb-16 text-body leading-relaxed sm:px-8 md:pt-12">
        <h1 className="text-screen leading-tight font-bold md:text-[2.75rem]" style={{ color: 'var(--color-ios-ink)' }}>
          {page.title}
        </h1>
        {page.hero ? <p className="mt-3 text-secondary">{page.hero}</p> : null}
        {page.mention ? (
          <p className="mt-2 text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
            {page.mention}
          </p>
        ) : null}
        {page.mee ? (
          <div className="mt-6">
            <MeeFigure view={page.mee} size={132} lead />
          </div>
        ) : null}

        {page.sections.map((section) => (
          <RenderedSection key={section.title} section={section} />
        ))}

        <section className="mt-10 rounded-hero p-5" style={{ backgroundColor: 'var(--color-ios-card)' }}>
          <h2 className="text-thread font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {page.run.title}
          </h2>
          {page.run.hero ? <p className="mt-2">{page.run.hero}</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {page.run.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="grid place-items-center rounded-chip px-5 text-body font-semibold text-ios-on-brand"
                style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 52 }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter language="fr" copy={COPY} onLanding={false} languageLinks={false}>
        <div className="ld-wrap ld-footer-signature">
          <BrandSignature version={version} language="fr" />
        </div>
      </SiteFooter>
    </div>
  );
}
