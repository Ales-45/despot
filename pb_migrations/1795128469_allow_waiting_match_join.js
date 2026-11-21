/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const matches = app.findCollectionByNameOrId("matches")
  matches.updateRule = '@request.auth.id != "" && (player_1 = @request.auth.id || player_2 = @request.auth.id || (status = "WAITING" && player_2 = ""))'
  app.save(matches)
}, (app) => {
  const matches = app.findCollectionByNameOrId("matches")
  matches.updateRule = '@request.auth.id != "" && (player_1 = @request.auth.id || player_2 = @request.auth.id)'
  app.save(matches)
})
