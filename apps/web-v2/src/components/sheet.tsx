import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Glyph } from './glyph';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/**
 * LA FEUILLE PLEIN ÉCRAN, CHERCHABLE (#5555, correction de revue défaut 4) —
 * l'hôte des choix longs : pays, langue lue, et les listes des 40+ surfaces à
 * venir.
 *
 * POURQUOI `<dialog>` ET PAS `<div role="dialog" aria-modal="true">`. Les
 * deux premières feuilles étaient des `div` : au clavier, la tabulation
 * continuait DERRIÈRE la feuille dans le formulaire d'inscription — on
 * pouvait taper son mot de passe sans voir le champ — et Échap ne fermait
 * rien. `aria-modal="true"` ANNONCE une modale ; il n'en fait pas une. Ouvert
 * par `showModal()`, `<dialog>` REND les trois comportements que l'annonce
 * promettait : le piège de focus, la touche Échap, et l'inertie de tout ce
 * qui est derrière — sans une ligne de gestion de touches à maintenir dans
 * trente écrans.
 *
 * `onClose` est branché sur l'événement `close` du DIALOGUE, jamais sur le
 * seul bouton : Échap et le bouton passent alors par le MÊME chemin, et il
 * n'existe pas d'état où la feuille est fermée pour le navigateur mais
 * toujours montée pour React.
 *
 * LE CONTENU RESTE À L'APPELANT (la liste, son filtrage, son état vide) :
 * cette coquille porte le comportement modal, l'en-tête et le champ de
 * recherche — c'est-à-dire exactement ce qui serait recopié de travers.
 *
 * LE CHAMP DE RECHERCHE EST OPTIONNEL (#5814, § 5 étape 4) — les feuilles
 * « Détails du message » et « Ajouter une réaction » n'ont rien à filtrer :
 * une recherche sur cinq lignes ou vingt emojis fixes n'a aucun effet, et un
 * contrôle sans effet est le défaut que la loi 4 du dépôt interdit. Les
 * quatre props de recherche vont ENSEMBLE (aucune n'a de sens seule) —
 * absentes, le bandeau de recherche ne se monte pas du tout.
 */
export function Sheet({
  title,
  searchLabel,
  searchPlaceholder,
  search,
  onSearchChange,
  onClose,
  children,
}: {
  title: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  /**
   * LE RETOUR MATÉRIEL FERME LA FEUILLE, PAS L'ÉCRAN (correction de revue,
   * défaut 5 — MESURÉ sur l'émulateur Android).
   *
   * `<dialog>` répond à Échap, mais Échap n'est PAS le retour d'Android :
   * `MainActivity` (coque, #5604) appelle `webView.goBack()` dès que la
   * WebView a de l'historique, sans savoir qu'une modale est ouverte. Mesuré
   * sur `Meeshy_Poc_Web-v31` : feuille de langue ouverte sur `/signup`, un
   * appui BACK rendait `/login` — la feuille fermée ET le formulaire perdu,
   * saisie comprise, pour un seul geste.
   *
   * LE GESTE VIT DÉSORMAIS DANS `useBackDismiss` (revue #5814, défaut majeur
   * 6) — extrait d'ici pour que `MessageMenu` (un portail, pas un
   * `<dialog>`) et toute couche future (visionneuse de média…) le partagent,
   * plutôt que de le réécrire une jumelle divergente.
   */
  useBackDismiss(onClose);

  /** Le comportement PROPRE au `<dialog>` (le piège de focus/Échap natifs) —
   * distinct du geste de retour ci-dessus, qui ne connaît rien de `<dialog>`. */
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      style={{
        margin: 0,
        padding: 0,
        border: 0,
        width: '100%',
        maxWidth: '100%',
        height: '100%',
        maxHeight: '100%',
        backgroundColor: 'var(--color-ios-surface)',
        color: 'var(--color-ios-ink)',
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 px-4 pt-safe pb-2">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="grid place-items-center rounded-chip"
            style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink-2)' }}
            aria-label="Fermer"
          >
            <Glyph name="x" size={20} />
          </button>
          <h2 id={titleId} className="flex-1 text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {title}
          </h2>
        </div>

        {onSearchChange === undefined ? null : (
          <div className="shrink-0 px-4 pb-2">
            <div
              className="flex items-center gap-2 rounded-[14px] px-4"
              style={{ minHeight: 44, backgroundColor: 'var(--color-ios-card)' }}
            >
              <Glyph name="magnifyingGlass" size={18} style={{ color: 'var(--color-ios-ink-3)' }} />
              <input
                type="search"
                value={search ?? ''}
                onChange={(e) => onSearchChange(e.currentTarget.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent py-2 text-body outline-none"
                style={{ color: 'var(--color-ios-ink)' }}
                aria-label={searchLabel}
              />
            </div>
          </div>
        )}

        <ul className="flex-1 overflow-y-auto pb-safe">{children}</ul>
      </div>
    </dialog>
  );
}

/** L'état VIDE d'une feuille — une liste qui ne rend rien n'est pas un état
 * (règle du chantier), et les deux feuilles doivent le dire de la MÊME façon. */
export function SheetEmpty({ label }: { label: string }) {
  return (
    <li className="px-4 py-6 text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
      {label}
    </li>
  );
}
