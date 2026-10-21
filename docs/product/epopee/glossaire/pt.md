# Glossário da epopeia — português do Brasil (`pt`)

> Tradução, termo a termo, de `fr.md` (a fonte), conforme a concepção `docs/superpowers/specs/2026-10-20-epopee-du-jeu-design.md` (§ 2, § 3, § 4). Em caso de divergência, a concepção tem razão e este glossário se corrige. Issue: #11174.
>
> Este glossário faz fé para os textos do jogo em português na web, no iOS e no gateway: **um termo por conceito, o mesmo em toda parte.** O código de idioma é `pt` (o da interface web, `SUPPORTED_INTERFACE_LANGUAGES`) e a variante é o **português do Brasil**.
>
> Sua projeção verificável é `packages/shared/design/game-epic-vocabulary/pt.json` (as palavras banidas e os nomes canônicos), que a guarda web `apps/web/src/lib/game/epic-vocabulary.test.ts` aplica a cada valor dos catálogos do jogo. Uma regra que entra aqui entra lá, no mesmo commit. Formato: `README.md`.

## O que nunca muda

- **As regras do jogo**: limites, preços, ganhos, tetos. Nenhum número se mexe.
- **As chaves do fio**: `etincelle`, `lumiere`, as chaves de título, de torneio, de forma da Chama, os nomes dos campos servidos. Só o TEXTO exibido muda.
- Os parâmetros (`{count}`, `{level}`…) e as famílias de plural (`.one`, `.other`) de cada chave.

## O relato em uma página

O jogador conectado é **o herói**. Sua busca: tornar-se uma **Lenda**. Além dela, o **Mito** só espera cem eleitos, « aqueles que o deus dos seus ancestrais precede ».

Cada troca de verdade faz saltar **faíscas**. Juntas, elas formam **sua luz**. Seus **ancestrais** cuidam de você: toda noite, eles enviam um **sonho** para realizar; a cada evolução, eles **se manifestam**. Em Embaixador, eles se revelam: você reconhece a terra deles entre sete (África eterna, Egito solar, Olimpo, Império celeste, Auroras do Norte, Abismos, Neon).

**Mee e Meo**, dois beija-flores, levam as mensagens entre os dois mundos. Eles guiam cada etapa e falam a voz do relato. Eles agem ou falam: nunca são um enfeite.

**O deus dos ancestrais** nunca é nomeado nem desenhado. Ele só fala uma vez, no limiar do Mito.

## As duas vozes

| Voz | Onde | Forma | Exemplo |
|---|---|---|---|
| **A, a síntese** | faixa do jogador, pastilhas, brasão ao lado de um nome, quadros da vista principal de Progresso | um nome curto e seu número | « Intérprete IV », « 12 Meeshes · Escarcela », « Jade · 4º » |
| **B, o relato primeiro** | página de Progresso detalhada, fichas de conceito, cartões de Mee e Meo, sinais dos ancestrais, folhas de detalhes, livro das regras | a frase conduz, o número exato vem em pequeno | « Sua Escarcela guarda 12 Meeshes », depois em pequeno « o Cofrinho em 50 » |

Uma superfície não classificada: se houver espaço para uma frase, B; senão, A. As palavras banidas desaparecem nas duas vozes.

O tom: o jogo trata o herói por **você** (português do Brasil), nunca por « tu »; « seu », « sua », nunca « teu », « tua ». Escreve-se para uma criança de 13 anos, uma ideia por frase. Numa frase, « glória » se escreve em minúscula e se liga por « de »: « +250 de glória ».

## As palavras banidas (em toda parte)

| Palavra banida | O que a substitui |
|---|---|
| aumentar (um valor) | crescer, alimentar, despertar, brilhar mais forte |
| contador | o nome do conceito (« sua glória », « sua Chama ») ; « Contador » também deixa de nomear um título (→ Narrador) |
| valor, valor real | « sua luz » |
| conversíveis, no bolso, bolso | « sua luz » |
| potencial | nada: diz-se o que se tem |
| dívida | « uma sombra cobre N faíscas da sua luz » (a **Sombra**) |
| recorde (total da vida) | « recebidas desde sempre » |
| recorde de nível | « o auge da sua luz » |
| recorde de Chama, recorde de sequência | « sua Chama mais longa » |
| recorde de Meeshes | « cunhadas desde sempre » |
| ainda N antes de X | em pequeno, « N até X » |
| custa, custo (numa ficha) | uma frase: « ela cristaliza N faíscas da sua luz »; o cálculo vai para as regras |
| restará | nada: nenhuma subtração numa ficha |
| tabela (de pontos) | « cada gesto faz saltar as suas » |
| preço base, porcentagem, fator (numa ficha) | nada: o cálculo vive nas regras |

