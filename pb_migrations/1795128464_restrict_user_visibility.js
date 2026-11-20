/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.listRule = '@request.auth.id = id'
  users.viewRule = '@request.auth.id = id'
  users.updateRule = '@request.auth.id = id'
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.listRule = null
  users.viewRule = null
  users.updateRule = null
  app.save(users)
})
