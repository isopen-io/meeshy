import type { ReactNode } from 'react';

/**
 * LA COQUILLE — deliberement mince.
 *
 * Il n'y a NI barre d'onglets NI barre de navigation : l'app iOS n'en a
 * aucune (`.navigationBarHidden(true)` partout), chaque ecran dessine son
 * propre en-tete flottant. Une coquille qui poserait ici un chrome commun
 * ferait diverger les deux interfaces des le premier ecran.
 *
 * Ce qu'elle porte, et qu'aucun ecran ne doit reimplementer : le lien
 * d'evitement, VISIBLE au clavier — un lien d'evitement invisible n'evite
 * rien.
 */
export default function Coquille({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#contenu"
        className="lien-evitement"
      >
        Aller au contenu
      </a>
      {children}
    </div>
  );
}
