# Glossario dell’epopea — italiano

> Tradotto termine per termine dalla fonte francese `fr.md` (concezione `docs/superpowers/specs/2026-10-20-epopee-du-jeu-design.md`, § 2, § 3, § 4). In caso di divergenza, la concezione ha ragione, poi `fr.md`, e questo glossario si corregge. Issue: #11174.
>
> Questo glossario fa fede per i testi italiani del gioco sul web, su iOS e nel gateway: **un termine per concetto, lo stesso ovunque.**
>
> La sua proiezione verificabile è `packages/shared/design/game-epic-vocabulary/it.json` (le parole bandite e i nomi canonici), che la guardia web `apps/web/src/lib/game/epic-vocabulary.test.ts` applica a ogni valore dei cataloghi italiani del gioco. Una regola che entra qui entra là, nello stesso commit. Formato: `README.md`.

## Ciò che non cambia mai

- **Le regole del gioco**: soglie, prezzi, guadagni, tetti. Nessun numero si muove.
- **Le chiavi del filo**: `etincelle`, `lumiere`, le chiavi di rango, di torneo (`league`), di forma della Fiamma, i nomi dei campi serviti. Cambia solo il TESTO mostrato.
- I parametri (`{count}`, `{level}`…) e le famiglie plurali (`.one`, `.other`) di ogni chiave. L’italiano usa le stesse due forme del francese.

## Il racconto in una pagina

Il giocatore connesso è **l’eroe**. La sua ricerca: diventare una **Leggenda**. Oltre, il **Mito** aspetta solo cento eletti, «quelli che il dio dei loro antenati precede».

Ogni vero scambio fa scaturire **scintille**. Insieme, formano **la tua luce**. I tuoi **antenati** vegliano su di te: ogni notte ti mandano un **sogno** da compiere; a ogni evoluzione **si manifestano**. Ad Ambasciatore si rivelano: riconosci la loro terra fra sette (Africa eterna, Egitto solare, Olimpo, Impero celeste, Aurore del Nord, Abissi, Neon).

**Mee e Meo**, due colibrì, portano i messaggi fra i due mondi. Guidano ogni tappa dell’accoglienza e parlano la voce del racconto. Agiscono o parlano: mai un decoro.

**Il dio degli antenati** non è mai nominato né disegnato. Parla una volta sola, alla soglia del Mito.

## Le due voci

| Voce | Dove | Forma | Esempio |
|---|---|---|---|
| **A, la sintesi** | banda del giocatore, pastiglie, blasone accanto a un nome, riquadri della vista principale di Progressi | un nome breve e il suo numero | «Traghettatore IV», «12 Meesh · Scarsella», «Giada · 4º» |
| **B, il racconto prima** | pagina Progressi dettagliata, schede dei concetti, carte di Mee e Meo, segni degli antenati, fogli di dettaglio, quaderno delle regole | la frase guida, il numero esatto segue in piccolo | «La tua Scarsella custodisce 12 Meesh», poi in piccolo «lo Scrigno a 50» |

Una superficie non classificata: se c’è posto per una frase, B; altrimenti A. Le parole bandite spariscono in entrambe le voci.

Il tono: si dà del **tu**, si scrive per un ragazzo di 13 anni, un’idea per frase. In una frase, «gloria» si scrive minuscola e si lega con «di»: «+250 di gloria». Davanti a un «+N», uno spazio indivisibile (` `), mai uno spazio semplice. «Meesh» è invariabile: «una Meesh», «12 Meesh». Il numero di una moneta si scrive «n.»: «la Meesh n. 92».

## Le parole bandite (ovunque)

| Parola bandita | Ciò che la sostituisce | Francese |
|---|---|---|
| aumentare, far salire (un valore) | crescere, nutrire, risvegliarsi, brillare più forte | augmenter |
| contatore | il nome del concetto («la tua gloria», «la tua Fiamma») | compteur |
| valore, valore reale | «la tua luce» | valeur |
| convertibili, in tasca, tasca | «la tua luce» | convertibles, en poche |
| potenziale | niente: si dice ciò che si possiede | potentiel |
| debito | «un’ombra vela N scintille della tua luce» (l’**Ombra**) | dette |
| record (totale di sempre) | «ricevute da sempre» | record |
| record di livello | «la tua luce più alta» | record de niveau |
| record di Fiamma, di serie | «la tua Fiamma più lunga» | record de Flamme |
| record di Meesh | «coniate da sempre» | record de Meeshes |
| ancora N prima di X | in piccolo, «N fino a X» | encore N avant X |
| costa, costo (su una scheda) | una frase: «fissa N scintille della tua luce»; il calcolo va nelle regole | coûte, prix |
| resterà | niente: nessuna sottrazione su una scheda | restera |
| tariffa | «ogni gesto fa scaturire le sue» | barème |
| prezzo base, percentuale, fattore (su una scheda) | niente: il calcolo vive nelle regole | prix de base, pourcentage, facteur |
| voi, vostro (al giocatore) | tu, tuo: il gioco dà del tu | vous, votre |

