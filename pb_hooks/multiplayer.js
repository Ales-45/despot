const engine = require(`${__hooks}/../pb_public/game-engine.js`);

function findOne(app, collection, filter, params) {
    const records = app.findRecordsByFilter(collection, filter, "", 1, 0, params);
    if (!records.length) throw new NotFoundError("Record not found.");
    return records[0];
}

function newRound(app, match, number, attConstraint, defConstraint) {
    const startsAt = Date.now() + (number > 1 ? 10000 : 0);
    const round = new Record(app.findCollectionByNameOrId("rounds"));
    round.set("match_id", match.id);
    round.set("round_number", number);
    round.set("phase", "LOCKING");
    round.set("starts_at", new Date(startsAt).toISOString());
    round.set("ends_at", new Date(startsAt + 20000).toISOString());
    round.set("att_constraint", attConstraint);
    round.set("def_constraint", defConstraint);
    round.set("first_locker", "NONE");
    round.set("ballesteros_hint", "NONE");
    app.save(round);

    const lock = new Record(app.findCollectionByNameOrId("round_locks"));
    lock.set("round", round.id);
    app.save(lock);
    return round;
}

function archiveRound(app, match, round) {
    const winner = round.getString("round_winner");
    const attacker = match.getString("attacker_id");
    const defender = match.getString("defender_id");
    if ((winner !== "ATT" && winner !== "DEF") || !attacker || !defender || attacker === defender) {
        throw new Error("Cannot archive a round without a result and valid participants.");
    }
    for (const [user, side] of [[attacker, "ATT"], [defender, "DEF"]]) {
        const found = app.findRecordsByFilter("round_history",
            "match_key = {:match} && round_number = {:round} && user = {:user}", "", 1, 0,
            { match: match.id, round: round.getInt("round_number"), user });
        if (found.length) continue;
        const entry = new Record(app.findCollectionByNameOrId("round_history"));
        entry.set("user", user);
        entry.set("match_key", match.id);
        entry.set("round_number", round.getInt("round_number"));
        entry.set("result", winner === side ? "WIN" : "LOSS");
        entry.set("points", winner === side ? round.getInt("points_awarded") : 0);
        entry.set("recorded_at", new Date().toISOString());
        app.save(entry);
    }
}

function cleanupMatches(app) {
    const matches = app.findRecordsByFilter("matches", "status != 'WAITING'", "", 0, 0);
    for (const candidate of matches) {
        try {
            app.runInTransaction((tx) => {
                const match = tx.findRecordById("matches", candidate.id);
                const status = match.getString("status");
                if (status === "WAITING") return;
                const field = status === "FINISHED" ? "finished_at" : "last_activity";
                const last = match.getString(field);
                if (!last) {
                    match.set(field, new Date().toISOString());
                    tx.save(match);
                    return;
                }
                if (Date.now() - new Date(last).getTime() < 5 * 60 * 1000) return;
                const rounds = tx.findRecordsByFilter("rounds", "match_id = {:id}", "", 0, 0, { id: match.id });
                for (const round of rounds) {
                    if (round.getString("phase") === "REVEALED") archiveRound(tx, match, round);
                }
                for (const round of rounds) tx.delete(round);
                tx.delete(match);
            });
        } catch (error) {
            console.error("Could not remove match " + candidate.id + ": " + error);
        }
    }
    app.runInTransaction((tx) => {
        const today = new Date().toISOString().slice(0, 10);
        const expiredPairs = tx.findRecordsByFilter("rated_pairs", "day < {:today}", "", 0, 0, { today });
        for (const pair of expiredPairs) tx.delete(pair);
    });
}

