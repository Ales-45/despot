(function () {
    const game = typeof require === "function" ? require("../pb_public/game-engine.js") : globalThis.DespotGame;

    function check(condition, message) {
        if (!condition) throw new Error(message);
    }

    function reference(attacker, defender, attRoll, defRoll) {
        const events = [];
        function prepare(formation, budget, side, rolled) {
            if (formation === null) {
                events.push({ type: "TIMEOUT", side });
                return null;
            }
            const result = [...formation];
            const missing = budget - result.reduce((a, b) => a + b, 0);
            if (missing === 0) return result;
            if (missing !== 3) {
                events.push({ type: "UNDER_LIMIT_LOSS", side, deficit: missing });
                return null;
            }
            const minimum = Math.min(...result);
            const index = result.indexOf(minimum);
            result[index] = rolled;
            events.push({ type: "TURCOPOLOS", side, index, from: minimum, to: rolled });
            return result;
        }

        const att = prepare(attacker, 11, "ATT", attRoll);
        const def = prepare(defender, 10, "DEF", defRoll);
        if (!att || !def) {
            const roundWinner = !att && !def ? "DRAW" : att ? "ATT" : "DEF";
            return {
                finalAttDice: att || attacker || [1, 1, 1],
                finalDefDice: def || defender || [1, 1, 1],
                roundWinner, pointsAwarded: roundWinner === "DRAW" ? 0 : 1, steps: events
            };
        }

        let attackWins = 0;
        let defenseWins = 0;
        let ties = 0;
        let attackingRearAlmogavar = false;
        for (let section = 0; section < 3; section++) {
            const opposingIndex = 2 - section;
            const a = att[section];
            const d = def[opposingIndex];
            const greekFire = (a === 1 && d === 6) || (d === 1 && a === 6);
            const winner = a === d ? "TIE" : greekFire ? (a === 1 ? "ATT" : "DEF") : a > d ? "ATT" : "DEF";
            const winningValue = winner === "ATT" ? a : d;
            const losingValue = winner === "ATT" ? d : a;
            const almogavar = winner !== "TIE" && !greekFire && winningValue >= 4 && winningValue >= 2 * losingValue;
            if (winner === "ATT") {
                attackWins++;
                if (almogavar && section === 2) attackingRearAlmogavar = true;
                if (almogavar && section < 2) att[section + 1] = Math.min(7, att[section + 1] + 1);
            } else {
                defenseWins++;
                if (winner === "TIE") ties++;
                if (almogavar && section < 2) def[opposingIndex - 1] = Math.min(7, def[opposingIndex - 1] + 1);
            }
            events.push({ type: "CLASH", section, attVal: a, defVal: d, winner, greekFire, almogavar });
        }
        const roundWinner = attackWins >= 2 || (attackingRearAlmogavar && ties > 0) ? "ATT" : "DEF";
        const sweeping = roundWinner === "ATT" ? attackWins === 3 : defenseWins === 3;
        if (sweeping) events.push({ type: "VAREGOS", winner: roundWinner, points: 2 });
        return { finalAttDice: att, finalDefDice: def, roundWinner, pointsAwarded: sweeping ? 2 : 1, steps: events };
    }

    const formations = [];
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
        formations.push([a, b, c]);
    }
    for (const budget of [10, 11]) for (const dice of formations) {
        const withinBudget = dice.reduce((a, b) => a + b, 0) <= budget;
        const distinct = new Set(dice).size;
        for (const constraint of ["FREE", "ORDER", "ROUT"]) {
            const expected = withinBudget && (constraint === "FREE" ||
                (constraint === "ORDER" ? distinct < 3 : distinct === 3));
            check(game.validFormation(dice, budget, constraint) === expected,
                `Formation ${dice}, budget ${budget}, constraint ${constraint}`);
        }
    }
    for (const invalid of [null, [], [1, 2], [1, 2, 3, 4], [0, 1, 2], [1, 2, 7], [1, 2, 2.5], ["1", 2, 3]]) {
        check(!game.validFormation(invalid, 11, "FREE"), `Invalid formation ${invalid}`);
    }
    const turco = game.resolve([1, 1, 6], [4, 3, 3], () => 6);
    check(JSON.stringify(turco.steps[0]) === JSON.stringify(
        { type: "TURCOPOLOS", side: "ATT", index: 0, from: 1, to: 6 }), "Turcopolos chooses the frontmost minimum");
    const seven = game.resolve([1, 4, 6], [1, 1, 5], () => 1).steps[3];
    check(seven.attVal === 7 && seven.defVal === 1 && seven.winner === "ATT" && !seven.greekFire,
        "Greek Fire cannot defeat 7");
    const rear = game.resolve([1, 4, 6], [2, 3, 5], () => 1);
    check(rear.roundWinner === "ATT" && rear.pointsAwarded === 1 && rear.steps[1].winner === "TIE" &&
        rear.steps[2].almogavar, "Attacking rearguard Almogavar breaks a tied round");

    let cases = 0;
    const coverage = new Set();
    const attackers = [null, ...formations.filter(dice => dice.reduce((a, b) => a + b, 0) <= 11)];
    const defenders = [null, ...formations.filter(dice => dice.reduce((a, b) => a + b, 0) <= 10)];
    const rolls = (dice, budget) => dice && dice.reduce((a, b) => a + b, 0) === budget - 3
        ? [1, 2, 3, 4, 5, 6] : [1];
    for (const attacker of attackers) for (const defender of defenders) {
        for (const attRoll of rolls(attacker, 11)) for (const defRoll of rolls(defender, 10)) {
            const values = [];
            if (attacker && attacker.reduce((a, b) => a + b, 0) === 8) values.push(attRoll);
            if (defender && defender.reduce((a, b) => a + b, 0) === 7) values.push(defRoll);
            const attCopy = attacker && [...attacker];
            const defCopy = defender && [...defender];
            const actual = game.resolve(attacker, defender, () => {
                check(values.length > 0, "Unexpected random roll");
                return values.shift();
            });
            const expected = reference(attacker, defender, attRoll, defRoll);
            check(JSON.stringify(actual) === JSON.stringify(expected),
                `Resolution ${attacker} vs ${defender}, rolls ${attRoll}/${defRoll}`);
            const clashes = actual.steps.filter(step => step.type === "CLASH");
            const turcopoles = actual.steps.filter(step => step.type === "TURCOPOLOS");
            for (const step of turcopoles) coverage.add(`turco-${step.side}`);
            if (turcopoles.length === 2) coverage.add("turco-both");
            if (actual.steps.some(step => step.type === "TIMEOUT")) coverage.add("timeout");
            if (actual.steps.some(step => step.type === "UNDER_LIMIT_LOSS")) coverage.add("under-limit");
            if (actual.roundWinner === "DRAW") coverage.add("draw");
            if (actual.pointsAwarded === 2) coverage.add(`varegos-${actual.roundWinner}`);
            for (const step of clashes) {
                if (step.greekFire) coverage.add(`greek-fire-${step.winner}`);
                if ((step.attVal === 7 && step.defVal === 1) || (step.defVal === 7 && step.attVal === 1)) {
                    check(!step.greekFire, "Greek Fire must not defeat a 7");
                    coverage.add("seven-against-one");
                }
            }
            for (const side of ["ATT", "DEF"]) {
                if (clashes[0]?.winner === side && clashes[0].almogavar &&
                    clashes[1]?.winner === side && clashes[1].almogavar) coverage.add(`chain-${side}`);
            }
            if (actual.roundWinner === "ATT" && clashes.filter(step => step.winner === "ATT").length === 1 &&
                clashes.some(step => step.winner === "TIE") && clashes[2]?.winner === "ATT" &&
                clashes[2].almogavar) coverage.add("rear-exception");
            check(values.length === 0, "Missing random roll");
            check(JSON.stringify(attacker) === JSON.stringify(attCopy) &&
                JSON.stringify(defender) === JSON.stringify(defCopy), "Input formation mutated");
            cases++;
        }
    }
    for (const scenario of [
        "turco-ATT", "turco-DEF", "turco-both", "timeout", "under-limit", "draw",
        "varegos-ATT", "varegos-DEF", "greek-fire-ATT", "greek-fire-DEF",
        "seven-against-one", "chain-ATT", "chain-DEF", "rear-exception"
    ]) check(coverage.has(scenario), `Missing scenario: ${scenario}`);
    const result = { formationChecks: formations.length * 2 * 3, resolutionCases: cases, scenarios: coverage.size };
    if (typeof module !== "undefined" && module.exports) console.log(JSON.stringify(result));
    else globalThis.despotEngineTestResult = result;
})();
