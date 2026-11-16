/// <reference path="../pb_data/types.d.ts" />

// ============================================================================
// MOTOR AUTORITATIVO DESPOT (PocketBase JSVM Hook)
// Todas las partidas son obligatoriamente Bo5 (primero en ganar 3 rondas)
// ============================================================================

// 1. RESOLUCIÓN DE ROLES (Fase 1 -> Fase 2: Ronda 1)
onRecordAfterUpdateSuccess((e) => {
    const match = e.record;
    if (match.get("status") !== "ROLE_SELECT") return;

    const p1Choice = match.get("p1_role_choice");
    const p2Choice = match.get("p2_role_choice");
    const p2Id = match.get("player_2");

    if (!p2Id || p1Choice === "NONE" || p2Choice === "NONE") return;

    let attackerId = "";
    let defenderId = "";

    if (p1Choice !== p2Choice) {
        attackerId = p1Choice === "ATT" ? match.get("player_1") : p2Id;
        defenderId = p1Choice === "DEF" ? match.get("player_1") : p2Id;
    } else {
        // Empate de elección: moneda justa 50/50
        const p1WinsFlip = Math.random() < 0.5;
        if (p1Choice === "ATT") {
            attackerId = p1WinsFlip ? match.get("player_1") : p2Id;
            defenderId = p1WinsFlip ? p2Id : match.get("player_1");
        } else {
            defenderId = p1WinsFlip ? match.get("player_1") : p2Id;
            attackerId = p1WinsFlip ? p2Id : match.get("player_1");
        }
    }

    match.set("attacker_id", attackerId);
    match.set("defender_id", defenderId);
    match.set("status", "PLAYING");
    match.set("current_round", 1);
    $app.save(match);

    // Crear Ronda 1 (20 segundos, sin restricción ni Ballesteros)
    const roundsCol = $app.findCollectionByNameOrId("rounds");
    const round1 = new Record(roundsCol);
    const endsAt = new Date(Date.now() + 20000).toISOString();

    round1.set("match_id", match.id);
    round1.set("round_number", 1);
    round1.set("phase", "LOCKING");
    round1.set("ends_at", endsAt);
    round1.set("att_constraint", "FREE");
    round1.set("def_constraint", "FREE");
    round1.set("att_dice", null);
    round1.set("def_dice", null);
    round1.set("first_locker", "NONE");
    round1.set("ballesteros_hint", "NONE");
    $app.save(round1);
}, "matches");


