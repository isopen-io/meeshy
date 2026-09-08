import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Glyph } from './glyph';

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
  searchLabel: string;
  searchPlaceholder: string;
  search: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  /** `onClose` par RÉFÉRENCE : l'effet ci-dessous ne doit s'exécuter qu'au
   * montage — le rebrancher à chaque rendu de l'hôte (qui recrée la fonction)
   * empilerait une entrée d'historique par frappe dans le champ de recherche. */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

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
   * Le correctif est celui que le web emploie depuis toujours pour ses
   * couches : la feuille POSE une entrée d'historique (même URL — le routeur
   * la voit identique et ne re-rend rien, `router.tsx` § `notify`) et se
   * ferme sur `popstate`. Le retour CONSOMME donc l'entrée de la feuille au
   * lieu de quitter l'écran. Fermée autrement (Échap, le bouton), elle REND
   * son entrée (`history.back()`) pour qu'un retour ultérieur ne soit pas
   * avalé. Il vit ici et pas dans les deux feuilles : toute couche à venir —
   * visionneuse de média, menus, composer — hérite du même geste.
   */
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();

    window.history.pushState(null, '');
    let consumedByHistory = false;
    const onPopState = () => {
      consumedByHistory = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      if (dialog.open) dialog.close();
      if (!consumedByHistory) window.history.back();
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

        <div className="shrink-0 px-4 pb-2">
          <div
            className="flex items-center gap-2 rounded-[14px] px-4"
            style={{ minHeight: 44, backgroundColor: 'var(--color-ios-card)' }}
          >
            <Glyph name="magnifyingGlass" size={18} style={{ color: 'var(--color-ios-ink-3)' }} />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.currentTarget.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent py-2 text-body outline-none"
              style={{ color: 'var(--color-ios-ink)' }}
              aria-label={searchLabel}
            />
          </div>
        </div>

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
