function createMatchHistory(app, users) {
    app.save(new Collection({
        type: "base",
        name: "match_history",
        listRule: '@request.auth.id != "" && user = @request.auth.id',
        viewRule: '@request.auth.id != "" && user = @request.auth.id',
        fields: [
            { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
            { name: "match_key", type: "text", required: true, max: 32 },
            { name: "result", type: "select", required: true, values: ["WIN", "LOSS"] },
            { name: "user_score", type: "number", min: 0, max: 3 },
            { name: "opponent_score", type: "number", min: 0, max: 3 },
            { name: "recorded_at", type: "date", required: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_match_history_match_user ON match_history (match_key, user)"],
    }));
}

function ensureMatchHistory(app) {
    app.runInTransaction((tx) => {
        const existing = new DynamicModel({ matches: 0, history: 0 });
        tx.db().newQuery("SELECT " +
            "COUNT(*) FILTER (WHERE name = 'matches') AS matches, " +
            "COUNT(*) FILTER (WHERE name = 'match_history') AS history FROM _collections").one(existing);
        if (existing.matches && !existing.history) {
            createMatchHistory(tx, tx.findCollectionByNameOrId("users"));
        }
    });
}

module.exports = { createMatchHistory, ensureMatchHistory };