## Uma palavra, um sentido

| Palavra | Ela designa agora | Ela não designa mais |
|---|---|---|
| Brasa | a primeira forma da Chama | o primeiro estado da luz (→ Faísca) |
| Luz | sua luz, o fio inteiro (a Luz do herói) | um estado da luz (→ Claridade) |
| Baú | a quarta reserva da Herança | o baú do dia (→ a Oferenda) |
| Tesouro | a quinta reserva da Herança | o conceito inteiro (→ a Herança) |
| Estrela | o céu: o estado Estrela, o céu dos ancestrais, os fragmentos de estrela | o Prestígio (→ eras), a temporada (→ passos) |
| Etapa | a integração (a acolhida) somente | o limiar das dezenas de níveis (→ prova), a temporada (→ parada) |
| Título | o nome que o mundo dá ao herói | — (o antigo « rank ») |
| Lugar | o lugar no torneio da semana | — (o antigo « posição na liga ») |
| Selo | o Selo da viagem, com maiúscula | as medalhas (→ Medalhas) |
| Recorde | mais nada | ver « desde sempre », « o auge da sua luz », « sua Chama mais longa », « cunhadas desde sempre » |

## Os conceitos

### A Luz (o nível — `game.level.*`, `game.tier.*`, provas `level-steps`)

- **O que é**: a luz do herói, que atravessa vinte estados. Seu nível é o número do anel.
- **Os vinte estados**: **Faísca** (chave `etincelle`, nunca « Brasa »), Lampejo, **Claridade** (chave `lumiere`, nunca « Luz »), Brilho, Raio, Aurora, Cometa, Estrela, Constelação, Galáxia, depois Nebulosa, Pulsar, Quasar, Supernova, Magnetar, Aglomerado, Superaglomerado, Cosmos, Infinito, Singularidade.
- **A prova**: a cada dez níveis, de 10 a 100, os ancestrais pedem uma prova (uma Meesh, um sonho, uma Chama, um título). Enquanto ela não for vencida, a luz espera.
- **O título abre a luz**: a Supernova é o limite abaixo de Embaixador, Embaixador abre até a Singularidade, Oráculo tira todo limite.
- **A**: anel « 34 » · Brilho; « Nível 34 ».
- **B**: « Sua luz agora é Brilho », depois em pequeno « nível 34 · 3.200 faíscas até o nível 35 ».
- **Banidas**: « ainda N antes do nível X » → « N faíscas até o nível X »; « etapa » → « prova »; « recorde de nível » → « o auge da sua luz »; « faixa » → « estado ».

### As Faíscas (`game.sparks.*`, `game.points.*`)

- **O que é**: a unidade. Cada troca de verdade faz saltar faíscas; juntas, elas formam **sua luz**.
- **Os nomes**: o bolso = « sua luz »; o ciclo = « nesta Era » (desde o seu último renascimento); o total da vida = « recebidas desde sempre »; a dívida = **a Sombra**.
- **A ficha** se chama « Faíscas ». Sua cabeça: « Sua luz », **108.233 faíscas** em grande, « 377.752 recebidas desde sempre » em pequeno.
- **A**: « 108.233 faíscas ».
- **B**: « Sua luz tem 108.233 faíscas », depois em pequeno « 377.752 recebidas desde sempre ».
- **A Sombra**: « Uma sombra cobre N faíscas da sua luz: suas próximas faíscas vão dissipá-la. Enquanto ela estiver aí, não dá para cunhar. »
- **Banidas**: « conversíveis », « valor real », « potencial », « recorde de faíscas », « no bolso » → « sua luz »; « dívida » → a Sombra; « tabela » → « cada gesto faz saltar as suas ».

### O Título (a glória — `game.glory.*`, `game.rank.*`)

- **O que é**: o nome que o mundo dá ao herói. A glória o dá, e ele nunca recua.
- **Os títulos**: Sussurro, Eco, Voz, **Narrador**, **Intérprete**, Poliglota, Embaixador, Orador, Oráculo, Lenda, depois o **Mito** (cem eleitos). « Contador » (que em português é também o profissional da contabilidade) e « Passador » (que evoca o contrabando) saem do jogo.
- **Os degraus**: cinco por título, de V (o primeiro) a I (o mais alto).
- **A**: « Intérprete IV »; « glória 44.600 ».
- **B**: « Chamam você de Intérprete », depois em pequeno « segundo degrau · glória 44.600 ».
- **Banidas**: « rank », « ranking » → « título »; « ainda N de Glória antes de X » → « N de glória até X »; « +250 Glória » → « +250 de glória »; « contador » → « sua glória ».

