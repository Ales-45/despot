# Despot

An asymmetric game where two opponents duel using dice to represent armies on the battlefield from a top 2D perspective. The player is given three dice to arrange in secret with a total point limit. The dice are mirrored between the opponents, where the highest die defeats its counterpart to determine the winner. Wildcards may bend the rules for flavor.

Icons from (https://game-icons.net/).

R: Cada partida entre dos jugadores tiene tres fases, en la primera los jugadores eligen un rol, ataque y defensa, si ambos eligen el mismo rol se tira una moneda y el ganador se queda con el rol que escogió, relegando el rol al otro jugador. Esta fase solo se repite una vez por partida. Luego, en la segunda fase, los jugadores reciben tres dados d6 para distribuir un límite de puntos, 11 para el atacante (FIgura 1) y 10 para el defensor, cada dado es ajustado con un valor entre 1 y 6, sin que la suma total de los tres supere el límite de puntos, estos dados representan los flancos y centro de un ejército en formación de combate. 
La distribución de los puntos se realiza en secreto durante un máximo de 20 segundos por ronda, una vez listo, el jugador fija su decisión. Si el reloj llega a cero o ambos jugadores fijan, los dados son revelados. 
En la tercera fase los dados son emparejados en espejo desde la perspectiva del atacante, osea que su flanco izquierdo va a estar al frente del flanco derecho defensor, un dado gana cuando su valor es superior al oponente, en caso de empate gana el defensor. 
Como hay tres secciones, se necesita superar al menos dos para ganar la ronda (Figura 2). Los emparejamientos son resueltos de izquierda a derecha del atacante por tener la iniciativa, el primer dado en resolver sería entonces la vanguardia, mientras que el último la retaguardia. 
Revelado el ganador de la ronda se repite la segunda fase, pero esta vez el jugador que ganó la ronda anterior debe jugar una disposición de dados donde haya al menos dos dados con el mismo valor, simulando que su ejército está manteniendo el orden, mientras tanto el jugador que perdió la ronda debe jugar una disposición donde cada dado tiene un valor diferente, cómo si su ejército estuviera en desbandada. 
La partida de un juego dura hasta 5 rondas, por lo cual el jugador victorioso de sería el primero en ganar 3 rondas. En cuanto a la distribución de dados hay jugadas comodín, llamadas crisóbulas, que alteran las reglas de juego

P: ¡Todo clarísimo hasta aquí! El sistema de Blotto asimétrico con restricciones dinámicas por ronda está muy bien definido.
Para asegurarme de que el modelo matemático inicial sea exacto antes de añadir las crisóbulas, solo te confirmo un par de detalles pequeños sobre estas reglas base (puedes responderlos junto con las crisóbulas):
• Orden de los dados y el efecto "espejo": Si el Atacante coloca [A1, A2, A3] (Izquierda, Centro, Derecha) y el Defensor escribe [D1, D2, D3] desde su propia perspectiva (su Izquierda, su Centro, su Derecha), el enfrentamiento en espejo cruza A1 vs D3, A2 vs D2 y A3 vs D1. ¿Es correcto así?
• Gastar menos del límite de puntos: Dice "sin que la suma total de los tres supere el límite de puntos". ¿Un jugador está obligado a gastar todos sus puntos (ej. sumar exactamente 11 o 10), o puede dejar puntos sin usar si le conviene para cumplir la regla de dados iguales/diferentes? (Por ejemplo, si el Atacante pierde la ronda 1 y debe jugar 3 dados diferentes, con 11 puntos sus opciones máximas son {6,4,1}, {6,3,2}, {5,4,2}, pero si puede gastar 10 puntos también tendría {5,3,2}, {6,3,1}, etc.).
• Tiempo agotado (0 segundos): Si un jugador no fija sus dados antes de los 20 segundos, ¿pierde la ronda automáticamente o se le asigna una formación por defecto (como [1, 1, 1])?

R: uego griego: Un dado con valor de 1 derrota a un dado opuesto con valor de 6, esto hace que el enfrentamiento de dados sea un circuito cerrado.

Almogávar: Un dado con valor mayor o igual a 4, sumará +1 al siguiente dado aliado si es el doble o más a su dado contrincante. 
Aplicaría para los casos de 4>1, 4>2, 5>1, 5>2, 6>2 & 6>3.
No aplica para fuego griego, si 6 se enfrenta a 1.
El nuevo valor añadido ignora el límite de puntos (Figura 3).
Esto puede encadenar un efecto dominó en los dados restantes por resolver, por ejemplo un 5, al recibir ese +1 se volvería un 6 y podría hacer almogávar a un dado opuesto con valor de 3.
Puede también activar o desactivar el efecto de fuego griego, por ejemplo un dado de 5 al convertirse en un 6 sería vulnerable a un dado opuesto con valor de 1, de manera contraria un dado de 1 que se convierta en un 2 ya no podría efectuar fuego griego a un dado opuesto de 6. 
Es la única manera por la cual un 6 se puede convertir en un 7 y ser invulnerable a cualquier valor.
También puede proteger un dado de haber sido afectado por almogávar, un dado de 2 que se convierta en un 3 aún sería derrotado por 4 pero le negaría sumar +1 al siguiente dado contrincante.
Un almogavar atacante en retaguardia gana la ronda si hay empate en alguna de las otras secciones.

Turcopolos: Si el jugador decide fijar con 3 puntos inferiores a su límite, el menor dado desde la vanguardia tomará un valor al azar entre 1 y 6. 
Este nuevo valor puede efectuar griego o almogávar si aplica 
La distribución inicial si está restringida por los estados de orden o desbandada, pero el nuevo valor ignora la restricción. 
Si el jugador fija con puntos restantes o se le termina el tiempo con un total menor al límite pero tampoco sean 3 puntos inferiores (7 para defensa y 8 para ataque), el jugador perderá la ronda.

Varegos: Si un jugador gana la ronda derrotando todos los dados opuestos, esa ronda contará por dos, en el caso que se esté jugando una partida de 5 rondas y ya haya ganado una de esas rondas, sería automáticamente victorioso al sumar 3 rondas ganadas.

Ballesteros: En todas las rondas consecuentes a la primera, el primer jugador en fijar le quita 10 segundos de reloj al último jugador en decidir, pero este recibe una pista acerca de si la concatenación de los valores fijados por su contrincante empezando por su vanguardia, es mayor/igual, o menor a la que jugó en la ronda pasada. Si un jugador en defensa perdió contra un 4-6-1, recibiría pista menor si el atacante juega 4-4-3 y mayor/igual para 5-3-3. Si el reloj es disminuido a cero, no recibirá pista.

P: 1. Orden de resolución (Izquierda a Derecha vs. Espejo):
	• Dices que los enfrentamientos se resuelven desde la vanguardia del atacante (izquierda) hacia su retaguardia (derecha), y que el defensor está en espejo (Atacante [Vanguardia, Centro, Retaguardia] vs Defensor [Retaguardia, Centro, Vanguardia]).
	• Si un dado Defensor activa Almogávar en el primer combate (la vanguardia del atacante, que es la retaguardia del defensor), ¿el +1 del defensor va hacia el siguiente combate en el orden de resolución (su dado del Centro), o hacia su propia vanguardia? (Asumo que va hacia el siguiente dado por resolver, es decir, el Centro, para que la mecánica de "proteger un dado por resolver" funcione. Confírmame si es así).
2. Almogávar en Retaguardia del Atacante:
	• Dices: "Un almogávar atacante en retaguardia gana la ronda si hay empate en alguna de las otras secciones."
	• ¿Esto significa que si el atacante activa Almogávar en el 3er dado (Retaguardia) y va 1 - 1 en secciones (porque empató en vanguardia o centro, lo cual normalmente gana el defensor), el atacante se lleva la ronda? ¿O qué pasa si pierde una sección y empata en la otra (ej. pierde Vanguardia, empata Centro, hace Almogávar en Retaguardia — quedaría 1 victoria, 1 empate, 1 derrota)?
3. Turcopolos (Desempate del dado menor):
	• "El menor dado desde la vanguardia tomará un valor al azar entre 1 y 6."
	• Si juegas 2-2-4 (suma 8, 3 menos que 11), hay dos dados empatados como el menor (2 y 2). "Desde la vanguardia" significa que se elige el primer 2 (el de Vanguardia), ¿verdad?
4. Ballesteros (La pista del Defensor):
	• En el ejemplo dices: "Si un jugador en defensa perdió contra un 4-6-1, recibiría pista menor si el atacante juega 4-4-3 y mayor/igual para 5-3-3."
	• La pista que recibe el jugador que fijó segundo, ¿compara la jugada actual del rival contra la jugada anterior del mismo rival (como en el ejemplo: 4-4-3 < 4-6-1 del atacante)? Y si el defensor jugó 5-3-2 antes, el número se lee desde la vanguardia del defensor (izquierda a derecha en su pantalla) o desde la vanguardia del atacante?
5. Uso de las Crisóbulas:
	• ¿Estas 5 crisóbulas están activas siempre en todas las partidas como reglas permanentes, o son habilidades/cartas que cada jugador elige, equipa o activa un número limitado de veces por partida?

R: 1. Siguiente dado por resolver, osea centro, como se resuelven desde la perspectiva atacante los dados defensores se resuelven de der a izq, su van es la der.
2. Si gana por almogavar en el ultimo dado (retaguardia) gana si ya tiene otro dado ganado en otro sector despues de resolver jugadas (porque con ese sector suma las 2 seccione snecesarias para ganar) o si perdio los otros sectores y una de las perdidas fue por empate
 3. si, elige el primer 2
4. Compara la jugada actual del rival con su anterior, el numero siempre se lee desde la perspectiva atacante
5. las jugadas siempre estan a disposicion del jugador, que apliquen o no dependen de como se juegen los dados

 ## Reglas cerradas adicionales

 - Almogávar en retaguardia atacante gana si ya existe otra victoria en otro sector después de resolver todas las jugadas, o si el jugador perdió los otros dos sectores y al menos una de esas pérdidas fue un empate.
 - Ballesteros compara la formación fijada inicialmente por el rival contra su formación inicial fijada en la ronda anterior. La comparación se lee desde la perspectiva atacante.
 - La pista de Ballesteros se calcula antes de Turcopolos y Almogávar. Los cambios posteriores no modifican la pista.
 - La resolución del combate siempre utiliza los dados finales después de Turcopolos y Almogávar.
 - Si un jugador fija exactamente tres puntos por debajo del límite, activa Turcopolos. Si fija con otros puntos restantes, pierde la ronda. Si no fija antes del timeout, pierde la ronda.