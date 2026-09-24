// Code exécuté DANS la page rendue : ajuste la légende à sa boîte, ancre les surimpressions à
// l'élément d'interface qu'elles désignent, puis mesure que rien ne déborde. Sérialisé tel quel
// (Function.prototype.toString) : aucune dépendance, aucune variable libre.
function installer() {
  const tolerance = 1
  const scene = () => document.querySelector('.as-canvas, .as-poster')
  const rel = (r, c) => ({ left: r.left - c.left, top: r.top - c.top, right: r.right - c.left, bottom: r.bottom - c.top, width: r.width, height: r.height })

  // Déborde = plus large que sa boîte, ou un enfant / une ligne de texte peinte hors d'elle.
  // (scrollHeight seul ment : une interligne < 1,2 fait « déborder » toute ligne de 3 à 4 px.)
  const deborde = (boite) => {
    if (boite.scrollWidth > boite.clientWidth + tolerance) return true
    const b = boite.getBoundingClientRect()
    const hors = (r) => r.left < b.left - tolerance || r.right > b.right + tolerance || r.top < b.top - tolerance || r.bottom > b.bottom + tolerance
    return [...boite.children].some((k) => hors(k.getBoundingClientRect())) || noeudsTexte(boite).some((n) => rectsTexte(n).some(hors))
  }

  const ajuster = (el) => {
    const boite = el.closest('.as-head') ?? el
    const base = parseFloat(getComputedStyle(el).fontSize)
    let taille = base
    while ((deborde(boite) || el.scrollWidth > el.clientWidth + tolerance) && taille > base * 0.55) {
      taille -= base * 0.03
      el.style.fontSize = `${taille}px`
    }
  }

  const ancrer = (el) => {
    const c = scene().getBoundingClientRect()
    const cible = scene().querySelector(el.dataset.ancre)
    if (!cible) throw new Error(`ancre introuvable : ${el.dataset.ancre}`)
    const r = rel(cible.getBoundingClientRect(), c)
    const rtl = scene().dir === 'rtl'
    const ecart = 6
    const gauche = rtl ? r.right + ecart : r.left - el.offsetWidth - ecart
    el.style.left = `${Math.max(10, Math.min(c.width - el.offsetWidth - 10, gauche))}px`
    el.style.top = `${r.top + Math.min(r.height * 0.22, 34) - el.offsetHeight / 2}px`
  }

  const projeter = (el) => {
    const c = scene().getBoundingClientRect()
    const cible = scene().querySelector(el.dataset.spot)
    if (!cible) throw new Error(`projecteur sans cible : ${el.dataset.spot}`)
    const r = rel(cible.getBoundingClientRect(), c)
    el.style.setProperty('--sx', `${r.left + r.width / 2}px`)
    el.style.setProperty('--sy', `${r.top + r.height / 2}px`)
    el.style.setProperty('--sw', `${r.width * 0.78}px`)
    el.style.setProperty('--sh', `${r.height * 0.82}px`)
  }

  const cerner = (el) => {
    const c = scene().getBoundingClientRect()
    const r = rel(scene().querySelector(el.dataset.anneau).getBoundingClientRect(), c)
    const marge = 5
    Object.assign(el.style, { left: `${r.left - marge}px`, top: `${r.top - marge}px`, width: `${r.width + marge * 2}px`, height: `${r.height + marge * 2}px` })
  }

  const grossir = (el) => {
    const c = scene().getBoundingClientRect()
    const r = rel(scene().querySelector(el.dataset.loupe).getBoundingClientRect(), c)
    const rtl = scene().dir === 'rtl'
    const bord = rtl ? r.left - 16 : r.right + 16 - el.offsetWidth
    el.style.left = `${Math.max(10, Math.min(c.width - el.offsetWidth - 10, bord))}px`
    el.style.top = `${r.bottom + 26}px`
  }

  window.asMiseEnPage = () => {
    document.querySelectorAll('[data-anneau]').forEach(cerner)
    document.querySelectorAll('[data-loupe]').forEach(grossir)
    document.querySelectorAll('[data-fit]').forEach(ajuster)
    document.querySelectorAll('[data-ancre]').forEach(ancrer)
    document.querySelectorAll('[data-spot]').forEach(projeter)
    return true
  }

  const extrait = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 48)

  const rectsTexte = (noeud) => {
    const range = document.createRange()
    range.selectNodeContents(noeud)
    return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
  }

  const noeudsTexte = (racine) => {
    const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    })
    const out = []
    while (w.nextNode()) out.push(w.currentNode)
    return out
  }

  const coupeur = (el, limite) => {
    for (let a = el.parentElement; a && a !== limite.parentElement; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (s.overflowX !== 'visible' || s.overflow !== 'visible') return a
    }
    return null
  }

  const dedans = (r, b) => r.left >= b.left - tolerance && r.right <= b.right + tolerance && r.top >= b.top - tolerance && r.bottom <= b.bottom + tolerance

  window.asVerifier = () => {
    const erreurs = []
    const avertissements = []
    const racine = scene()
    const c = racine.getBoundingClientRect()
    if (document.documentElement.scrollWidth > Math.round(c.width) + tolerance) erreurs.push('la page déborde horizontalement')

    const ecranRacine = racine.querySelector('.device-screen, .as-poster-ecran')
    const gabarit = noeudsTexte(racine).filter((n) => !ecranRacine?.contains(n))
    for (const n of gabarit) {
      for (const r of rectsTexte(n)) {
        if (!dedans(r, c)) erreurs.push(`texte hors de l’image : « ${extrait(n.textContent)} »`)
      }
    }
    const tete = racine.querySelector('.as-head')
    if (tete && deborde(tete)) erreurs.push('la légende déborde de sa boîte')
    racine.querySelectorAll('[data-fit]').forEach((el) => {
      const reduite = parseFloat(el.style.fontSize || '0')
      if (reduite) avertissements.push(`légende réduite à ${Math.round(reduite)} px pour tenir`)
    })
    racine.querySelectorAll('.as-caption, .as-rangee, .as-poster-textes').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + tolerance) erreurs.push(`${el.className} : contenu plus large que sa boîte`)
      for (const n of noeudsTexte(el)) {
        const b = el.getBoundingClientRect()
        for (const r of rectsTexte(n)) if (r.left < b.left - tolerance || r.right > b.right + tolerance) erreurs.push(`texte hors de sa boîte : « ${extrait(n.textContent)} »`)
      }
    })
    racine.querySelectorAll('.as-rangee').forEach((el) => {
      if (deborde(el)) erreurs.push('une rangée de surimpressions est rognée')
    })
    const legende = racine.querySelector('.as-caption')
    const appareil = racine.querySelector('.device')
    if (legende && appareil && legende.getBoundingClientRect().bottom > appareil.getBoundingClientRect().top - 4) {
      erreurs.push('la légende touche l’appareil')
    }

    if (ecranRacine) {
      const visible = ecranRacine.getBoundingClientRect()
      for (const n of noeudsTexte(ecranRacine)) {
        const el = n.parentElement
        const s = getComputedStyle(el)
        if (s.visibility === 'hidden' || s.opacity === '0') continue
        if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + tolerance) {
          avertissements.push(`ellipse dans l’écran : « ${extrait(n.textContent)} »`)
          continue
        }
        const coupe = coupeur(el, ecranRacine)
        if (!coupe) continue
        const b = coupe.getBoundingClientRect()
        if (b.bottom < visible.top || b.top > Math.min(visible.bottom, c.bottom)) continue
        for (const r of rectsTexte(n)) {
          if (r.bottom < visible.top || r.top > Math.min(visible.bottom, c.bottom)) continue
          if (r.left < b.left - tolerance || r.right > b.right + tolerance) {
            avertissements.push(`texte coupé dans l’écran : « ${extrait(n.textContent)} »`)
            break
          }
        }
      }
    }
    return { erreurs: [...new Set(erreurs)], avertissements: [...new Set(avertissements)] }
  }
}

export const MISE_EN_PAGE = `(${installer.toString()})()`