### A Herança (`game.treasury.*`, `game.meesh.*`, `game.mint.*`)

- **O que é**: as moedas guardadas para a linhagem. **Cunhar uma Meesh cristaliza uma parte da sua luz numa moeda numerada**: sua luz, e portanto seu nível, baixa na mesma medida; o que foi recebido continua recebido.
- **A ficha das Meeshes** se chama « A Herança ».
- **Os recipientes** (inalterados): Bolsa (1), Escarcela (10), Cofrinho (50), Baú (100, título Voz I), Tesouro (500, Poliglota III), Reserva (1.000, Embaixador III).
- **As edições**: prata; ouro (a cada centésima); prisma (a cada milésima).
- **A**: « 88 Meeshes · Cofrinho ».
- **B**: « Seu Cofrinho », **88 Meeshes** em grande, « o Baú se abre em 100 », « 91 cunhadas desde sempre ».
- **A cunhagem**: « A Meesh nº 92 — Ela cristaliza 10.423 faíscas da sua luz, que tem 108.233. »; o botão « Cunhar com Mee e Meo », « +1.000 de glória » em pequeno dentro dele.
- **Banidas**: « custa », « restará », « preço base … % no nível … » → nada na ficha; « recorde de Meeshes » → « cunhadas desde sempre »; « conversíveis » → « sua luz »; « tesouro » (o conceito) → « a Herança ».

### O Sonho e a Oferenda (`game.mission.*`, `game.chest.*`)

- **O que é**: toda noite, os ancestrais enviam um **sonho** em três atos, cada vez mais ricos em glória.
- **Os nomes**: **Ato I**, **Ato II**, **Ato III**, às vezes o **Ato de ouro**. Os três atos realizados fazem aparecer **a Oferenda**, um presente velado (fechada, ela não revela nada). A **Hora do Prisma**: uma hora em que cada ato conta em dobro. Trocar um ato pede uma Meesh.
- **A**: « Sonho 2/3 ».
- **B**: « O sonho desta noite · 2 atos de 3 », depois em pequeno « o Ato III vale 250 de glória ».
- **Banidas**: « missões do dia » → « o sonho »; « missão » → « ato »; « baú do dia » → « a Oferenda »; « 10 missões do dia » (prova) → « 10 sonhos realizados ».

### A Chama (`game.flame.*`)

- **O que é**: o fogo que os ancestrais confiam ao herói. Um gesto por dia o mantém.
- **As formas**: Brasa (1 dia), Chama (7), Fogueira (30), Astro (100), Sol (365).
- **A Lamparina** mantém a Chama acesa num dia de ausência (duas no máximo, uma Meesh cada). Apagada, a Chama se reacende em até 48 horas (três Meeshes).
- **Ela alimenta seus sonhos**: cada dia soma faíscas a cada ato, até a metade a mais.
- **A**: « ▲ 23 d », « Chama 23 dias ».
- **B**: « Sua Chama arde há 23 dias », depois em pequeno « +46 % nos seus sonhos ».
- **Banidas**: « congelamento » → « Lamparina »; « sequência » → « Chama »; « recorde de Chama » → « sua Chama mais longa ».

### O Torneio e a Aliança (`game.league.*`, `game.duo.*`)

- **O que é**: toda semana, trinta heróis de luz parecida se medem sob o seu **nome de torneio**.
- **Os círculos** (inalterados): Quartzo, Âmbar, Jade, Safira, Rubi, Ametista, Diamante, Prisma.
- Os sete primeiros **sobem para o círculo seguinte**, os cinco últimos descem, os três primeiros recebem uma **taça**. O **Torneio dos amigos** continua sempre aberto.
- **A Aliança**: uma vez por semana, com um amigo; se cada um realizar a sua parte, a recompensa dobra.
- **A**: « Jade · 4º ».
- **B**: « Torneio Jade · 4º lugar », depois em pequeno « os 7 primeiros sobem para Safira ». O nome do círculo vem em aposição (« Torneio Jade », « torneio Âmbar »), sem « de ».
- **Banidas**: « liga » → « torneio »; « rank » no torneio → « lugar »; « pseudônimo » → « nome de torneio »; « dupla », « missão em dupla » → « aliança ».

### A Viagem (`game.season.*`)

