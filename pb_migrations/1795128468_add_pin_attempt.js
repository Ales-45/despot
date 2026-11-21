/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const matches = app.findCollectionByNameOrId("matches")
  if (!matches.fields.getByName("pin_attempt")) {
    matches.fields.add(new Field({
      name: "pin_attempt",
      type: "text",
      required: false,
      max: 128,
      hidden: true,
    }))
  }
  app.save(matches)
}, (app) => {
  const matches = app.findCollectionByNameOrId("matches")
  if (matches.fields.getByName("pin_attempt")) {
    matches.fields.removeByName("pin_attempt")
    app.save(matches)
  }
})
