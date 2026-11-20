/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new Field({
    name: "username",
    type: "text",
    required: false,
    max: 32,
  }))
  users.fields.add(new Field({
    name: "elo",
    type: "number",
    required: false,
    min: 0,
  }))
  app.save(users)

  const matches = new Collection({
    type: "base",
    name: "matches",
    listRule: '@request.auth.id != "" && (status = "WAITING" || player_1 = @request.auth.id || player_2 = @request.auth.id)',
    viewRule: '@request.auth.id != "" && (player_1 = @request.auth.id || player_2 = @request.auth.id)',
    createRule: '@request.auth.id != "" && player_1 = @request.auth.id',
    updateRule: '@request.auth.id != "" && (player_1 = @request.auth.id || player_2 = @request.auth.id)',
    deleteRule: '@request.auth.id != "" && player_1 = @request.auth.id && status = "WAITING"',
    fields: [
      { name: "room_code", type: "text", required: true, max: 8 },
      { name: "is_private", type: "bool", required: false },
      { name: "pin_hash", type: "text", required: false, max: 128, hidden: true },
      { name: "player_1", type: "relation", collectionId: users.id, maxSelect: 1, required: true },
      { name: "player_2", type: "relation", collectionId: users.id, maxSelect: 1, required: false },
      { name: "attacker_id", type: "relation", collectionId: users.id, maxSelect: 1, required: false },
      { name: "defender_id", type: "relation", collectionId: users.id, maxSelect: 1, required: false },
      { name: "winner_id", type: "relation", collectionId: users.id, maxSelect: 1, required: false },
      { name: "status", type: "select", required: true, values: ["WAITING", "ROLE_SELECT", "PLAYING", "FINISHED"] },
      { name: "p1_role_choice", type: "select", required: true, values: ["NONE", "ATT", "DEF"] },
      { name: "p2_role_choice", type: "select", required: true, values: ["NONE", "ATT", "DEF"] },
      { name: "att_score", type: "number", required: true, min: 0, max: 3 },
      { name: "def_score", type: "number", required: true, min: 0, max: 3 },
      { name: "current_round", type: "number", required: true, min: 1, max: 5 },
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
    updateRule: '@request.auth.id != "" && (match_id.player_1 = @request.auth.id || match_id.player_2 = @request.auth.id)',
    deleteRule: null,
    fields: [
      { name: "match_id", type: "relation", collectionId: matches.id, maxSelect: 1, required: true },
      { name: "round_number", type: "number", required: true, min: 1, max: 5 },
      { name: "phase", type: "select", required: true, values: ["LOCKING", "REVEALED"] },
      { name: "ends_at", type: "date", required: true },
      { name: "att_constraint", type: "select", required: true, values: ["FREE", "ORDER", "ROUT"] },
      { name: "def_constraint", type: "select", required: true, values: ["FREE", "ORDER", "ROUT"] },
      { name: "att_dice", type: "json", required: false },
      { name: "def_dice", type: "json", required: false },
      { name: "att_dice_initial", type: "json", required: false },
      { name: "def_dice_initial", type: "json", required: false },
      { name: "att_dice_final", type: "json", required: false },
      { name: "def_dice_final", type: "json", required: false },
      { name: "first_locker", type: "select", required: true, values: ["NONE", "ATT", "DEF"] },
      { name: "ballesteros_hint", type: "select", required: true, values: ["NONE", "HIGHER_OR_EQUAL", "LOWER"] },
      { name: "round_winner", type: "select", required: false, values: ["ATT", "DEF", "DRAW"] },
      { name: "points_awarded", type: "number", required: false, min: 0, max: 2 },
      { name: "resolution_log", type: "json", required: false },
      { name: "force_timeout", type: "bool", required: false },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_rounds_match_number ON rounds (match_id, round_number)",
    ],
  })
  app.save(rounds)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("rounds")) } catch (_) {}
  try { app.delete(app.findCollectionByNameOrId("matches")) } catch (_) {}
})
