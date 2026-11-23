(function (root, factory) {
    if (typeof module !== "undefined" && module.exports) module.exports = factory();
    else root.DespotGame = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    function validFormation(dice, budget, constraint) {
        if (!Array.isArray(dice) || dice.length !== 3 ||
            dice.some(value => !Number.isInteger(value) || value < 1 || value > 6)) return false;
        const deficit = budget - dice.reduce((sum, value) => sum + value, 0);
        if (deficit !== 0 && deficit !== 3) return false;
        const distinct = new Set(dice).size;
        return (constraint !== "ORDER" || distinct < 3) && (constraint !== "ROUT" || distinct === 3);
    }

    function resolve(attInitial, defInitial, roll) {
        const steps = [];
        function prepare(initial, budget, side) {
            if (!initial) {
                steps.push({ type: "TIMEOUT", side });
                return null;
            }
            const dice = initial.slice();
            const deficit = budget - dice.reduce((sum, value) => sum + value, 0);
            if (deficit === 0) return dice;
            if (deficit !== 3) {
                steps.push({ type: "UNDER_LIMIT_LOSS", side, deficit });
                return null;
            }
            const minimum = Math.min(...dice);
            const index = side === "DEF" ? dice.lastIndexOf(minimum) : dice.indexOf(minimum);
            const from = dice[index];
            dice[index] = roll();
            steps.push({ type: "TURCOPOLOS", side, index, from, to: dice[index] });
            return dice;
        }

        const att = prepare(attInitial, 11, "ATT");
        const def = prepare(defInitial, 10, "DEF");
        if (!att || !def) {
            return {
                finalAttDice: att || attInitial || [1, 1, 1],
                finalDefDice: def || defInitial || [1, 1, 1],
                roundWinner: !att && !def ? "DRAW" : !att ? "DEF" : "ATT",
                pointsAwarded: !att && !def ? 0 : 1,
                steps
            };
        }

        const opposing = def.slice().reverse();
        let attWins = 0;
        let defWins = 0;
        let hadTie = false;
        let rearAlmogavar = false;
        for (let i = 0; i < 3; i++) {
            const attVal = att[i];
            const defVal = opposing[i];
            const greekFire = (attVal === 1 && defVal === 6) || (defVal === 1 && attVal === 6);
            let winner = attVal === defVal ? "TIE" : attVal > defVal ? "ATT" : "DEF";
            if (greekFire) winner = attVal === 1 ? "ATT" : "DEF";
            let almogavar = false;
            if (winner === "ATT") {
                attWins++;
                almogavar = !greekFire && attVal >= 4 && attVal >= 2 * defVal;
                if (almogavar && i < 2) att[i + 1] = Math.min(7, att[i + 1] + 1);
                if (almogavar && i === 2) rearAlmogavar = true;
            } else {
                defWins++;
                hadTie = hadTie || winner === "TIE";
                almogavar = winner === "DEF" && !greekFire && defVal >= 4 && defVal >= 2 * attVal;
                if (almogavar && i < 2) opposing[i + 1] = Math.min(7, opposing[i + 1] + 1);
            }
            steps.push({ type: "CLASH", section: i, attVal, defVal, winner, greekFire, almogavar });
        }
        const roundWinner = attWins >= 2 || (rearAlmogavar && hadTie) ? "ATT" : "DEF";
        const varegos = (roundWinner === "ATT" && attWins === 3) || (roundWinner === "DEF" && defWins === 3);
        if (varegos) steps.push({ type: "VAREGOS", winner: roundWinner, points: 2 });
        return {
            finalAttDice: att,
            finalDefDice: opposing.reverse(),
            roundWinner,
            pointsAwarded: varegos ? 2 : 1,
            steps
        };
    }

    return { validFormation, resolve };
});
