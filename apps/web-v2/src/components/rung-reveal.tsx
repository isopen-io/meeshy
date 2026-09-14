import { useEffect, useState, type ReactNode } from 'react';

/**
 * UN BARREAU QUI PARAÎT (#6405) — le ressort d'entrée des champs de
 * l'inscription, et rien d'autre.
 *
 * **Tant qu'il n'est pas paru, il n'existe pas.** Un bloc replié mais MONTÉ
 * laisserait ses champs dans l'ordre de tabulation, dans le formulaire envoyé
 * et dans l'arbre d'accessibilité — un champ « invisible » qu'un lecteur
 * d'écran annonce et qu'une tabulation atteint est pire qu'un champ visible.
 * Le rendu conditionnel, lui, ne ment à personne.
 *
 * **L'animation est une ENTRÉE, jamais une sortie.** La loi des barreaux est
 * monotone (`signup-rungs.ts`) : rien ne se referme, donc il n'y a rien à
 * animer en sens inverse. Le ressort est celui que l'inscription emploie déjà
 * (`.signup-spring`, `app.css` § « LE RESSORT DU COMPOSER ») : une grille
 * `0fr → 1fr`, donc la HAUTEUR réelle du contenu, jamais une valeur devinée
 * qui se couperait au premier cran de Dynamic Type. `prefers-reduced-motion`
 * la coupe déjà, à la source.
 *
 * Le premier rendu pose `0fr`, l'effet de montage passe à `1fr` : sans ces
 * deux temps, le navigateur n'a aucune valeur de départ à interpoler et le
 * bloc paraîtrait d'un coup.
 */
export function RungReveal({ shown, children }: { readonly shown: boolean; readonly children: ReactNode }) {
  if (!shown) return null;
  return <RevealBody>{children}</RevealBody>;
}

function RevealBody({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(true);
  }, []);
  return (
    <div className="signup-spring grid" style={{ gridTemplateRows: open ? '1fr' : '0fr' }} data-rung-reveal={open ? 'open' : 'opening'}>
      <div className="grid gap-5 overflow-hidden">{children}</div>
    </div>
  );
}
