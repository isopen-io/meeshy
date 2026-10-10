import type { ReactNode } from 'react';

import { Sheet } from '@/components/sheet';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LE DÉTAIL D'UNE ZONE, EN MODALE** (spec 2026-10-04 § 1, patron « synthèse →
 * modale ») — une carte résumée (`AdminSummaryCard`) dit deux à quatre chiffres
 * d'une zone ; « Ouvrir » montre ici ce que la zone contient en entier :
 * graphiques, classements, listes, blocs de cartes.
 *
 * **LE CONTENU N'EST MONTÉ QU'À L'OUVERTURE.** Fermée, la feuille ne rend rien :
 * aucun de ses blocs ne monte, aucune de leurs requêtes ne part. C'est ce qui
 * rend le hub léger — il ne lit que les chiffres des cartes, et un graphique ne
 * coûte une lecture qu'à celui qui le regarde.
 *
 * Bâtie sur `Sheet` (dialogue natif : piège de focus, Échap, inertie de
 * l'arrière-plan), en modale LARGE (`presentation="wide"`, 64 rem, gouttière
 * d'1 rem sur un téléphone), corps `div` qui défile, croix nommée dans la langue
 * d'ADMINISTRATION (« Close » sur une interface allemande, D-162). Le corps est
 * un conteneur (`@container`) : les grilles des blocs choisissent leurs colonnes
 * d'après la largeur de la modale, pas celle de la fenêtre.
 *
 * L'ouverture vit d'ordinaire dans l'adresse (`useAdminOpen`, `?open=<id>`) :
 * `inAddress` dit alors à la feuille de ne PAS poser sa propre entrée
 * d'historique — l'adresse a poussé la sienne, le retour la consomme.
 *
 * ```tsx
 * const sheet = useAdminOpen(['platform', 'usage'] as const);
 * <AdminSummaryCard … id="platform" onOpen={() => sheet.open('platform')} />
 * <AdminDetailSheet language={language} id="platform" title={…} open={sheet.active === 'platform'} onClose={sheet.close} inAddress={sheet.inAddress}>
 *   <PlatformBlock … />
 * </AdminDetailSheet>
 * ```
 */
export function AdminDetailSheet({
  language,
  id,
  title,
  open,
  onClose,
  inAddress = false,
  children,
}: {
  readonly language: AdminLanguage;
  /** L'ancre de recette : `data-admin-detail="<id>"`. */
  readonly id: string;
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
  /** L'ouverture vit dans l'adresse (`useAdminOpen().inAddress`) : la feuille ne pose pas d'entrée d'historique. */
  readonly inAddress?: boolean;
  readonly children: ReactNode;
}) {
  if (!open) return null;
  return (
    <Sheet
      title={title}
      presentation="wide"
      bodyAs="div"
      backEntry={!inAddress}
      closeLabel={translateAdmin(language, 'admin.kit.close')}
      onClose={onClose}
    >
      <div data-admin-detail={id} className="@container grid content-start gap-6 px-4 pb-4 pt-2">
        {children}
      </div>
    </Sheet>
  );
}
