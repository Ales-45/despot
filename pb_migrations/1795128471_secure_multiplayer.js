/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const matches = app.findCollectionByNameOrId("matches")
  matches.createRule = null
  matches.updateRule = null
  for (const prefix of ["host", "guest"]) {
    matches.fields.add(new Field({ name: prefix + "_name", type: "text", max: 32 }))
    matches.fields.add(new Field({ name: prefix + "_avatar", type: "text", max: 128 }))
    matches.fields.add(new Field({ name: prefix + "_elo", type: "number", min: 0 }))
  }
  app.save(matches)

  const rounds = app.findCollectionByNameOrId("rounds")
  rounds.updateRule = null
  rounds.fields.add(new Field({ name: "attempt", type: "number", min: 0 }))
  rounds.fields.getByName("att_dice_text").hidden = true
  rounds.fields.getByName("def_dice_text").hidden = true
  app.save(rounds)

  const locks = new Collection({
    type: "base",
    name: "round_locks",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "round", type: "relation", collectionId: rounds.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "att_dice", type: "text", max: 32 },
      { name: "def_dice", type: "text", max: 32 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_round_locks_round ON round_locks (round)"],
  })
  app.save(locks)

  const attempts = new Collection({
    type: "base",
    name: "match_pin_attempts",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "match", type: "relation", collectionId: matches.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "user", type: "relation", collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "count", type: "number", min: 0 },
      { name: "window_start", type: "date", required: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_pin_attempt_user_match ON match_pin_attempts (match, user)"],
  })
  app.save(attempts)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("match_pin_attempts"))
  app.delete(app.findCollectionByNameOrId("round_locks"))
  const matches = app.findCollectionByNameOrId("matches")
  for (const prefix of ["host", "guest"]) {
    for (const suffix of ["_name", "_avatar", "_elo"]) {
      matches.fields.removeByName(prefix + suffix)
    }
  }
  matches.createRule = '@request.auth.id != "" && player_1 = @request.auth.id'
  matches.updateRule = '@request.auth.id != "" && (player_1 = @request.auth.id || player_2 = @request.auth.id || (status = "WAITING" && player_2 = ""))'
  app.save(matches)
  const rounds = app.findCollectionByNameOrId("rounds")
  rounds.fields.removeByName("attempt")
  rounds.updateRule = '@request.auth.id != "" && (match_id.player_1 = @request.auth.id || match_id.player_2 = @request.auth.id)'
  rounds.fields.getByName("att_dice_text").hidden = false
  rounds.fields.getByName("def_dice_text").hidden = false
  app.save(rounds)
})