function finishRound(app, match, round, lock) {
    const attText = lock.getString("att_dice");
    const defText = lock.getString("def_dice");
    const att = attText ? JSON.parse(attText) : null;
    const def = defText ? JSON.parse(defText) : null;
    const outcome = engine.resolve(att, def, () => Number($security.randomStringWithAlphabet(1, "123456")));
    if (outcome.roundWinner === "DRAW") {
        lock.set("att_dice", "");
        lock.set("def_dice", "");
        round.set("attempt", round.getInt("attempt") + 1);
        round.set("first_locker", "NONE");
        round.set("ballesteros_hint", "NONE");
        round.set("ends_at", new Date(Date.now() + 20000).toISOString());
        app.save(lock);
        app.save(round);
        return;
    }

    round.set("att_dice_initial", att);
    round.set("def_dice_initial", def);
    round.set("att_dice", outcome.finalAttDice);
    round.set("def_dice", outcome.finalDefDice);
    round.set("att_dice_final", outcome.finalAttDice);
    round.set("def_dice_final", outcome.finalDefDice);
    round.set("round_winner", outcome.roundWinner);
    round.set("points_awarded", outcome.pointsAwarded);
    round.set("resolution_log", outcome.steps);
    round.set("phase", "REVEALED");
    app.save(round);
    archiveRound(app, match, round);

    const attScore = Math.min(3, match.getInt("att_score") + (outcome.roundWinner === "ATT" ? outcome.pointsAwarded : 0));
    const defScore = Math.min(3, match.getInt("def_score") + (outcome.roundWinner === "DEF" ? outcome.pointsAwarded : 0));
    match.set("att_score", attScore);
    match.set("def_score", defScore);
    if (attScore >= 3 || defScore >= 3) {
        const winnerId = match.getString(attScore >= 3 ? "attacker_id" : "defender_id");
        const loserId = match.getString(attScore >= 3 ? "defender_id" : "attacker_id");
        const [playerA, playerB] = [winnerId, loserId].sort();
        const day = new Date().toISOString().slice(0, 10);
        const alreadyRated = app.findRecordsByFilter("rated_pairs",
            "player_a = {:a} && player_b = {:b} && day = {:day}", "", 1, 0,
            { a: playerA, b: playerB, day }).length > 0;
        match.set("elo_unrated", alreadyRated);
        if (!alreadyRated) {
            const pair = new Record(app.findCollectionByNameOrId("rated_pairs"));
            pair.set("player_a", playerA);
            pair.set("player_b", playerB);
            pair.set("day", day);
            app.save(pair);
            const winner = app.findRecordById("users", winnerId);
            const loser = app.findRecordById("users", loserId);
            const winnerElo = winner.getInt("elo");
            const loserElo = loser.getInt("elo");
            const change = Math.min(loserElo, Math.round(32 / (1 + Math.pow(10, (winnerElo - loserElo) / 400))));
            winner.set("elo", winnerElo + change);
            loser.set("elo", loserElo - change);
            app.save(winner);
            app.save(loser);
        }
        match.set("winner_id", winnerId);
        match.set("status", "FINISHED");
        match.set("finished_at", new Date().toISOString());
    } else {
        const number = round.getInt("round_number") + 1;
        if (number > 5) throw new BadRequestError("Could not determine the winner.");
        newRound(app, match, number, outcome.roundWinner === "ATT" ? "ORDER" : "ROUT", outcome.roundWinner === "DEF" ? "ORDER" : "ROUT");
        match.set("current_round", number);
    }
    app.save(match);
}

