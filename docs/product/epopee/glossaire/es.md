# Glosario de la epopeya — español

> Traducción término por término de `fr.md` (la fuente), tomada de la concepción `docs/superpowers/specs/2026-10-20-epopee-du-jeu-design.md` (§ 2, § 3, § 4). Si hay diferencia, la concepción tiene razón, luego `fr.md`, y este glosario se corrige. Issue: #11174.
>
> Este glosario hace fe para los textos del juego en español, en la web, en iOS y en la pasarela: **un término por concepto, el mismo en todas partes.**
>
> Su proyección verificable es `packages/shared/design/game-epic-vocabulary/es.json` (las palabras prohibidas y los nombres canónicos), que la guarda web `apps/web/src/lib/game/epic-vocabulary.test.ts` aplica a cada valor de los catálogos del juego. Una regla que entra aquí entra allí, en el mismo commit. Formato: `README.md`.

## Lo que nunca cambia

- **Las reglas del juego**: umbrales, precios, ganancias, topes. Ningún número se mueve.
- **Las claves del hilo**: `etincelle`, `lumiere`, las claves de rango, de liga, de forma de Llama, los nombres de los campos servidos. Solo cambia el TEXTO mostrado.
- Los parámetros (`{count}`, `{level}`…) y las familias de plural (`.one`, `.other`) de cada clave.

## El relato en una página

El jugador conectado es **el héroe**. Su búsqueda: convertirse en una **Leyenda**. Más allá, el **Mito** solo espera a cien elegidos, «aquellos a quienes precede el dios de sus ancestros».

Cada intercambio de verdad hace **brotar** **chispas**. Juntas forman **tu luz**. Tus **ancestros** velan por ti: cada noche te envían un **sueño** que hacer realidad; con cada evolución, **se manifiestan**. En Embajador, se revelan: reconoces su tierra entre siete (África eterna, Egipto solar, Olimpo, Imperio celeste, Auroras del Norte, Abismos, Neón).

**Mee y Meo**, dos colibríes, llevan los mensajes entre los dos mundos. Guían cada etapa y hablan con la voz del relato. Actúan o hablan: nunca son un decorado.

**El dios de los ancestros** nunca se nombra ni se dibuja. Solo habla una vez, en el umbral del Mito.

## Las dos voces

| Voz | Dónde | Forma | Ejemplo |
|---|---|---|---|
| **A, la síntesis** | banda del jugador, pastillas, blasón junto a un nombre, marcos de la vista principal de Progreso | un nombre corto y su cifra | «Pasador IV», «12 Meeshes · Escarcela», «Jade · 4.º» |
| **B, el relato primero** | página de Progreso detallada, fichas de concepto, tarjetas de Mee y Meo, señales de los ancestros, hojas de detalles, cuaderno de las reglas | la frase manda, la cifra exacta sigue en pequeño | «Tu Escarcela guarda 12 Meeshes», y en pequeño «el Cofrecillo a 50» |

Una superficie sin clasificar: si cabe una frase, B; si no, A. Las palabras prohibidas desaparecen en las dos voces.

El tono: se tutea (nunca «usted», nunca «vuestro»), se escribe para un chico de 13 años, una idea por frase. En una frase, «gloria» se escribe en minúscula y se une con «de»: «+250 de gloria». Delante de un «+N», el espacio es INSEPARABLE (U+00A0): un «+N» nunca cae solo a final de línea.

## Las palabras prohibidas (en todas partes)

| Palabra prohibida | Lo que la sustituye |
|---|---|
| aumentar (un valor) | crecer, alimentar, despertar, brillar más |
| contador | el nombre del concepto («tu gloria», «tu Llama») |
| valor, valor real | «tu luz» |
| convertibles, bolsillo | «tu luz» |
| potencial | nada: se dice lo que se tiene |
| deuda | «una sombra cubre N chispas de tu luz» (la **Sombra**) |
| récord (total de por vida) | «recibidas desde siempre» |
| récord de nivel | «tu luz más alta» |
| récord de Llama, racha | «tu Llama más larga» |
| récord de Meeshes | «acuñadas desde siempre» |
| faltan N para el nivel X, aún N antes de X | en pequeño, «N hasta el nivel X» |
| cuesta, coste, precio (en una ficha) | una frase: «fija N chispas de tu luz»; el cálculo va a las reglas |
| quedará | nada: ninguna resta en una ficha |
| baremo | «cada gesto hace brotar las suyas» |
| precio base, porcentaje, factor (en una ficha) | nada: el cálculo vive en las reglas |

