import { Glyph } from './glyph';
import { MenuGlyph } from './menu-glyph';
import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from './chrome-action';
import type { FloatingDestination } from '@/lib/view/floating-menu';
import { Link } from '@/routes/route-table';

/**
 * **L'ÉCRAN D'ATTENTE D'UNE DESTINATION FLOTTANTE** (#6214).
 *
 * Les huit destinations des deux menus flottants ont une adresse avant d'avoir
 * un contenu. Ce choix n'est pas un pis-aller : **un barreau qui ouvre une
 * adresse inexistante est un contrôle qui ment** (loi 4 de la planche), et ce
 * dépôt a déjà payé ce défaut sur le rail des stories, dont chaque tuile
 * pointait vers un fil « faute de route ».
 *
 * **Ce que cet écran n'est pas : une page vide.** Un écran qui ne dit rien est
 * PIRE qu'une 404 — la 404 annonce au moins une adresse fausse, tandis qu'un
 * blanc laisse croire à une panne. Trois choses le sauvent de ça, et elles
 * sont exactement les trois que la dimension 8 demande d'un état vide : il se
 * NOMME, il PROMET, et il OFFRE UNE SORTIE.
 *
 * **Un seul site pour les huit.** Huit copies d'un même écran auraient divergé
 * avant d'être remplacées — c'est mesuré trois fois dans cette application
 * (trois pastilles de non-lus, trois ronds de chrome, trois flous de verre), et
 * chaque fois la divergence s'est produite pendant que personne ne regardait.
 * Chacun des huit sera remplacé par son vrai contenu dans une issue à lui ; ce
 * fichier disparaîtra avec le dernier.
 *
 * Le glyphe est DÉCORATIF (`aria-hidden` par défaut dans `Glyph`) : le titre le
 * nomme déjà, et l'annoncer une seconde fois ferait lire deux fois la même
 * chose au lecteur d'écran.
 */
export function PendingScreen({ destination }: { readonly destination: FloatingDestination }) {
  const { glyph, label, promise, tint } = destination;

  return (
    <main className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="flex shrink-0 items-center gap-1 px-2 pt-3 pb-2">
        <Link
          to="list"
          aria-label="Revenir aux conversations"
          className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <ChromeActionDisc>
            <Glyph name="caretLeft" size={16} />
          </ChromeActionDisc>
        </Link>
        <h1 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink-1)' }}>
          {label}
        </h1>
      </header>

      <div
        id="contenu"
        className="flex flex-1 flex-col items-center justify-center gap-4 px-8 pb-safe text-center"
      >
        <span
          className="grid size-16 place-items-center rounded-hero"
          style={{
            color: tint,
            backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`,
          }}
        >
          <MenuGlyph glyph={glyph} size={30} />
        </span>
        <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink-1)' }}>
          {promise}
        </p>
        <p className="text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
          Cet écran arrive bientôt.
        </p>
      </div>
    </main>
  );
}
