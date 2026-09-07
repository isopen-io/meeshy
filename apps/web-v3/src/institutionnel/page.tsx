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
import type { Bloc, Carte, LigneEncadree, PageDeContenu, Section } from './type';

/**
 * LE RENDU DES CINQ PAGES INSTITUTIONNELLES.
 *
 * Un composant, cinq contenus. Ces pages sont PRÉCHAUFFÉES en HTML statique
 * (`scripts/prerend-institutionnel.mjs`) : elles ne montent aucun composant
 * client, n'embarquent aucun script, et ne paient donc pas un octet du socle
 * applicatif. C'est ce que #5554 demande, et c'est aussi ce qui en fait le
 * premier essai réel du routage en production — sans session, sans API, sans
 * temps réel, elles ne peuvent échouer que sur le routage lui-même.
 */

function Puces({ items }: { items: readonly string[] }) {
  return (
    <ul className="ml-5 list-disc space-y-1.5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function CarteDeBloc({ carte }: { carte: Carte }) {
  return (
    <li
      className="rounded-carte p-4"
      style={{ backgroundColor: 'var(--color-ios-carte)', border: '0.5px solid var(--color-lisere)' }}
    >
      <h3 className="text-corps font-semibold" style={{ color: 'var(--color-ios-encre)' }}>
        {carte.titre}
      </h3>
      {carte.corps ? <p className="mt-1.5">{carte.corps}</p> : null}
      {carte.items ? <div className="mt-2">{Puces({ items: carte.items })}</div> : null}
      {carte.mention ? (
        /* La ligne qui QUALIFIE la carte — un tarif, une durée. Capitales
           espacées, comme la charte le demande pour un qualifiant. */
        <p className="mt-2 text-meta font-semibold uppercase" style={{ color: 'var(--color-marque)', letterSpacing: '0.08em' }}>
          {carte.mention}
        </p>
      ) : null}
    </li>
  );
}

function LigneDEncadre({ ligne }: { ligne: LigneEncadree }) {
  if (ligne.href === undefined) return <li>{ligne.texte}</li>;
  return (
    <li>
      {/* Une adresse qu'on ne peut pas ouvrir d'un geste est une adresse qu'il
          faut recopier à la main — deux gestes de trop sur le chemin nominal. */}
      <a href={ligne.href} className="underline underline-offset-2" style={{ color: 'var(--color-marque)' }}>
        {ligne.texte}
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
function BlocRendu({ bloc }: { bloc: Bloc }) {
  switch (bloc.genre) {
    case 'paragraphes':
      return (
        <>
          {bloc.corps.map((texte) => (
            <p key={texte}>{texte}</p>
          ))}
        </>
      );
    case 'liste':
      return <Puces items={bloc.items} />;
    case 'cartes':
      return (
        <ul className="grid gap-3 sm:grid-cols-2">
          {bloc.cartes.map((carte) => (
            <CarteDeBloc key={carte.titre} carte={carte} />
          ))}
        </ul>
      );
    case 'accent':
      return (
        <p
          className="rounded-carte px-4 py-3 font-medium"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-marque) 10%, transparent)',
            borderInlineStart: '3px solid var(--color-marque)',
          }}
        >
          {bloc.corps}
        </p>
      );
    case 'encadre':
      return (
        <ul
          className="space-y-1.5 rounded-carte p-4"
          style={{ backgroundColor: 'var(--color-ios-carte)', border: '0.5px solid var(--color-lisere)' }}
        >
          {bloc.lignes.map((ligne) => (
            <LigneDEncadre key={ligne.texte} ligne={ligne} />
          ))}
        </ul>
      );
  }
}

function SectionRendue({ section }: { section: Section }) {
  return (
    <section className="mt-8">
      <h2 className="text-fil font-bold" style={{ color: 'var(--color-ios-encre)' }}>
        {section.titre}
      </h2>
      <div className="mt-3 space-y-3">
        {section.blocs.map((bloc, i) => (
          <BlocRendu key={i} bloc={bloc} />
        ))}
      </div>
    </section>
  );
}

export function PageInstitutionnelle({ page }: { page: PageDeContenu }) {
  return (
    /* L'encre PLEINE sur tout le corps — charte règle 18 : « l'encre du contenu
       est --color-text ; le gris est réservé à ce qu'on peut ne pas lire ». La
       première version posait l'encre SECONDAIRE ici, ce qui faisait lire une
       politique de confidentialité entière en couleur d'accompagnement. Seules
       la mention de date et le pied prennent l'encre atténuée. */
    <div style={{ backgroundColor: 'var(--color-ios-fond)', color: 'var(--color-ios-encre)' }}>
      <a href="#contenu" className="lien-evitement">
        Aller au contenu
      </a>

      <header className="mx-auto flex max-w-[42rem] items-center gap-3 px-5 pt-6 pb-2">
        <a
          href="/"
          className="flex items-center gap-2 text-marque font-bold"
          style={{ color: 'var(--color-marque)' }}
        >
          Meeshy
        </a>
        <span className="flex-1" />
        <a href="/" className="text-meta underline underline-offset-2">
          Retour à l’accueil
        </a>
      </header>

      <main id="contenu" className="mx-auto max-w-[42rem] px-5 pb-16 text-corps leading-relaxed">
        <h1 className="mt-4 text-ecran font-bold" style={{ color: 'var(--color-ios-encre)' }}>
          {page.titre}
        </h1>
        {page.accroche ? <p className="mt-3 text-second">{page.accroche}</p> : null}
        {page.mention ? (
          <p className="mt-2 text-meta" style={{ color: 'var(--color-ios-encre-3)' }}>
            {page.mention}
          </p>
        ) : null}

        {page.sections.map((section) => (
          <SectionRendue key={section.titre} section={section} />
        ))}

        <section className="mt-10 rounded-heros p-5" style={{ backgroundColor: 'var(--color-ios-carte)' }}>
          <h2 className="text-fil font-bold" style={{ color: 'var(--color-ios-encre)' }}>
            {page.suite.titre}
          </h2>
          {page.suite.accroche ? <p className="mt-2">{page.suite.accroche}</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {page.suite.liens.map((lien) => (
              <a
                key={lien.href}
                href={lien.href}
                className="grid place-items-center rounded-pastille px-5 text-corps font-semibold text-white"
                style={{ backgroundColor: 'var(--color-marque)', minHeight: 52 }}
              >
                {lien.libelle}
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer
        className="mx-auto max-w-[42rem] px-5 pb-8 text-meta"
        style={{ color: 'var(--color-ios-encre-3)' }}
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