// 2. FIJADO DE DADOS, RELOJ DE 20s, BALLESTEROS Y RESOLUCIÓN DE RONDA
onRecordUpdateRequest((e) => {
    const authRecord = e.auth;
    if (!authRecord) throw new BadRequestError("Debes iniciar sesión.");

    const round = e.record;
    if (round.original().get("phase") !== "LOCKING") {
        throw new BadRequestError("Esta ronda ya fue resuelta.");
    }

    const match = $app.findRecordById("matches", round.get("match_id"));
    if (match.get("status") !== "PLAYING") {
        throw new BadRequestError("La partida no está activa.");
    }

    const userId = authRecord.id;
    const isAttacker = userId === match.get("attacker_id");
    const isDefender = userId === match.get("defender_id");
    if (!isAttacker && !isDefender) {
        throw new ForbiddenError("No perteneces a esta partida.");
    }

    const now = Date.now();
    const endsAtMs = new Date(round.get("ends_at")).getTime();
    const isTimeoutCall = round.get("force_timeout") === true && now >= endsAtMs;

    // ------------------------------------------------------------------------
    // HELPERS DEL MOTOR DE REGLAS
    // ------------------------------------------------------------------------
    function hasPair(d) {
        return d[0] === d[1] || d[0] === d[2] || d[1] === d[2];
    }

    function allDistinct(d) {
        return d[0] !== d[1] && d[0] !== d[2] && d[1] !== d[2];
    }

    function validateFormation(dice, budget, constraint) {
        if (!Array.isArray(dice) || dice.length !== 3) {
            throw new BadRequestError("Debes enviar exactamente 3 dados.");
        }
        let sum = 0;
        for (let i = 0; i < 3; i++) {
            const v = dice[i];
            if (!Number.isInteger(v) || v < 1 || v > 6) {
                throw new BadRequestError("Cada dado debe ser un entero entre 1 y 6.");
            }
            sum += v;
        }
        if (sum > budget) {
            throw new BadRequestError("Superaste el presupuesto máximo de " + budget + " puntos.");
        }
        if (constraint === "ORDER" && !hasPair(dice)) {
            throw new BadRequestError("Estado de Orden: debes incluir al menos dos dados iguales.");
        }
        if (constraint === "ROUT" && !allDistinct(dice)) {
            throw new BadRequestError("Estado de Desbandada: los tres dados deben tener valores distintos.");
        }
    }

    function generateDefaultFormation(budget, constraint) {
        // Formaciones válidas por defecto si un jugador no fijó antes de 0s
        if (budget === 11) {
            if (constraint === "ORDER") return;
            if (constraint === "ROUT") return;
            return;
        } else {
            if (constraint === "ORDER") return;
            if (constraint === "ROUT") return;
            return;
        }
    }

    function applyTurcopolosOrAutocomplete(rawDice, budget, constraint, steps, sideLabel) {
        const dice = rawDice ? [rawDice[0], rawDice[1], rawDice[2]] : generateDefaultFormation(budget, constraint);
        const sum = dice[0] + dice[1] + dice[2];
        const deficit = budget - sum;

        if (deficit === 0) return dice;

        // Turcopolos: exactamente 3 puntos menos que el límite (8 para Att, 7 para Def)
        if (deficit === 3) {
            let minIdx = 0; // Desempate desde vanguardia (índice 0)
            for (let i = 1; i < 3; i++) {
                if (dice[i] < dice[minIdx]) minIdx = i;
            }
            const oldVal = dice[minIdx];
            const rolled = Math.floor(Math.random() * 6) + 1;
            dice[minIdx] = rolled;
            steps.push({
                type: "TURCOPOLOS",
                side: sideLabel,
                index: minIdx,
                from: oldVal,
                to: rolled
            });
            return dice;
        }

        // Autocompletado de izquierda a derecha (vanguardia -> retaguardia) hasta tope 6
        let rem = deficit;
        for (let i = 0; i < 3 && rem > 0; i++) {
            const room = 6 - dice[i];
            const add = Math.min(room, rem);
            dice[i] += add;
            rem -= add;
        }
        steps.push({
            type: "AUTOCOMPLETE",
            side: sideLabel,
            result: [dice[0], dice[1], dice[2]]
        });
        return dice;
    }

    function compareSection(attVal, defVal) {
        // Fuego Griego: 1 derrota a 6 (a menos que sea 7 por Almogávar)
        if (attVal === 1 && defVal === 6) return { winner: "ATT", greekFire: true };
        if (defVal === 1 && attVal === 6) return { winner: "DEF", greekFire: true };

        if (attVal > defVal) return { winner: "ATT", greekFire: false };
        if (defVal > attVal) return { winner: "DEF", greekFire: false };
        return { winner: "TIE", greekFire: false };
    }

    function checkAlmogavar(winnerVal, loserVal, isGreekFire) {
        if (isGreekFire) return false;
        return winnerVal >= 4 && winnerVal >= 2 * loserVal;
    }

    function resolveFullRound(rawAtt, rawDef) {
        const steps = [];
        const att = applyTurcopolosOrAutocomplete(rawAtt, 11, round.get("att_constraint"), steps, "ATT");
        const def = applyTurcopolosOrAutocomplete(rawDef, 10, round.get("def_constraint"), steps, "DEF");

        // Espejo desde perspectiva del Atacante:
        // Vanguardia (att[0] vs def[2]), Centro (att[1] vs def[1]), Retaguardia (att[2] vs def[0])
        const defMirror = [def[2], def[1], def[0]];
        let attWins = 0;
        let defWins = 0;
        let hadTie = false;
        let attRearguardAlmogavar = false;

        for (let i = 0; i < 3; i++) {
            const aVal = att[i];
            const dVal = defMirror[i];
            const duel = compareSection(aVal, dVal);

            let almogavarTriggered = false;
            if (duel.winner === "ATT") {
                attWins++;
                if (checkAlmogavar(aVal, dVal, duel.greekFire)) {
                    almogavarTriggered = true;
                    if (i < 2) {
                        att[i + 1] += 1;
                    } else {
                        attRearguardAlmogavar = true;
                    }
                }
            } else if (duel.winner === "DEF") {
                defWins++;
                if (checkAlmogavar(dVal, aVal, duel.greekFire)) {
                    almogavarTriggered = true;
                    if (i < 2) {
                        defMirror[i + 1] += 1;
                    }
                }
            } else {
                // Empate de sección cuenta para el Defensor
                defWins++;
                hadTie = true;
            }

            steps.push({
                type: "CLASH",
                section: i, // 0: Vanguardia, 1: Centro, 2: Retaguardia
                attVal: aVal,
                defVal: dVal,
                winner: duel.winner,
                greekFire: duel.greekFire,
                almogavar: almogavarTriggered
            });
        }

        // Determinar ganador de la ronda
        let roundWinner = "DEF";
        if (attWins >= 2) {
            roundWinner = "ATT";
        } else if (attRearguardAlmogavar && hadTie) {
            // Regla especial: Almogávar atacante en retaguardia gana la ronda si hubo empate en otra sección
            roundWinner = "ATT";
            steps.push({ type: "REARGUARD_TIEBREAKER", winner: "ATT" });
        }

        // Varegos: ganar 3-0 otorga 2 puntos de ronda
        const isVaregos = (roundWinner === "ATT" && attWins === 3) || (roundWinner === "DEF" && defWins === 3);
        const pointsAwarded = isVaregos ? 2 : 1;

        if (isVaregos) {
Usa el código con precaución.
                steps.push({ type: "VAREGOS", winner: roundWinner, points: 2 });
        }
        return {
            finalAttDice: att,
            finalDefDice: [defMirror[2], defMirror[1], defMirror[0]],
            roundWinner: roundWinner,
            pointsAwarded: pointsAwarded,
            steps: steps
        };
    }
    // ------------------------------------------------------------------------
    // PROCESAR JUGADA O EXPIRACIÓN DE RELOJ
    // ------------------------------------------------------------------------
    let attDice = round.original().get("att_dice");
    let defDice = round.original().get("def_dice");
    if (!isTimeoutCall) {
        if (now > endsAtMs + 1500) { // 1.5s de gracia por latencia de red
            throw new BadRequestError("El tiempo de la ronda ha expirado.");
        }
        if (isAttacker) {
            if (attDice !== null) throw new BadRequestError("Ya fijaste tus dados en esta ronda.");
            const incoming = round.get("att_dice");
            validateFormation(incoming, 11, round.get("att_constraint"));
            attDice = incoming;
            round.set("att_dice", attDice);
        } else {
            if (defDice !== null) throw new BadRequestError("Ya fijaste tus dados en esta ronda.");
            const incoming = round.get("def_dice");
            validateFormation(incoming, 10, round.get("def_constraint"));
            defDice = incoming;
            round.set("def_dice", defDice);
        }
    }
    const bothLocked = attDice !== null && defDice !== null;
    const roundNum = round.get("round_number");
    // CASO 1: Solo un jugador ha fijado y aún queda tiempo (no es llamada por timeout)
    if (!bothLocked && !isTimeoutCall) {
        const lockerRole = isAttacker ? "ATT" : "DEF";
        round.set("first_locker", lockerRole);
        if (roundNum >= 2) {
            // Regla Ballesteros (Ronda 2+): resta 10s al reloj sin límite mínimo
            const newEndsAtMs = endsAtMs - 10000;
            if (newEndsAtMs <= now) {
                // La resta llevó el reloj a 0s: cierre inmediato SIN pista de Ballesteros
                round.set("ends_at", new Date(now).toISOString());
                round.set("ballesteros_hint", "NONE");
                // Continúa abajo para resolver inmediatamente por timeout del rival
            } else {
                // Queda tiempo: actualizar reloj y calcular pista de Ballesteros para el segundo jugador
                round.set("ends_at", new Date(newEndsAtMs).toISOString());
                const prevRound = $app.findFirstRecordByFilter(
                    "rounds",
                    "match_id = {:m} && round_number = {:r}",
                    { m: match.id, r: roundNum - 1 }
                );
                // Concatenación desde la vanguardia (índice 0) del primer jugador que fijó
                const currentLockerDice = isAttacker ? attDice : defDice;
                const prevLockerDice = isAttacker
                    ? prevRound.get("att_dice_final")
                    : prevRound.get("def_dice_final");
                const currConcat = Number("" + currentLockerDice[0] + currentLockerDice[1] + currentLockerDice[2]);
                const prevConcat = Number("" + prevLockerDice[0] + prevLockerDice[1] + prevLockerDice[2]);
                round.set("ballesteros_hint", currConcat >= prevConcat ? "HIGHER_OR_EQUAL" : "LOWER");
                return; // Guardar cambio parcial y esperar al segundo jugador
            }
        } else {
            // Ronda 1: fijar primero no altera el reloj ni genera pistas
            return;
        }
    }
    // CASO 2: Ambos fijaron, o el reloj llegó a 0 (por tiempo natural o por resta de Ballesteros)
    const outcome = resolveFullRound(attDice, defDice);
    round.set("att_dice", outcome.finalAttDice);
    round.set("def_dice", outcome.finalDefDice);
    round.set("att_dice_final", outcome.finalAttDice);
    round.set("def_dice_final", outcome.finalDefDice);
    round.set("round_winner", outcome.roundWinner);
    round.set("points_awarded", outcome.pointsAwarded);
    round.set("resolution_log", outcome.steps);
    round.set("phase", "REVEALED");
    // Actualizar marcador global de la partida (Bo5 obligatorio -> meta = 3 puntos)
    const newAttScore = match.get("att_score") + (outcome.roundWinner === "ATT" ? outcome.pointsAwarded : 0);
    const newDefScore = match.get("def_score") + (outcome.roundWinner === "DEF" ? outcome.pointsAwarded : 0);
    const TARGET_WINS = 3;
    match.set("att_score", newAttScore);
    match.set("def_score", newDefScore);
    if (newAttScore >= TARGET_WINS || newDefScore >= TARGET_WINS) {
        // Fin de la partida
        const matchWinnerId = newAttScore >= TARGET_WINS ? match.get("attacker_id") : match.get("defender_id");
        match.set("winner_id", matchWinnerId);
        match.set("status", "FINISHED");
        $app.save(match);
    } else {
        // Preparar siguiente ronda (20 segundos, Orden para el ganador, Desbandada para el perdedor)
        const nextRoundNum = roundNum + 1;
        match.set("current_round", nextRoundNum);
        $app.save(match);
        const roundsCol = $app.findCollectionByNameOrId("rounds");
        const nextRound = new Record(roundsCol);
        nextRound.set("match_id", match.id);
        nextRound.set("round_number", nextRoundNum);
        nextRound.set("phase", "LOCKING");
        nextRound.set("ends_at", new Date(Date.now() + 20000).toISOString());
        nextRound.set("att_constraint", outcome.roundWinner === "ATT" ? "ORDER" : "ROUT");
        nextRound.set("def_constraint", outcome.roundWinner === "DEF" ? "ORDER" : "ROUT");
        nextRound.set("att_dice", null);
        nextRound.set("def_dice", null);
        nextRound.set("first_locker", "NONE");
        nextRound.set("ballesteros_hint", "NONE");
        $app.save(nextRound);
    }
}, "rounds");