## Una parola, un senso

| Parola | Ora designa | Non designa più |
|---|---|---|
| Brace | la prima forma della Fiamma | il primo stato del livello (→ Scintilla) |
| Luce | la tua luce, il filo intero (la Luce dell’eroe) | uno stato del livello (→ Chiarore) |
| Forziere | la quarta custodia dell’Eredità | il forziere del giorno (→ l’Offerta) |
| Tesoro | la quinta custodia dell’Eredità | il concetto intero (→ l’Eredità) |
| Scrigno | la terza custodia dell’Eredità | un contenitore qualsiasi (→ custodia) |
| Stella | il cielo: lo stato Stella, il cielo degli antenati, i frammenti di stella, le stelle delle medaglie | la Rinascita (→ Ere), il viaggio (→ passi), il nome delle soglie di una medaglia (→ Gradini) |
| Tappa | l’accoglienza soltanto («Tappa 2 di 7», «Le sette tappe») | la soglia dei dieci livelli (→ prova), il viaggio (→ sosta) |
| Passo | il viaggio soltanto | le prove dei dieci livelli (→ prova), l’accoglienza (→ tappa) |
| Gradino | le soglie delle Sfide e delle medaglie | le cinque divisioni del rango (→ scalino) |
| Rango | il nome che il mondo dà all’eroe | il posto nel torneo (→ posto) |
| Record | più nulla | vedi «da sempre», «la tua luce più alta», «la tua Fiamma più lunga», «coniate da sempre» |

## I concetti

### La Luce (il livello — `game.level.*`, `game.tier.*`, prove `level-steps`)

- **Che cos’è**: la luce dell’eroe, che attraversa venti stati. Il suo livello è il numero dell’anello.
- **I venti stati**: **Scintilla** (chiave `etincelle`, mai «Brace»), Barlume, **Chiarore** (chiave `lumiere`, mai «Luce»), Splendore, Raggio, Aurora, Cometa, Stella, Costellazione, Galassia, poi Nebulosa, Pulsar, Quasar, Supernova, Magnetar, Ammasso, Superammasso, Cosmo, Infinito, Singolarità.
- **La prova** (fr. épreuve): ogni dieci livelli, da 10 a 100, gli antenati chiedono una prova (una Meesh, un sogno, una Fiamma, un rango). Finché non è superata, la luce aspetta.
- **Il rango apre la luce**: la Supernova è il limite sotto Ambasciatore, Ambasciatore apre fino alla Singolarità, Oracolo toglie ogni limite.
- **A**: anello «34» · Splendore; «Livello 34».
- **B**: «La tua luce brilla come Splendore», poi in piccolo «livello 34 · 3 200 scintille fino al livello 35».
- **Bandite**: «ancora N prima del livello X» → «N scintille fino al livello X»; «passo» (del livello) → «prova»; «record di livello» → «la tua luce più alta».

### Le Scintille (`game.sparks.*`, `game.points.*`)

- **Che cos’è**: l’unità. Ogni vero scambio fa scaturire scintille; insieme formano **la tua luce**.
- **I nomi**: la tasca = «la tua luce»; il ciclo = «in quest’Era» (dalla tua ultima rinascita); il totale di sempre = «ricevute da sempre»; il debito = **l’Ombra**.
- **La scheda** si chiama «Scintille». La sua testa: «La tua luce», **108 233 scintille** in grande, «377 752 ricevute da sempre» in piccolo.
- **A**: «108 233 scintille».
- **B**: «La tua luce conta 108 233 scintille», poi in piccolo «377 752 ricevute da sempre».
- **L’Ombra**: «Un’ombra vela N scintille della tua luce: le tue prossime scintille la dissiperanno. Finché c’è, non si conia.» In pastiglia: «Un’ombra su N scintille».
- **Bandite**: «convertibili», «valore reale», «potenziale», «record di scintille», «in tasca» → «la tua luce»; «debito» → l’Ombra; «tariffa» → «ogni gesto fa scaturire le sue».

### Il Rango (la gloria — `game.glory.*`, `game.rank.*`)

