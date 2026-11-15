import { html } from '../lib/html.mjs'
import { icon } from '../lib/icons.mjs'
import { photo } from '../lib/photos.mjs'
import { bubble, heure } from './conversation.mjs'

// BubbleStandardLayout.visualMediaGrid : une photo occupe 300 × 240, deux se partagent 300 × 180
// (écart de 2 pt), coins de 16 pt sur fond noir. Sans texte, l'heure se pose SUR la grille
// (BubbleFooter .overlay, coin bas) ; avec un texte, la grille est suivie de sa bulle, qui porte
// le pied — et, en groupe, l'identité de l'expéditeur.
const grille = ({ ctx, photos, time, mine, pied }) =>
  html`<div class="media-grid n${photos.length}">
    ${photos.map((nom) => html`<div class="media-cell">${photo(nom)}</div>`)}
    ${pied ? html`<span class="media-footer">${heure(ctx.lang, time)}${mine ? icon('checks', { size: 13 }) : ''}</span>` : ''}
  </div>`

export const messagePhotos = ({ ctx, photos, contenu, mine = false, accent, time, auteur, identite = false, reactions }) =>
  html`<div class="msg-row ${mine ? 'mine' : 'theirs'} media">
    ${grille({ ctx, photos, time, mine, pied: !contenu })}
    ${reactions && !contenu ? html`<div class="reactions glass">${reactions}</div>` : ''}
  </div>
  ${contenu ? bubble({ ctx, contenu, auteur, mine, accent, time, identite, reactions }) : ''}`
