routerUse((e) => {
    const path = e.request.url.path;
    // Keep PocketBase's dashboard and OAuth callback under their own policies.
    if (path !== "/_" && !path.startsWith("/_/") && path !== "/api/oauth2-redirect") {
        e.response.header().set("Content-Security-Policy",
            "default-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    }
    return e.next();
});

onRecordCreate((e) => {
    e.record.set("elo", 1000);
    e.next();
}, "users");

onRecordCreateRequest((e) => {
    const username = e.record.getString("username");
    if (username && require(`${__hooks}/username-filter.js`).isOffensive(username)) {
        throw new BadRequestError("Username contains prohibited words.");
    }
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
    if (user.getString("username") !== original.getString("username") &&
        require(`${__hooks}/username-filter.js`).isOffensive(user.getString("username"))) {
        throw new BadRequestError("Username contains prohibited words.");
    }
    e.next()
}, "users");

onRecordDeleteRequest((e) => {
    e.app.runInTransaction((tx) => {
        require(`${__hooks}/multiplayer.js`).removeUserMatches(tx, e.record.id);
        tx.delete(tx.findRecordById("users", e.record.id));
    });
    return e.noContent(204);
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
