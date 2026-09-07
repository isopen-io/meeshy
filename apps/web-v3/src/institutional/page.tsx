/** @jsxImportSource preact */
/*
 * PRAGMA OBLIGATOIRE, et voici pourquoi elle n'est pas décorative.
 *
 * Le reste de l'application compile son JSX vers `react/jsx-runtime`, que Vite
 * ALIASE vers Preact. Ce fichier-ci est rendu par `preact-render-to-string`
 * depuis un script lancé par bun — HORS du pipeline Vite, donc hors de l'alias.
 * Sans cette ligne, le JSX produit de vrais éléments React, que le rendu Preact
 * ne sait pas lire : il rend une chaîne VIDE, sans erreur.
 *
 * Le symptôme observé : cinq pages servies en 200, titre correct, métadonnées
 * correctes, `<body></body>`. Un défaut qui passe tous les contrôles sauf celui
 * de regarder la page.
 */
import type { Block, Card, FramedRow, ContentPage, Section } from './type';

/**
 * LE RENDU DES CINQ PAGES INSTITUTIONNELLES.
 *
 * Un composant, cinq contenus. Ces pages sont PRÉCHAUFFÉES en HTML statique
 * (`scripts/prerender-institutional.tsx`) : elles ne montent aucun composant
 * client, n'embarquent aucun script, et ne paient donc pas un octet du socle
 * applicatif. C'est ce que #5554 demande, et c'est aussi ce qui en fait le
 * premier essai réel du routage en production — sans session, sans API, sans
 * temps réel, elles ne peuvent échouer que sur le routage lui-même.
 */

function Chips({ items }: { items: readonly string[] }) {
  return (
    <ul className="ml-5 list-disc space-y-1.5">
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
        <p className="mt-2 text-meta font-semibold uppercase" style={{ color: 'var(--color-ios-brand)', letterSpacing: '0.08em' }}>
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
  }
}

function RenderedSection({ section }: { section: Section }) {
  return (
    <section className="mt-8">
      <h2 className="text-thread font-bold" style={{ color: 'var(--color-ios-ink)' }}>
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

export function InstitutionalPage({ page }: { page: ContentPage }) {
  return (
    /* L'encre PLEINE sur tout le corps — charte règle 18 : « l'encre du contenu
       est --color-text ; le gris est réservé à ce qu'on peut ne pas lire ». La
       première version posait l'encre SECONDAIRE ici, ce qui faisait lire une
       politique de confidentialité entière en couleur d'accompagnement. Seules
       la mention de date et le pied prennent l'encre atténuée. */
    <div style={{ backgroundColor: 'var(--color-ios-surface)', color: 'var(--color-ios-ink)' }}>
      <a href="#contenu" className="skip-link">
        Aller au content
      </a>

      <header className="mx-auto flex max-w-[42rem] items-center gap-3 px-5 pt-6 pb-2">
        <a
          href="/"
          className="flex items-center gap-2 text-brand font-bold"
          style={{ color: 'var(--color-ios-brand)' }}
        >
          Meeshy
        </a>
        <span className="flex-1" />
        <a href="/" className="text-meta underline underline-offset-2">
          Retour à l’accueil
        </a>
      </header>

      <main id="contenu" className="mx-auto max-w-[42rem] px-5 pb-16 text-body leading-relaxed">
        <h1 className="mt-4 text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          {page.title}
        </h1>
        {page.hero ? <p className="mt-3 text-secondary">{page.hero}</p> : null}
        {page.mention ? (
          <p className="mt-2 text-meta" style={{ color: 'var(--color-ios-ink-3)' }}>
            {page.mention}
          </p>
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
                className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
                style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 52 }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer
        className="mx-auto max-w-[42rem] px-5 pb-8 text-meta"
        style={{ color: 'var(--color-ios-ink-3)' }}
      >
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          <a href="/about" className="underline underline-offset-2">À propos</a>
          <a href="/contact" className="underline underline-offset-2">Contact</a>
          <a href="/partners" className="underline underline-offset-2">Partenaires</a>
          <a href="/privacy" className="underline underline-offset-2">Confidentialité</a>
          <a href="/terms" className="underline underline-offset-2">Conditions</a>
        </nav>
      </footer>
    </div>
  );
}