«Te faltan 6 Meeshes para tomar una Vela» sigue permitido: dice lo que falta para un GESTO, como el francés «il manque». Lo prohibido es la cuenta atrás hacia un nivel o un círculo.

## Una palabra, un sentido

| Palabra | Designa ahora | Ya no designa |
|---|---|---|
| Brasa | la primera forma de la Llama | el primer estado de la luz (→ Chispa) |
| Luz | tu luz, el hilo entero (la Luz del héroe) | un estado de la luz (→ Claridad) |
| Cofre | la cuarta reserva del Legado | la ofrenda del día (→ la Ofrenda), un recipiente cualquiera (→ recipiente) |
| Tesoro | la quinta reserva del Legado | el concepto entero (→ el Legado) |
| Estrella | el cielo: el estado Estrella, el cielo de los ancestros, los fragmentos de estrella | el Renacimiento (→ edades), el viaje (→ pasos) |
| Etapa | la bienvenida (las siete tarjetas de Mee y Meo) solamente | el umbral de los diez niveles (→ prueba), el viaje (→ parada) |
| Paso | el viaje: los pasos que llevan de parada en parada | la bienvenida (→ etapa), el umbral de los diez niveles (→ prueba) |
| Rango | el nombre que el mundo da al héroe | el puesto en la justa (→ puesto) |
| Récord | nada | ver «desde siempre», «tu luz más alta», «tu Llama más larga», «acuñadas desde siempre» |
| Tramo | nada | el estado de la luz (→ estado), el escalón de una medalla o de un desafío (→ escalón), el recipiente del Legado (→ recipiente) |
| Velar, Vela | la Vela que guarda la Llama («velar por tu Llama») | la Ofrenda cerrada (→ envuelta), la Sombra (→ cubre) |
| Voz | el tercer rango | la sección «Palabra» de las hazañas |
| Destello | el segundo estado de la luz | el adorno del cielo (→ Centelleo) |

## Los conceptos

### La Luz (el nivel — `game.level.*`, `game.tier.*`, pruebas `level-steps`)

- **Qué es**: la luz del héroe, que atraviesa veinte estados. Su nivel es la cifra del anillo.
- **Los veinte estados**: **Chispa** (clave `etincelle`, nunca «Brasa»), Destello, **Claridad** (clave `lumiere`, nunca «Luz»), Brillo, Rayo, Aurora, Cometa, Estrella, Constelación, Galaxia, luego Nebulosa, Púlsar, Cuásar, Supernova, Magnetar, Cúmulo, Supercúmulo, Cosmos, Infinito, Singularidad.
- **La prueba**: cada diez niveles, de 10 a 100, los ancestros piden una prueba (una Meesh, un sueño, una Llama, un rango). Mientras no se supere, la luz espera.
- **El rango abre la luz**: la Supernova es el límite bajo Embajador, Embajador abre hasta la Singularidad, Oráculo levanta todo límite.
- **A**: anillo «34» · Brillo; «Nivel 34».
- **B**: «Tu luz brilla en Brillo», y en pequeño «nivel 34 · 3200 chispas hasta el nivel 35».
- **Prohibidas**: «faltan N para el nivel X» → «N chispas hasta el nivel X»; «tramo», «etapa» → «estado», «prueba»; «récord de nivel» → «tu luz más alta».

### Las Chispas (`game.sparks.*`, `game.points.*`)

- **Qué es**: la unidad. Cada intercambio de verdad hace brotar chispas; juntas forman **tu luz**.
- **Los nombres**: el bolsillo = «tu luz»; el ciclo = «en esta Edad», «desde tu último renacimiento»; el total de por vida = «recibidas desde siempre»; la deuda = **la Sombra**.
- **La ficha** se llama «Chispas». Su cabecera: «Tu luz», **108 233 chispas** en grande, «377 752 recibidas desde siempre» en pequeño.
- **A**: «108 233 chispas».
- **B**: «Tu luz tiene 108 233 chispas», y en pequeño «377 752 recibidas desde siempre».
- **La Sombra**: «Una sombra cubre N chispas de tu luz: tus próximas chispas la disiparán. Mientras esté ahí, no se acuña.»
- **Prohibidas**: «convertibles», «valor real», «potencial», «récord de chispas», «bolsillo» → «tu luz»; «deuda» → la Sombra; «baremo» → «cada gesto hace brotar las suyas».

### El Rango (la gloria — `game.glory.*`, `game.rank.*`)