- **Che cos’è**: il nome che il mondo dà all’eroe. La gloria lo dà, e non arretra mai.
- **I ranghi**: Sussurro, Eco, Voce, Narratore, Traghettatore, Poliglotta, Ambasciatore, Oratore, Oracolo, Leggenda, poi il **Mito** (cento eletti).
- **Gli scalini** (fr. marches): cinque per rango, da V (il primo) a I (il più alto). «Gradino» resta alle Sfide e alle medaglie.
- **A**: «Traghettatore IV»; «gloria 44 600».
- **B**: «Ti chiamano Traghettatore», poi in piccolo «secondo scalino · gloria 44 600».
- **Bandite**: «ancora N di Gloria prima di X» → «N di gloria fino a X»; «+250 Gloria» → «+250 di gloria»; «contatore» → «la tua gloria».

### L’Eredità (`game.treasury.*`, `game.meesh.*`, `game.mint.*`)

- **Che cos’è** (fr. l’Héritage): le monete custodite per la stirpe. **Coniare una Meesh fissa una parte della tua luce in una moneta numerata**: la tua luce, e quindi il tuo livello, scende di altrettanto; ciò che hai ricevuto resta ricevuto.
- **Coniare** (fr. frapper), **il conio** (fr. la frappe), **fissare** (fr. figer).
- **La scheda delle Meesh** si chiama «L’Eredità». Nel quaderno delle regole, la moneta si chiama «La Meesh».
- **Le custodie** (fr. contenants, nomi invariati): Borsa (1), Scarsella (10), Scrigno (50), Forziere (100, rango Voce I), Tesoro (500, Poliglotta III), Riserva (1 000, Ambasciatore III). Il nome comune è **custodia**, mai «scrigno» (che è una custodia precisa).
- **Le edizioni**: argento; oro (ogni centesima); prisma (ogni millesima).
- **A**: «88 Meesh · Scrigno».
- **B**: «Il tuo Scrigno», **88 Meesh** in grande, «il Forziere si apre a 100», «91 coniate da sempre».
- **Il conio**: «La Meesh n. 92 — Fissa 10 423 scintille della tua luce, che ne conta 108 233.»; il pulsante «Conia con Mee e Meo», «+1 000 di gloria» in piccolo dentro.
- **Bandite**: «costa», «resterà», «prezzo base … % al livello …» → niente sulla scheda; «record di Meesh» → «coniate da sempre»; «convertibili» → «la tua luce»; «tesoro» (il concetto, minuscolo) → «l’Eredità».

### Il Sogno e l’Offerta (`game.mission.*`, `game.chest.*`)

- **Che cos’è** (fr. le Rêve): ogni notte, gli antenati mandano un **sogno** in tre atti, sempre più ricchi di gloria. Un sogno si **compie**.
- **I nomi**: **Atto I**, **Atto II**, **Atto III**, a volte l’**Atto d’oro**. I tre atti compiuti fanno apparire **l’Offerta** (fr. l’Offrande), un dono velato (chiusa, non svela nulla). L’**Ora del Prisma**: un’ora in cui ogni atto conta doppio. Cambiare un atto chiede una Meesh.
- **A**: «Sogno 2/3».
- **B**: «Il sogno di stanotte · 2 atti su 3», poi in piccolo «l’Atto III vale 250 di gloria».
- **Bandite**: «missioni del giorno» → «il sogno»; «missione» → «atto»; «forziere del giorno» → «l’Offerta»; «10 missioni del giorno» (prova) → «10 sogni compiuti».

### La Fiamma (`game.flame.*`)

- **Che cos’è**: il fuoco che gli antenati affidano all’eroe. Un gesto al giorno la alimenta. Una Fiamma **arde**.
- **Le forme**: Brace (1 giorno), Fiamma (7), Falò (30), Astro (100), Sole (365).
- **La Lucerna** (fr. la Veilleuse) tiene accesa la Fiamma per un giorno di assenza (due al massimo, una Meesh ciascuna). Spenta, la Fiamma si riaccende entro 48 ore (tre Meesh).
- **Nutre i tuoi sogni**: ogni giorno aggiunge scintille a ogni atto, fino alla metà in più.
- **A**: «▲ 23 g», «Fiamma di 23 giorni».
- **B**: «La tua Fiamma arde da 23 giorni», poi in piccolo «+46 % sui tuoi sogni».
- **Bandite**: «congelamento», «gelo» → «Lucerna»; «serie» → «Fiamma»; «record di Fiamma» → «la tua Fiamma più lunga».

### Il Torneo e l’Alleanza (`game.league.*`, `game.duo.*`)

