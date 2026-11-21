/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  if (!users.fields.getByName("theme")) {
    users.fields.add(new Field({
      name: "theme",
      type: "select",
      required: false,
      values: ["dark", "light"],
    }))
  }
  if (!users.fields.getByName("language")) {
    users.fields.add(new Field({
      name: "language",
      type: "select",
      required: false,
      values: ["ES", "EN", "IT"],
    }))
  }
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  if (users.fields.getByName("theme")) users.fields.removeByName("theme")
  if (users.fields.getByName("language")) users.fields.removeByName("language")
  app.save(users)
})
