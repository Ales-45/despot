/// <reference path="../pb_data/types.d.ts" />

// ============================================================================
// MOTOR AUTORITATIVO DESPOT (PocketBase JSVM Hook)
// Todas las partidas son obligatoriamente Bo5 (primero en ganar 3 rondas)
// ============================================================================

onRecordUpdateRequest((e) => {
    const match = e.record;
    if (match.get("is_bot") !== true) return;
    if (match.get("p1_role_choice") === "NONE") return;
    if (match.get("status") !== "ROLE_SELECT") return;

    const humanId = match.get("player_1");
    const choice = match.get("p1_role_choice");
    match.set("attacker_id", choice === "ATT" ? humanId : null);
    match.set("defender_id", choice === "DEF" ? humanId : null);
    match.set("status", "PLAYING");
    match.set("current_round", 1);
    $app.save(match);

    let existingRound = null;
    try {
        existingRound = $app.findFirstRecordByFilter(
            "rounds",
            "match_id = {:m} && round_number = 1",
            { m: match.id }
        );
    } catch (_) {}
    if (!existingRound) {
        const roundsCol = $app.findCollectionByNameOrId("rounds");
        const round1 = new Record(roundsCol);
        round1.set("match_id", match.id);
        round1.set("round_number", 1);
        round1.set("phase", "LOCKING");
        round1.set("ends_at", new Date(Date.now() + 20000).toISOString());
        round1.set("att_constraint", "FREE");
        round1.set("def_constraint", "FREE");
        round1.set("att_dice", null);
        round1.set("def_dice", null);
        round1.set("first_locker", "NONE");
        round1.set("ballesteros_hint", "NONE");
        $app.save(round1);
    }
}, "matches");

