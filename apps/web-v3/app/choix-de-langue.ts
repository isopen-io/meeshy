import { svgDuSprite } from '@/app/actifs-inlines';
import { compacte } from '@/app/enveloppe/feuille';
import { echappe } from '@/app/socle';
import { nomDeLangue } from '@/lib/contenu/langues';

/**
 * LE CHOIX DE LA LANGUE D'UN CONTENU — `sheet:lang` de la matrice, servi par
 * les quatre écrans qui rendent une publication.
 *
 * CE QUE LA MATRICE DEMANDE, ET CE QUI EST SERVI. Elle le dessine en
 * `<dialog>` natif, « ouvrable au clavier et fermable par Échap ». Un
 * `<dialog>` ne s'OUVRE que par `showModal()` : c'est du JavaScript, sur des
 * écrans que `budgets.json` gate à 0 Ko de JS de page. La forme retenue est le
 * `<details>` natif — que la story sert depuis sa livraison —, et elle tient
 * le critère qui COMPTE : « choisir une langue MUTE le texte rendu ». Elle est
 * opérable au clavier sans une ligne de script, et le retour arrière du
 * navigateur y annule le choix, ce qu'une modale n'offre pas.
 *
 * UNE LANGUE OFFERTE EST UNE LANGUE PORTÉE. La liste vient de ce que la
 * publication contient RÉELLEMENT — son original et les traductions qui ont un
 * texte —, jamais d'un catalogue : offrir une langue qu'aucun texte ne porte
 * serait un contrôle sans effet (charte règle 7).
 *
 * SOUS DEUX LANGUES, RIEN N'EST RENDU. Un sélecteur à une entrée ne change
 * rien ; il est ABSENT, pas grisé — un contrôle inerte occupe la place d'un
 * contrôle, et le lecteur au clavier le rencontre pour rien.
 *
 * L'ADRESSE EST UNE FONCTION, et c'est ce qui rend ce composant partageable :
 * `/stories/:id?lang=`, `/reels/:id?lang=`, `/moods/:id?lang=` et
 * `/post/:id?lang=` ne diffèrent que par leur base, et chaque hôte sait la
 * sienne. Recopier ce bloc chez chacun aurait fait quatre sélecteurs dont
 * trois auraient manqué le prochain correctif.
 */
export const choixDeLangue = ({
  languesOffertes,
  langueLue,
  adresse,
  libelle,
}: {
  readonly languesOffertes: readonly string[];
  /** La langue effectivement lue — celle que le Prisme a élue, ou celle d'origine. */
  readonly langueLue: string | null;
  readonly adresse: (langue: string) => string;
  readonly libelle: string;
}): string => {
  if (languesOffertes.length < 2) return '';

  return (
    '<details class="langues">' +
    `<summary title="${echappe(libelle)}">${svgDuSprite('ph-translate')}<span class="hors-ecran">${echappe(libelle)}</span></summary>` +
    `<ul aria-label="${echappe(libelle)}">` +
    languesOffertes
      .map(
        (langue) =>
          `<li><a href="${echappe(adresse(langue))}"${langue === langueLue ? ' aria-current="true"' : ''} lang="${echappe(langue)}">` +
          `${echappe(nomDeLangue(langue))}</a></li>`,
      )
      .join('') +
    '</ul></details>'
  );
};

/**
 * LE STYLE DU SÉLECTEUR VOYAGE AVEC LUI.
 *
 * Ces règles vivaient dans la feuille de la story. Le jour où `/post/:id` a
 * monté le même composant, il l'aurait rendu NU — un `<details>` sans son
 * plan, sa cible de 44 px ni son repère de langue courante —, et rien n'aurait
 * rougi : le document est valide, l'arbre d'accessibilité correct, seule
 * l'apparence est fausse. Un composant partagé qui laisse son style derrière
 * lui est une jumelle d'un genre plus discret.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1) ; la liste
 * flotte au-dessus du contenu, ce que dit son `position:absolute`.
 */
export const FEUILLE_DU_CHOIX_DE_LANGUE = compacte(`
.langues{position:relative;flex:none}
.langues summary{display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);list-style:none;cursor:pointer;color:var(--color-primary)}
.langues summary::-webkit-details-marker{display:none}
.langues summary svg{width:var(--glyph);height:var(--glyph)}
.langues ul{position:absolute;inset-inline-end:0;z-index:1;margin:var(--space-1) 0 0;padding:var(--space-2);min-width:var(--action-width);list-style:none;border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface)}
.langues li a{display:flex;align-items:center;min-height:var(--target-min);padding:0 var(--space-3);border-radius:var(--radius-pill);font-size:var(--text-base);text-decoration:none}
.langues li a[aria-current]{background:var(--color-tint-primary);font-weight:var(--font-weight-semibold)}
`);
