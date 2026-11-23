/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const existing = new DynamicModel({ count: 0 })
  app.db().newQuery("SELECT COUNT(*) AS count FROM _collections WHERE name IN " +
    "('matches', 'rounds', 'round_locks', 'match_pin_attempts', 'round_history', 'match_history', 'rated_pairs')")
    .one(existing)
  if (existing.count || ["username", "elo", "profile_avatar", "theme", "language"].some(
    field => users.fields.getByName(field)
  )) {
    throw new Error("Existing Despot schema without complete legacy migration history; restore the history or use the previous version.")
  }

  if (users.fields.getByName("avatar")) users.fields.removeByName("avatar")
  users.fields.add(new Field({ name: "username", type: "text", max: 32 }))
  users.fields.add(new Field({ name: "elo", type: "number", min: 0 }))
  users.fields.add(new Field({ name: "profile_avatar", type: "text", max: 64 }))
  users.fields.add(new Field({ name: "theme", type: "select", values: ["dark", "light"] }))
  users.fields.add(new Field({ name: "language", type: "select", values: ["ES", "EN", "IT"] }))
  users.listRule = '@request.auth.id = id'
  users.viewRule = '@request.auth.id = id'
  users.updateRule = '@request.auth.id = id'
  unmarshal({ "passwordAuth": { "enabled": false } }, users)
  app.save(users)
  for (const user of app.findRecordsByFilter("users", "", "", 0, 0)) {
    user.set("elo", 1000)
    app.save(user)
  }

  const matches = new Collection({
    type: "base",
    name: "matches",
    listRule: '@request.auth.id != "" && (status = "WAITING" || player_1 = @request.auth.id || player_2 = @request.auth.id)',
    viewRule: '@request.auth.id != "" && (player_1 = @request.auth.id || player_2 = @request.auth.id)',
    createRule: null,
    updateRule: null,
    deleteRule: '@request.auth.id != "" && player_1 = @request.auth.id && status = "WAITING"',
    fields: [
      { name: "room_code", type: "text", required: true, max: 8 },
      { name: "is_private", type: "bool" },
      { name: "pin_hash", type: "text", max: 128, hidden: true },
      { name: "player_1", type: "relation", collectionId: users.id, maxSelect: 1, required: true },
      { name: "player_2", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "attacker_id", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "defender_id", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "winner_id", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "status", type: "select", required: true, values: ["WAITING", "ROLE_SELECT", "PLAYING", "FINISHED"] },
      { name: "p1_role_choice", type: "select", required: true, values: ["NONE", "ATT", "DEF"] },
      { name: "p2_role_choice", type: "select", required: true, values: ["NONE", "ATT", "DEF"] },
      { name: "att_score", type: "number", min: 0, max: 3 },
      { name: "def_score", type: "number", min: 0, max: 3 },
      { name: "current_round", type: "number", required: true, min: 1, max: 5 },
      { name: "host_name", type: "text", max: 32 },
      { name: "guest_name", type: "text", max: 32 },
      { name: "host_avatar", type: "text", max: 128 },
      { name: "guest_avatar", type: "text", max: 128 },
      { name: "host_elo", type: "number", min: 0 },
      { name: "guest_elo", type: "number", min: 0 },
      { name: "last_activity", type: "date" },
      { name: "finished_at", type: "date" },
      { name: "elo_unrated", type: "bool" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_matches_room_code ON matches (room_code)",
      "CREATE INDEX idx_matches_waiting ON matches (status)",
    ],
  })
  app.save(matches)

  const rounds = new Collection({
    type: "base",
    name: "rounds",
    listRule: '@request.auth.id != "" && match_id.player_1 = @request.auth.id || match_id.player_2 = @request.auth.id',
    viewRule: '@request.auth.id != "" && match_id.player_1 = @request.auth.id || match_id.player_2 = @request.auth.id',
    createRule: '@request.auth.id != "" && @request.auth.id = ""',
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "match_id", type: "relation", collectionId: matches.id, maxSelect: 1, required: true },
      { name: "round_number", type: "number", required: true, min: 1, max: 5 },
      { name: "phase", type: "select", required: true, values: ["LOCKING", "REVEALED"] },
      { name: "starts_at", type: "date" },
      { name: "ends_at", type: "date", required: true },
      { name: "att_constraint", type: "select", required: true, values: ["FREE", "ORDER", "ROUT"] },
      { name: "def_constraint", type: "select", required: true, values: ["FREE", "ORDER", "ROUT"] },
      { name: "att_dice", type: "json" },
      { name: "def_dice", type: "json" },
      { name: "att_dice_initial", type: "json" },
      { name: "def_dice_initial", type: "json" },
      { name: "att_dice_final", type: "json" },
      { name: "def_dice_final", type: "json" },
      { name: "first_locker", type: "select", required: true, values: ["NONE", "ATT", "DEF"] },
      { name: "ballesteros_hint", type: "select", required: true, values: ["NONE", "HIGHER_OR_EQUAL", "LOWER"] },
      { name: "round_winner", type: "select", values: ["ATT", "DEF", "DRAW"] },
      { name: "points_awarded", type: "number", min: 0, max: 2 },
      { name: "resolution_log", type: "json" },
      { name: "attempt", type: "number", min: 0 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_rounds_match_number ON rounds (match_id, round_number)"],
  })
  app.save(rounds)

  app.save(new Collection({
    type: "base",
    name: "round_locks",
    fields: [
      { name: "round", type: "relation", collectionId: rounds.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "att_dice", type: "text", max: 32 },
      { name: "def_dice", type: "text", max: 32 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_round_locks_round ON round_locks (round)"],
  }))
  app.save(new Collection({
    type: "base",
    name: "match_pin_attempts",
    fields: [
      { name: "match", type: "relation", collectionId: matches.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "count", type: "number", min: 0 },
      { name: "window_start", type: "date", required: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_pin_attempt_user_match ON match_pin_attempts (match, user)"],
  }))
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
  }))
  app.save(new Collection({
    type: "base",
    name: "rated_pairs",
    fields: [
      { name: "player_a", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "player_b", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "day", type: "text", required: true, min: 10, max: 10 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_rated_pairs_day ON rated_pairs (player_a, player_b, day)",
      "CREATE INDEX idx_rated_pairs_expiry ON rated_pairs (day)",
    ],
  }))
}, () => {
  throw new Error("This migration cannot restore removed fields; restore a backup instead.")
})
