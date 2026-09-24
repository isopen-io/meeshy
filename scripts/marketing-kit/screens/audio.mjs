import { html } from '../lib/html.mjs'
import { icon } from '../lib/icons.mjs'
import { langue } from '../lib/langues.mjs'

// AudioPlayerView.waveformHeight — la forme de repli de l'app quand les échantillons ne sont
// pas encore analysés : 5 + sin(s)·6 + cos(s/2)·4, bornée à [2, 22], s = 7i + 3.
export const waveformHeights = (count) =>
  Array.from({ length: count }, (_, i) => {
    const seed = i * 7 + 3
    return Math.max(2, Math.min(22, 5 + Math.sin(seed) * 6 + Math.cos(seed * 0.5) * 4))
  })

const pastille = ({ drapeau, libelle, active }) =>
  html`<span class="audio-lang${active ? ' active' : ''}"><span class="f">${drapeau}</span>${libelle}</span>`

export const audioBubble = ({ ctx, duree, ecoule, progression, pistes, active, transcription, time, heure }) => {
  const barres = waveformHeights(38)
  const jouees = Math.round(barres.length * progression)
  const piste = langue(active)
  return html`<div class="msg-row mine">
    <div class="bubble mine audio">
      <div class="audio-player">
        <div class="audio-play">${icon('pause', { size: 16 })}</div>
        <div class="audio-wave-col">
          <div class="audio-wave">${barres.map((h, i) => html`<i class="${i < jouees ? 'on' : ''}" style="height:${h.toFixed(1)}px"></i>`)}</div>
          <div class="audio-times"><span>${ecoule}</span><span>${duree}</span></div>
        </div>
        <div class="audio-chips"><span>1x</span><span class="on">${Math.round(progression * 100)}%</span></div>
      </div>
      <div class="audio-transcript" lang="${active}" dir="auto">
        <span class="t-flag">${piste.drapeau}</span><span>${transcription}</span>
      </div>
      <div class="audio-strip">
        ${pastille({ drapeau: '🔊', libelle: ctx.ui('media.audio.original'), active: false })}
        ${pistes.map((code) => pastille({ drapeau: langue(code).drapeau, libelle: langue(code).nom, active: code === active }))}
      </div>
      <div class="audio-footer"><span class="pill">${heure(ctx.lang, time)} ${icon('checks', { size: 13 })}</span></div>
    </div>
  </div>`
}