- **O que é**: a cada oito semanas, os ancestrais enviam o herói em viagem para uma **terra de idioma**: francês, espanhol, árabe, suaíli, japonês, português, híndi, chinês (« em terra francesa »).
- **Os passos**: cada ato realizado faz avançar alguns passos (1 por um ato, 2 pelo Ato III, 3 pelo Ato de ouro, 5 por uma aliança). Quatro passos levam à **parada** seguinte; quarenta paradas fazem a viagem. No fim, a **taça da viagem**.
- **O Selo da viagem** (10 Meeshes) acrescenta objetos de coleção, sem vantagem.
- **A**: « Viagem 1 · parada 9/40 ».
- **B**: « Em terra francesa · 9ª parada », depois em pequeno « 2 passos até a próxima parada ».
- **Banidas**: « temporada » → « viagem »; « estrelas da temporada » → « passos »; « etapa da temporada » → « parada ».

### O Renascimento (`game.prestige.*`)

- **O que é**: no nível 100, quando sua luz se tornou Galáxia, o herói pode renascer. Sua luz volta a ser Faísca e sua lenda entra numa nova **Era**. Os ancestrais lhe oferecem um troféu e uma grande glória. Nada mais se perde.
- **As Eras**: Primeira Era (antes de qualquer renascimento), Segunda Era… até a Sexta Era (cinco renascimentos no máximo).
- **A**: « Era II ».
- **B**: « Sua lenda vive a Segunda Era ».
- **Banidas**: « prestígio » → « renascimento »; « estrelas » de prestígio → « eras ».

### Os rastros da lenda

| Hoje | Na epopeia | Detalhes |
|---|---|---|
| comemoração, momento de foto | **sinal dos ancestrais** | « Seus ancestrais se manifestam »: uma animação, um quadro, uma foto com Mee e Meo |
| caderno de progresso | **a Crônica** | o livro da lenda, onde cada sinal fica eternizado |
| conquistas | **as Façanhas** | raridades inalteradas |
| vitrine, troféus | **os Troféus** | taças de torneio e de viagem, troféus de renascimento e de Chama |
| selos, emblemas, insígnias | **as Medalhas** | materiais: Cobre, Bronze, Prata, Ouro, Platina, Obsidiana, Prisma; cada medalha sobe sete **patamares** (nunca « estrelas » nem « níveis ») |
| Atlas | **o Atlas** | um carimbo por idioma realmente trocado |
| Constelação, fragmentos de estrela | **o céu dos ancestrais** | dez fragmentos de estrela acendem uma estrela; cada estrela oferece um adorno |

- **Banidas**: « conquista » → « façanha »; « selo », « emblema », « insígnia » → « medalha » (« Selo », com maiúscula, só nomeia o Selo da viagem); « caderno » → « Crônica »; « constelação » (o conceito) → « o céu dos ancestrais »; « comemoração », « celebração » → « sinal dos ancestrais »; « vitrine » → « troféus ».

### Impulsos e Desafios

Inalterados. « Um Impulso multiplica as faíscas que saltam. »

## Os nomes dos quadros de Progresso (voz A)

A Luz · Faíscas · A Herança · O Título · A Chama · O Sonho · O Torneio · A Viagem · O Renascimento · Impulsos · Medalhas · Desafios · Façanhas · Troféus · O Atlas.

## Correspondência com o francês

| fr | pt |
|---|---|
| étincelle, faire jaillir | faísca, fazer saltar |
| ta lumière ; la Lumière | sua luz ; a Luz |
| état (de la lumière) | estado |
| épreuve | prova |
| l'Ombre | a Sombra |
| reçues depuis toujours | recebidas desde sempre |
| ta plus haute lumière ; au plus haut | o auge da sua luz ; no auge |
| le Rang ; marche | o Título ; degrau |
| gloire | glória |
| l'Héritage ; contenant | a Herança ; recipiente |
| frapper ; frappe ; figer | cunhar ; cunhagem ; cristalizar |
| le Rêve ; acte ; réaliser | o Sonho ; ato ; realizar |
| l'Offrande ; présent voilé | a Oferenda ; presente velado |
| la Veilleuse | a Lamparina |
| la Joute ; cercle ; place ; nom de joute ; coupe | o Torneio ; círculo ; lugar ; nome de torneio ; taça |
| l'Alliance | a Aliança |
| le Voyage ; pas ; halte ; Sceau du voyage | a Viagem ; passo ; parada ; Selo da viagem |
| la Renaissance ; renaître ; Âge | o Renascimento ; renascer ; Era |
| aïeux ; signe des aïeux ; se manifester | ancestrais ; sinal dos ancestrais ; manifestar-se |
| la Chronique ; Hauts faits ; Trophées ; Médailles ; parure | a Crônica ; Façanhas ; Troféus ; Medalhas ; adorno |
| le ciel des aïeux ; fragment d'étoile | o céu dos ancestrais ; fragmento de estrela |