- **Qué es**: el nombre que el mundo da al héroe. La gloria lo da, y nunca retrocede.
- **Los rangos**: Murmullo, Eco, Voz, Narrador, Pasador, Políglota, Embajador, Orador, Oráculo, Leyenda, y luego el **Mito** (cien elegidos).
- **Los peldaños**: cinco por rango, de V (el primero) a I (el más alto).
- **A**: «Pasador IV»; «gloria 44 600».
- **B**: «Te llaman Pasador», y en pequeño «segundo peldaño · gloria 44 600».
- **Prohibidas**: «faltan N de Gloria para X» → «N de gloria hasta X»; «+250 Gloria», «+250 de Gloria» → «+250 de gloria»; «contador» → «tu gloria».

### El Legado (`game.treasury.*`, `game.meesh.*`, `game.mint.*`)

- **Qué es**: las monedas guardadas para el linaje. **Acuñar una Meesh fija una parte de tu luz en una moneda numerada**: tu luz, y con ella tu nivel, baja otro tanto; lo recibido sigue recibido.
- **La ficha de las Meeshes** se llama «El Legado».
- **Los recipientes** (sin cambios): Monedero (1), Escarcela (10), Cofrecillo (50), Cofre (100, rango Voz I), Tesoro (500, Políglota III), Reserva (1000, Embajador III). La palabra genérica es **recipiente**, nunca «cofre» ni «tramo».
- **Las ediciones**: plata; oro (cada centésima); prisma (cada milésima).
- **A**: «88 Meeshes · Cofrecillo».
- **B**: «Tu Cofrecillo», **88 Meeshes** en grande, «el Cofre se abre a 100», «91 acuñadas desde siempre».
- **La acuñación**: «La Meesh n.º 92 — Fija 10 423 chispas de tu luz, que tiene 108 233.»; el botón «Acuñar con Mee y Meo», «+1000 de gloria» en pequeño dentro.
- **Prohibidas**: «cuesta», «quedará», «precio base … % en el nivel …» → nada en la ficha; «récord de Meeshes» → «acuñadas desde siempre»; «convertibles» → «tu luz»; «tesoro» (el concepto, en minúscula) → «el Legado».

### El Sueño y la Ofrenda (`game.mission.*`, `game.chest.*`)

- **Qué es**: cada noche, los ancestros envían un **sueño** en tres actos, cada vez más ricos en gloria.
- **Los nombres**: **Acto I**, **Acto II**, **Acto III**, a veces el **Acto de oro**. Los tres actos hechos realidad hacen aparecer **la Ofrenda**, un regalo envuelto (cerrada, no desvela nada). La **Hora del Prisma**: una hora en la que cada acto cuenta doble. Cambiar un acto pide una Meesh.
- **A**: «Sueño 2/3».
- **B**: «El sueño de esta noche · 2 actos de 3», y en pequeño «el Acto III vale 250 de gloria».
- **Prohibidas**: «misiones del día» → «el sueño»; «misión» → «acto»; «cofre del día» → «la Ofrenda»; «10 misiones del día» (prueba) → «hacer realidad 10 sueños».

### La Llama (`game.flame.*`)

- **Qué es**: el fuego que los ancestros confían al héroe. Un gesto al día la mantiene.
- **Las formas**: Brasa (1 día), Llama (7), Hoguera (30), Astro (100), Sol (365).
- **La Vela** mantiene la Llama encendida un día de ausencia (dos como máximo, una Meesh cada una). Apagada, la Llama se vuelve a encender en las 48 horas (tres Meeshes).
- **Alimenta tus sueños**: cada día añade chispas a cada acto, hasta la mitad más.
- **A**: «▲ 23 d», «Llama 23 días».
- **B**: «Tu Llama arde desde hace 23 días», y en pequeño «+46 % en tus sueños».
- **Prohibidas**: «congelación» → «Vela»; «racha» → «Llama»; «récord de Llama» → «tu Llama más larga».

### La Justa y la Alianza (`game.league.*`, `game.duo.*`)

- **Qué es**: cada semana, treinta héroes de luz parecida se miden con su **nombre de justa**.
- **Los círculos** (sin cambios): Cuarzo, Ámbar, Jade, Zafiro, Rubí, Amatista, Diamante, Prisma.
- Los siete primeros **suben al círculo siguiente**, los cinco últimos bajan, los tres primeros reciben una **copa**. La **Justa de los amigos** sigue siempre abierta.
- **La Alianza**: una vez por semana, con un amigo; si cada uno hace realidad su parte, la recompensa se duplica. Una alianza se **sella**.
- **A**: «Jade · 4.º».
- **B**: «Justa de Jade · 4.º puesto», y en pequeño «los 7 primeros suben al Zafiro».
- **Prohibidas**: «liga» → «justa»; «rango» en la justa → «puesto»; «seudónimo» → «nombre de justa»; «dúo», «misión en dúo» → «alianza».