- **Che cos’è** (fr. la Joute): ogni settimana, trenta eroi di luce simile si misurano sotto il loro **nome di torneo**.
- **I cerchi** (nomi invariati): Quarzo, Ambra, Giada, Zaffiro, Rubino, Ametista, Diamante, Prisma.
- I primi sette **salgono al cerchio successivo**, gli ultimi cinque riscendono, i primi tre ricevono una **coppa**. Il **Torneo degli amici** resta sempre aperto.
- **L’Alleanza** (fr. l’Alliance): una volta a settimana, con un amico; se ciascuno compie la sua parte, la ricompensa raddoppia. Si **stringe** un’alleanza.
- **A**: «Giada · 4º»; «torneo di Giada · 4º».
- **B**: «Torneo di Giada · 4º posto», poi in piccolo «i primi 7 salgono allo Zaffiro».
- **Bandite**: «lega» → «torneo»; «rango», «posizione» nel torneo → «posto»; «pseudonimo» → «nome di torneo»; «coppia», «missione in coppia», «duo» → «alleanza». «Classifica» e «gruppo» restano, come in francese.

### Il Viaggio (`game.season.*`)

- **Che cos’è** (fr. le Voyage): ogni otto settimane, gli antenati mandano l’eroe in viaggio in una **terra di lingua**: francese, spagnola, araba, swahili, giapponese, portoghese, hindi, cinese («in terra francese»).
- **I passi**: ogni atto compiuto fa avanzare di qualche passo (1 per un atto, 2 per l’Atto III, 3 per l’Atto d’oro, 5 per un’alleanza). Quattro passi portano alla **sosta** successiva (fr. halte); quaranta soste fanno il viaggio. Alla fine, la **coppa del viaggio**.
- **Il Sigillo del viaggio** (10 Meesh) aggiunge oggetti da collezione, senza vantaggi.
- **A**: «Viaggio 1 · sosta 9/40».
- **B**: «In terra francese · 9ª sosta», poi in piccolo «2 passi fino alla sosta successiva».
- **Bandite**: «stagione» → «viaggio»; «stelle di stagione» → «passi»; «tappa» del viaggio → «sosta».

### La Rinascita (`game.prestige.*`)

- **Che cos’è** (fr. la Renaissance): al livello 100, quando la sua luce è diventata Galassia, l’eroe può **rinascere**. La sua luce torna Scintilla e la sua leggenda entra in una nuova **Era**. Gli antenati gli offrono un trofeo e una grande gloria. Nient’altro si perde.
- **Le Ere** (fr. Âges): Prima Era (prima di ogni rinascita), Seconda Era… fino alla Sesta Era (cinque rinascite al massimo).
- **A**: «Era II».
- **B**: «La tua leggenda vive la sua Seconda Era».
- **Bandite**: «prestigio» → «rinascita»; «stelle» di prestigio → «Ere».

### Le tracce della leggenda

| Oggi | Nell’epopea | Dettagli | Francese |
|---|---|---|---|
| celebrazione, momento foto | **segno degli antenati** | «I tuoi antenati si manifestano»: un’animazione, una cornice, una foto con Mee e Meo | signe des aïeux |
| quaderno dei progressi | **la Cronaca** | il libro della leggenda, dove ogni segno si immortala | la Chronique |
| traguardi | **le Imprese** | rarità invariate; al singolare «un’impresa», che si **compie** | les Hauts faits |
| vetrina, trofei | **i Trofei** | coppe del torneo e del viaggio, trofei di rinascita e della Fiamma | les Trophées |
| badge | **le Medaglie** | materie: Rame, Bronzo, Argento, Oro, Platino, Ossidiana, Prisma | les Médailles |
| Atlante | **l’Atlante** | un timbro per ogni lingua davvero scambiata | l’Atlas |
| Costellazione, frammenti di stella | **il cielo degli antenati** | dieci frammenti di stella accendono una stella; ogni stella offre un ornamento (fr. parure) | le ciel des aïeux |

- **Bandite**: «traguardi» → «imprese» (mai «gesta»: «gesto» è già l’azione del giocatore); «badge» → «medaglie»; «quaderno» → «Cronaca»; «costellazione» (il concetto) → «il cielo degli antenati»; «celebrazione» → «segno degli antenati».

### Slanci e Sfide

Invariati. «Uno Slancio moltiplica le scintille che scaturiscono.»

## I nomi dei riquadri di Progressi (voce A)

La Luce · Scintille · L’Eredità · Il Rango · La Fiamma · Il Sogno · Il Torneo · Il Viaggio · La Rinascita · Slanci · Medaglie · Sfide · Imprese · Trofei · L’Atlante.

## Scelte da rileggere

- **Torneo** per «Joute»: «giostra» è il termine storico, ma un ragazzo di 13 anni ci sente prima la giostra delle feste. «Torneo» è naturale e resta epico.
- **Lucerna** per «Veilleuse»: la lampada a olio che veglia; «lumino» evoca troppo i cimiteri.
- **Imprese** per «Hauts faits»: «gesta» si scontrerebbe con «gesti».
- **Il nome di un torneo** si scrive con «di» nelle frasi («torneo di Giada», «Torneo di Ambra»): in italiano non c’è l’elisione che in francese ha portato all’apposizione («joute Jade»).