function handle(e) {
    let body;
    try {
        body = JSON.parse(toString(e.request.body));
    } catch (_) {
        throw new BadRequestError("Invalid data.");
    }
    const action = e.request.pathValue("action");
    if (action === "clock") return e.json(200, { now: Date.now() });
    const user = e.auth;
    let result = {};
    let responseStatus = 200;

    if (action === "create" || action === "join") cleanupMatches($app);
    $app.runInTransaction((app) => {
        if (action === "create") {
            const existing = app.findRecordsByFilter("matches",
                "(player_1 = {:user} || player_2 = {:user}) && status != 'FINISHED'", "", 1, 0, { user: user.id });
            if (existing.length) throw new BadRequestError("You already have an open match.");
            const isPrivate = body.is_private === true;
            if (isPrivate && (typeof body.pin !== "string" || !/^\d{4,8}$/.test(body.pin))) {
                throw new BadRequestError("The PIN must have 4 to 8 digits.");
            }
            const match = new Record(app.findCollectionByNameOrId("matches"));
            const code = $security.randomStringWithAlphabet(4, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
            match.set("room_code", code);
            match.set("player_1", user.id);
            match.set("host_name", user.getString("username"));
            match.set("host_avatar", user.getString("profile_avatar"));
            match.set("host_elo", user.getInt("elo"));
            match.set("is_private", isPrivate);
            if (isPrivate) {
                const salt = $security.randomString(24);
                match.set("pin_hash", salt + ":" + $security.sha256(salt + body.pin));
            }
            match.set("status", "WAITING");
            match.set("p1_role_choice", "NONE");
            match.set("p2_role_choice", "NONE");
            match.set("current_round", 1);
            app.save(match);
            result = { id: match.id };
            return;
        }

        if (action === "join" || action === "start") {
            if (typeof body.match_id !== "string") throw new BadRequestError("Invalid room.");
            const match = findOne(app, "matches", "id = {:id}", { id: body.match_id });
            if (match.getString("status") !== "WAITING") throw new BadRequestError("The room is no longer available.");
            if (action === "start") {
                if (match.getString("player_1") !== user.id) throw new ForbiddenError("Only the host can start.");
                if (!match.getString("player_2")) throw new BadRequestError("An opponent is required.");
                match.set("status", "ROLE_SELECT");
                match.set("last_activity", new Date().toISOString());
                app.save(match);
                result = { id: match.id };
                return;
            }
            if (match.getString("player_1") === user.id || match.getString("player_2") === user.id) {
                result = { id: match.id };
                return;
            }
            if (match.getString("player_2")) throw new BadRequestError("The room already has an opponent.");
            const existing = app.findRecordsByFilter("matches",
                "(player_1 = {:user} || player_2 = {:user}) && status != 'FINISHED'", "", 1, 0, { user: user.id });
            if (existing.length) throw new BadRequestError("You already have an open match.");
            if (match.getBool("is_private")) {
                const now = Date.now();
                const attempts = app.findRecordsByFilter("match_pin_attempts", "match = {:m} && user = {:u}", "", 1, 0, { m: match.id, u: user.id });
                const attempt = attempts.length ? attempts[0] : new Record(app.findCollectionByNameOrId("match_pin_attempts"));
                if (!attempts.length || now - new Date(attempt.getString("window_start")).getTime() >= 60000) {
                    attempt.set("match", match.id);
                    attempt.set("user", user.id);
                    attempt.set("window_start", new Date(now).toISOString());
                    attempt.set("count", 0);
                }
                if (attempt.getInt("count") >= 5) {
                    responseStatus = 429;
                    result = { message: "Too many attempts. Wait one minute." };
                    return;
                }
                const hash = match.getString("pin_hash");
                const separator = hash.indexOf(":");
                const expected = separator < 0 ? $security.sha256(String(body.pin || "")) :
                    $security.sha256(hash.slice(0, separator) + String(body.pin || ""));
                const actual = separator < 0 ? hash : hash.slice(separator + 1);
                if (!$security.equal(actual, expected)) {
                    attempt.set("count", attempt.getInt("count") + 1);
                    app.save(attempt);
                    responseStatus = 403;
                    result = { message: "Incorrect PIN." };
                    return;
                }
                if (attempts.length) app.delete(attempt);
            }
            match.set("player_2", user.id);
            match.set("guest_name", user.getString("username"));
            match.set("guest_avatar", user.getString("profile_avatar"));
            match.set("guest_elo", user.getInt("elo"));
            app.save(match);
            result = { id: match.id };
            return;
        }

        if (action === "role") {
            if (typeof body.match_id !== "string" || (body.choice !== "ATT" && body.choice !== "DEF")) {
                throw new BadRequestError("Invalid role.");
            }
            const match = findOne(app, "matches", "id = {:id}", { id: body.match_id });
            if (match.getString("status") !== "ROLE_SELECT") throw new BadRequestError("Roles are not being selected.");
            const p1 = match.getString("player_1");
            const p2 = match.getString("player_2");
            if (user.id !== p1 && user.id !== p2) throw new ForbiddenError("You are not in this match.");
            const field = user.id === p1 ? "p1_role_choice" : "p2_role_choice";
            if (match.getString(field) !== "NONE") throw new BadRequestError("You already chose a role.");
            match.set(field, body.choice);
            match.set("last_activity", new Date().toISOString());
            const first = match.getString("p1_role_choice");
            const second = match.getString("p2_role_choice");
            if (first !== "NONE" && second !== "NONE") {
                const p1Att = first !== second ? first === "ATT" :
                    ($security.randomStringWithAlphabet(1, "01") === "1" ? first === "ATT" : first === "DEF");
                match.set("attacker_id", p1Att ? p1 : p2);
                match.set("defender_id", p1Att ? p2 : p1);
                match.set("status", "PLAYING");
                newRound(app, match, 1, "FREE", "FREE");
            }
            app.save(match);
            return;
        }

        if (action !== "lock" && action !== "timeout" && action !== "my-lock") throw new NotFoundError("Unknown action.");
        if (typeof body.round_id !== "string") throw new BadRequestError("Invalid round.");
        const round = findOne(app, "rounds", "id = {:id}", { id: body.round_id });
        const match = findOne(app, "matches", "id = {:id}", { id: round.getString("match_id") });
        const isAtt = user.id === match.getString("attacker_id");
        const isDef = user.id === match.getString("defender_id");
        if (!isAtt && !isDef) throw new ForbiddenError("You are not in this match.");
        if (match.getString("status") !== "PLAYING" || round.getString("phase") !== "LOCKING" ||
            round.getInt("round_number") !== match.getInt("current_round")) {
            throw new BadRequestError("The round is no longer active.");
        }
        const lock = findOne(app, "round_locks", "round = {:id}", { id: round.id });
        if (action === "my-lock") {
            const ownDice = lock.getString(isAtt ? "att_dice" : "def_dice");
            result = { dice: ownDice ? JSON.parse(ownDice) : null };
            return;
        }
        const now = Date.now();
        const deadline = new Date(round.getString("ends_at")).getTime();
        if (action === "timeout") {
            if (now < deadline) {
                result = { pending: true };
                return;
            }
            finishRound(app, match, round, lock);
            return;
        }
        const startsAt = round.getString("starts_at");
        if (startsAt && now < new Date(startsAt).getTime()) throw new BadRequestError("The round has not started yet.");
        if (now >= deadline) throw new BadRequestError("The round time has expired.");
        const field = isAtt ? "att_dice" : "def_dice";
        if (lock.getString(field)) throw new BadRequestError("Your dice are already locked in this round.");
        if (!engine.validFormation(body.dice, isAtt ? 11 : 10, round.getString(isAtt ? "att_constraint" : "def_constraint"))) {
            throw new BadRequestError("The formation is invalid.");
        }
        lock.set(field, JSON.stringify(body.dice));
        app.save(lock);
        match.set("last_activity", new Date(now).toISOString());
        app.save(match);
        if (lock.getString("att_dice") && lock.getString("def_dice")) {
            finishRound(app, match, round, lock);
            result = { resolved: true };
            return;
        }
        round.set("first_locker", isAtt ? "ATT" : "DEF");
        if (round.getInt("round_number") > 1) {
            const newDeadline = deadline - 10000;
            round.set("ends_at", new Date(Math.max(now, newDeadline)).toISOString());
            if (newDeadline <= now) {
                finishRound(app, match, round, lock);
                result = { resolved: true };
                return;
            }
            const previous = findOne(app, "rounds", "match_id = {:m} && round_number = {:n}", {
                m: match.id, n: round.getInt("round_number") - 1
            });
            const previousLock = findOne(app, "round_locks", "round = {:id}", { id: previous.id });
            const previousDice = previousLock.getString(field);
            if (previousDice) {
                const hint = Number(body.dice.join("")) >= Number(JSON.parse(previousDice).join("")) ? "HIGHER_OR_EQUAL" : "LOWER";
                round.set("ballesteros_hint", hint);
            }
        }
        app.save(round);
        result = { resolved: false };
    });
    return e.json(responseStatus, result);
}

module.exports = { handle, cleanupMatches };
