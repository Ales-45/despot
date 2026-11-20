/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  if (!users.fields.getByName("profile_avatar")) {
    users.fields.add(new Field({
      name: "profile_avatar",
      type: "text",
      required: false,
      max: 64,
    }))
  }
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  if (users.fields.getByName("profile_avatar")) {
    users.fields.removeByName("profile_avatar")
    app.save(users)
  }
})
