/// <reference path="../.local/bin/pb_data/types.d.ts" />
migrate((app) => {
  const matches = app.findCollectionByNameOrId("matches")
  matches.fields.add(new Field({ name: "last_activity", type: "date" }))
  matches.fields.add(new Field({ name: "finished_at", type: "date" }))
  app.save(matches)

  const history = new Collection({
    type: "base",
    name: "round_history",
    listRule: '@request.auth.id != "" && user = @request.auth.id',
    viewRule: '@request.auth.id != "" && user = @request.auth.id',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "user", type: "relation", collectionId: app.findCollectionByNameOrId("users").id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "match_key", type: "text", required: true, max: 32 },
      { name: "round_number", type: "number", required: true, min: 1, max: 5 },
      { name: "result", type: "select", required: true, values: ["WIN", "LOSS"] },
      { name: "points", type: "number", min: 0, max: 2 },
      { name: "recorded_at", type: "date", required: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_history_round_user ON round_history (match_key, round_number, user)"],
  })
  app.save(history)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("round_history"))
  const matches = app.findCollectionByNameOrId("matches")
  matches.fields.removeByName("last_activity")
  matches.fields.removeByName("finished_at")
  app.save(matches)
})
