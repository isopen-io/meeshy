import { reelsExitOf, type HistoryView } from '@/lib/reels/exit';

type VisibilityPage = {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
};

export type ShellLeaveHost = {
  readonly open: (target: string) => void;
  readonly document: VisibilityPage;
  readonly history: () => HistoryView;
  readonly back: () => void;
  readonly home: () => void;
  readonly inside: (target: string) => string | null;
  readonly go: (path: string) => void;
};

/**
 * **LA COQUE QUITTE UNE PAGE DE PASSAGE** (#8322). Sous Android, une
 * navigation vers un hôte externe est ANNULÉE par `Bridge.launchIntent`
 * (`@capacitor/android` 8.5.1), qui remet l'adresse au navigateur : le
 * document ne part pas, et la page qui attendait de partir attend pour
 * toujours. Le recul se fait au RETOUR au premier plan, jamais avant : une
 * traversée d'historique lancée pendant la navigation en cours pourrait
 * l'annuler avant que la coque ne l'ait remise. Même règle de sortie que les
 * Réels (`reelsExitOf`) : une entrée Meeshy derrière soi ⇒ on y revient ;
 * sinon (ouverture par App Link) ⇒ la liste.
 *
 * Une cible qui est un ÉCRAN de Meeshy (#10329) ne part pas : sur le web,
 * `location.replace` reste sur l'origine de l'app ; dans la coque, l'hôte
 * meeshy.me n'est pas `localhost`, et la cible partirait au Custom Tab. Le
 * routeur y navigue, sans écoute de retour.
 */
export function shellLeave(host: ShellLeaveHost): (target: string) => void {
  return (target) => {
    const path = host.inside(target);
    if (path !== null) {
      host.go(path);
      return;
    }
    const onVisibility = () => {
      if (host.document.visibilityState !== 'visible') return;
      host.document.removeEventListener('visibilitychange', onVisibility);
      if (reelsExitOf(host.history()) === 'back') host.back();
      else host.home();
    };
    host.document.addEventListener('visibilitychange', onVisibility);
    host.open(target);
  };
}
