/// <reference path="../.local/bin/pb_data/types.d.ts" />
migrate((app) => {
  const rounds = app.findCollectionByNameOrId("rounds")
  rounds.fields.add(new Field({ name: "starts_at", type: "date" }))
  app.save(rounds)
}, (app) => {
  const rounds = app.findCollectionByNameOrId("rounds")
  rounds.fields.removeByName("starts_at")
  app.save(rounds)
})