### El Viaje (`game.season.*`)

- **Qué es**: cada ocho semanas, los ancestros envían al héroe de viaje a una **tierra de idioma**: francés, español, árabe, suajili, japonés, portugués, hindi, chino («en tierra francesa»).
- **Los pasos**: cada acto hecho realidad hace avanzar unos pasos (1 por un acto, 2 por el Acto III, 3 por el Acto de oro, 5 por una alianza). Cuatro pasos llevan a la **parada** siguiente; cuarenta paradas hacen el viaje. Al final, la **copa del viaje**.
- **El Sello del viaje** (10 Meeshes) añade objetos de colección, sin ventaja.
- **A**: «Viaje 1 · parada 9/40».
- **B**: «En tierra francesa · 9.ª parada», y en pequeño «2 pasos hasta la parada siguiente».
- **Prohibidas**: «temporada» → «viaje»; «estrellas de temporada» → «pasos»; «etapa de temporada» → «parada»; «recorrido» → «camino».

### El Renacimiento (`game.prestige.*`)

- **Qué es**: en el nivel 100, cuando su luz se ha vuelto Galaxia, el héroe puede renacer. Su luz vuelve a ser Chispa y su leyenda entra en una nueva **Edad**. Los ancestros le ofrecen un trofeo y una gran gloria. Nada más se pierde.
- **Las Edades**: Primera Edad (antes de todo renacimiento), Segunda Edad… hasta la Sexta Edad (cinco renacimientos como máximo).
- **A**: «Edad II».
- **B**: «Tu leyenda vive su Segunda Edad».
- **Prohibidas**: «prestigio» → «renacimiento»; «estrellas» de prestigio → «edades».

### Las huellas de la leyenda

| Hoy | En la epopeya | Detalles |
|---|---|---|
| celebración, momento foto | **señal de los ancestros** | «Tus ancestros se manifiestan»: una animación, un marco, una foto con Mee y Meo |
| cuaderno de progreso | **la Crónica** | el libro de la leyenda, donde cada señal se inmortaliza |
| logros | **las Hazañas** | rarezas sin cambios |
| vitrina, trofeos | **los Trofeos** | copas de justa y de viaje, trofeos de renacimiento y de Llama |
| insignias | **las Medallas** | materiales: Cobre, Bronce, Plata, Oro, Platino, Obsidiana, Prisma; cada medalla sube siete **escalones** |
| Atlas | **el Atlas** | un sello por idioma intercambiado de verdad |
| Constelación, fragmentos de estrella | **el cielo de los ancestros** | diez fragmentos de estrella encienden una estrella; cada estrella ofrece un **adorno** |

- **Prohibidas**: «logro» → «hazaña»; «insignia» → «medalla»; «cuaderno» → «Crónica»; «constelación» (el concepto) → «el cielo de los ancestros»; «celebración» → «señal de los ancestros»; «cosmético» → «adorno».

### Impulsos y Desafíos

Sin cambios. «Un Impulso multiplica las chispas que brotan.» Un desafío sube **escalones**.

## Los nombres de los marcos de Progreso (voz A)

La Luz · Chispas · El Legado · El Rango · La Llama · El Sueño · La Justa · El Viaje · El Renacimiento · Impulsos · Medallas · Desafíos · Hazañas · Trofeos · El Atlas.

## Decisiones propias del español

- **Justa**, no «torneo» ni «liga»: la palabra exacta del francés «joute», épica y sin colisión.
- **Vela** para «Veilleuse»: la vela que se enciende para velar a alguien; por eso «velar» queda reservado a ella, y la Ofrenda cerrada está **envuelta**, no «velada».
- **Legado** para «Héritage»: «herencia» suena a notaría; el legado se deja al linaje.
- **Hacer brotar** para «faire jaillir», **fijar** para «figer», **hacer realidad** para «réaliser» (un sueño, un acto).
- **Etapa** queda para la bienvenida y **paso** para el viaje: el antiguo «Paso 2 de 5» de la bienvenida pasa a «Etapa 2 de 5» para que «paso» tenga un solo sentido.
- **Pasador** (rango `passeur`) se conserva tal como estaba traducido: no choca con ningún otro término. Que «barquero» lo diría mejor queda para una revisión de los nombres de rango, que tocaría también iOS y la pasarela.
