/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const pairs = new Collection({
    type: "base",
    name: "rated_pairs",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "player_a", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "player_b", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: "day", type: "text", required: true, min: 10, max: 10 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_rated_pairs_day ON rated_pairs (player_a, player_b, day)",
      "CREATE INDEX idx_rated_pairs_expiry ON rated_pairs (day)",
    ],
  })
  app.save(pairs)
  const matches = app.findCollectionByNameOrId("matches")
  matches.fields.add(new Field({ name: "elo_unrated", type: "bool" }))
  app.save(matches)
}, (app) => {
  const matches = app.findCollectionByNameOrId("matches")
  matches.fields.removeByName("elo_unrated")
  app.save(matches)
  app.delete(app.findCollectionByNameOrId("rated_pairs"))
})
