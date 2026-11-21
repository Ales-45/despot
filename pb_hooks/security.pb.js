onRecordCreate((e) => {
    e.record.set("elo", 1000);
    e.next();
}, "users");

onRecordUpdateRequest((e) => {
    const auth = e.auth;
    if (!auth) throw new BadRequestError("Authentication is required.");
    const user = e.record;
    const original = user.original();
    if (!e.hasSuperuserAuth() && user.get("elo") !== original.get("elo")) {
        throw new ForbiddenError("Elo can only change after an authorized match.");
    }
    e.next()
}, "users");

onRecordUpdateRequest((e) => {
    const auth = e.auth;
    if (!auth) throw new BadRequestError("Authentication is required.");
    const round = e.record;
    const original = round.original();

    const immutable = ["match_id", "round_number", "ends_at", "att_constraint", "def_constraint"];
    for (const field of immutable) {
        if (round.get(field) !== original.get(field)) {
            throw new ForbiddenError("Only the server can change that round field.");
        }
    }
    e.next()
}, "rounds");
