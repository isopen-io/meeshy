import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';

/**
 * LE BANDEAU DIFFÉRÉ — un `<div role="status|alert">` SERVI CACHÉ, que seul
 * un module de participation révèle après le premier pixel (§ 12.4). Extrait
 * de `fil-vue.ts` (site d'origine, le fil) pour que tout écran qui a besoin
 * du MÊME geste — un bandeau à bouton, apparu sans rechargement, jamais créé
 * après coup (« une région de statut créée après coup n'est annoncée par
 * aucun lecteur d'écran ») — le PARTAGE au lieu d'en écrire un second qui
 * diverge. `prefs-vue.ts` en est le second lecteur : la session expirée s'y
 * annonce avec le même bandeau, la même loi, un bouton distinct.
 */
export const bandeau = ({
  classe,
  identifiant,
  role,
  glyphe,
  titre,
  corps,
  action,
  cache,
}: {
  readonly classe: string;
  readonly identifiant: string;
  readonly role: 'status' | 'alert';
  readonly glyphe: string;
  readonly titre: string;
  readonly corps: string;
  readonly action: { readonly libelle: string; readonly href: string };
  readonly cache: boolean;
}): string =>
  `<div class="bandeau ${classe}" id="${identifiant}" role="${role}"${cache ? ' hidden' : ''}>` +
  `<div class="entete">${svgDuSprite(glyphe)}<div><b>${echappe(titre)}</b><p>${echappe(corps)}</p></div></div>` +
  `<a class="action discrete" href="${echappe(action.href)}">${echappe(action.libelle)}</a>` +
  '</div>';
