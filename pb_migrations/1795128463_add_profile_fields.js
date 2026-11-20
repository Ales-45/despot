/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  if (!users.fields.getByName("avatar")) {
    users.fields.add(new Field({
      name: "avatar",
      type: "text",
      required: false,
      max: 64,
    }))
  }
  users.updateRule = '@request.auth.id = id'
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  if (users.fields.getByName("avatar")) {
    users.fields.removeByName("avatar")
  }
  users.updateRule = null
  app.save(users)
})