// 1. RESOLUCIÓN DE ROLES (Fase 1 -> Fase 2: Ronda 1)
onRecordAfterUpdateSuccess((e) => {
    const match = e.record;
    if (match.get("status") !== "ROLE_SELECT") return;

    const p1Choice = match.get("p1_role_choice");
    if (match.get("is_bot") === true && p1Choice !== "NONE") {
        const humanId = match.get("player_1");
        match.set("attacker_id", p1Choice === "ATT" ? humanId : null);
        match.set("defender_id", p1Choice === "DEF" ? humanId : null);
        match.set("status", "PLAYING");
        match.set("current_round", 1);
        $app.save(match);

        const roundsCol = $app.findCollectionByNameOrId("rounds");
        const round1 = new Record(roundsCol);
        round1.set("match_id", match.id);
        round1.set("round_number", 1);
        round1.set("phase", "LOCKING");
        round1.set("ends_at", new Date(Date.now() + 20000).toISOString());
        round1.set("att_constraint", "FREE");
        round1.set("def_constraint", "FREE");
        round1.set("att_dice", null);
        round1.set("def_dice", null);
        round1.set("first_locker", "NONE");
        round1.set("ballesteros_hint", "NONE");
        $app.save(round1);
        return;
    }

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

    if (match.get("is_bot") === true) {
        const attPlays = [
            [[2,5,4],0.169], [[5,5,1],0.146], [[2,4,5],0.107],
            [[4,2,5],0.104], [[5,4,2],0.094], [[6,3,2],0.087],
            [[3,6,2],0.065], [[5,1,5],0.047], [[3,2,6],0.042],
            [[2,6,3],0.035], [[5,2,4],0.033], [[6,1,4],0.024],
            [[4,5,2],0.020], [[4,3,4],0.016], [[4,1,6],0.010]
        ];
        const defPlays = [
            [[1,4,5],0.146], [[1,5,4],0.145], [[4,5,1],0.130],
            [[3,6,1],0.098], [[5,4,1],0.092], [[5,1,4],0.088],
            [[3,2,5],0.087], [[6,1,3],0.054], [[4,2,4],0.044],
            [[2,5,3],0.035], [[5,2,3],0.025], [[5,3,2],0.024],
            [[2,4,4],0.014], [[4,4,2],0.010], [[4,1,5],0.009]
        ];
        function nashFormation(role) {
            const constraint = role === "ATT"
                ? round.get("att_constraint")
                : round.get("def_constraint");
            const budget = role === "ATT" ? 11 : 10;
            const candidates = (role === "ATT" ? attPlays : defPlays).filter((entry) => {
                const dice = entry[0];
                const sum = dice[0] + dice[1] + dice[2];
                if (sum !== budget && sum !== budget - 3) return false;
                if (constraint === "ORDER") {
                    return dice[0] === dice[1] || dice[0] === dice[2] || dice[1] === dice[2];
                }
                if (constraint === "ROUT") {
                    return dice[0] !== dice[1] && dice[0] !== dice[2] && dice[1] !== dice[2];
                }
                return true;
            });
            if (candidates.length === 0) {
                return role === "ATT" ? [4,4,3] : [4,3,3];
            }
            let total = 0;
            for (const entry of candidates) total += entry[1];
            let choice = Math.random() * total;
            for (const entry of candidates) {
                choice -= entry[1];
                if (choice <= 0) return [...entry[0]];
            }
            return [...candidates[0][0]];
        }

        const humanIsAttacker = userId === match.get("attacker_id");
        if (humanIsAttacker && round.original().get("def_dice") === null) {
            const botDice = nashFormation("DEF");
            round.set("def_dice", botDice);
            round.set("def_dice_initial", [...botDice]);
        } else if (!humanIsAttacker && round.original().get("att_dice") === null) {
            const botDice = nashFormation("ATT");
            round.set("att_dice", botDice);
            round.set("att_dice_initial", [...botDice]);
        }
    }

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

        // Ningún otro déficit está permitido: el jugador pierde la ronda.
        steps.push({
            type: "UNDER_LIMIT_LOSS",
            side: sideLabel,
            deficit: deficit
        });
        return null;
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
        if (att === null) {
            steps.push({ type: "UNDER_LIMIT_RESULT", winner: "DEF" });
            return {
                finalAttDice: rawAtt,
                finalDefDice: rawDef,
                roundWinner: "DEF",
                pointsAwarded: 1,
                steps: steps
            };
        }
        if (def === null) {
            steps.push({ type: "UNDER_LIMIT_RESULT", winner: "ATT" });
            return {
                finalAttDice: rawAtt,
                finalDefDice: rawDef,
                roundWinner: "ATT",
                pointsAwarded: 1,
                steps: steps
            };
        }

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
                        att[i + 1] = Math.min(7, att[i + 1] + 1);
                    } else {
                        attRearguardAlmogavar = true;
                    }
                }
            } else if (duel.winner === "DEF") {
                defWins++;
                if (checkAlmogavar(dVal, aVal, duel.greekFire)) {
                    almogavarTriggered = true;
                    if (i < 2) {
                        defMirror[i + 1] = Math.min(7, defMirror[i + 1] + 1);
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
            round.set("att_dice_initial", [...incoming]);
        } else {
            if (defDice !== null) throw new BadRequestError("Ya fijaste tus dados en esta ronda.");
            const incoming = round.get("def_dice");
            validateFormation(incoming, 10, round.get("def_constraint"));
            defDice = incoming;
            round.set("def_dice", defDice);
            round.set("def_dice_initial", [...incoming]);
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
                    ? prevRound.get("att_dice_initial")
                    : prevRound.get("def_dice_initial");
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
    let outcome;
    if (isTimeoutCall) {
        const attTimedOut = attDice === null;
        const defTimedOut = defDice === null;
        if (attTimedOut && defTimedOut) {
            outcome = {
                finalAttDice: [1, 1, 1],
                finalDefDice: [1, 1, 1],
                roundWinner: "DRAW",
                pointsAwarded: 0,
                steps: [{ type: "TIMEOUT", winner: "DRAW" }]
            };
        } else if (attTimedOut) {
            outcome = {
                finalAttDice: [1, 1, 1],
                finalDefDice: defDice,
                roundWinner: "DEF",
                pointsAwarded: 1,
                steps: [{ type: "TIMEOUT", winner: "DEF", timedOutSide: "ATT" }]
            };
        } else if (defTimedOut) {
            outcome = {
                finalAttDice: attDice,
                finalDefDice: [1, 1, 1],
                roundWinner: "ATT",
                pointsAwarded: 1,
                steps: [{ type: "TIMEOUT", winner: "ATT", timedOutSide: "DEF" }]
            };
        } else {
            outcome = resolveFullRound(attDice, defDice);
        }
    } else {
        outcome = resolveFullRound(attDice, defDice);
    }
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
    if (outcome.roundWinner === "DRAW") {
        match.set("att_score", newAttScore);
        match.set("def_score", newDefScore);
        $app.save(match);

        const nextRoundNum = roundNum;
        match.set("current_round", nextRoundNum);
        $app.save(match);

        const roundsCol = $app.findCollectionByNameOrId("rounds");
        const repeatedRound = new Record(roundsCol);
        repeatedRound.set("match_id", match.id);
        repeatedRound.set("round_number", nextRoundNum);
        repeatedRound.set("phase", "LOCKING");
        repeatedRound.set("ends_at", new Date(Date.now() + 20000).toISOString());
        repeatedRound.set("att_constraint", round.get("att_constraint"));
        repeatedRound.set("def_constraint", round.get("def_constraint"));
        repeatedRound.set("att_dice", null);
        repeatedRound.set("def_dice", null);
        repeatedRound.set("first_locker", "NONE");
        repeatedRound.set("ballesteros_hint", "NONE");
        $app.save(repeatedRound);
        return;
    }
    const TARGET_WINS = 3;
    match.set("att_score", newAttScore);
    match.set("def_score", newDefScore);
    if (newAttScore >= TARGET_WINS || newDefScore >= TARGET_WINS) {
        // Fin de la partida
        const matchWinnerId = newAttScore >= TARGET_WINS ? match.get("attacker_id") : match.get("defender_id");
        match.set("winner_id", matchWinnerId);
        match.set("status", "FINISHED");
        $app.save(match);
    } else if (roundNum >= 5) {
        match.set("winner_id", null);
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