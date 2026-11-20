/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const matches = app.findCollectionByNameOrId("matches")
  const attScore = matches.fields.getByName("att_score")
  const defScore = matches.fields.getByName("def_score")
  if (attScore) attScore.required = false
  if (defScore) defScore.required = false
  if (!matches.fields.getByName("is_bot")) {
    matches.fields.add(new Field({
      name: "is_bot",
      type: "bool",
      required: false,
    }))
  }
  if (!matches.fields.getByName("bot_name")) {
    matches.fields.add(new Field({
      name: "bot_name",
      type: "text",
      required: false,
      max: 32,
    }))
  }
  app.save(matches)
}, (app) => {
  const matches = app.findCollectionByNameOrId("matches")
  if (matches.fields.getByName("is_bot")) matches.fields.removeByName("is_bot")
  if (matches.fields.getByName("bot_name")) matches.fields.removeByName("bot_name")
  app.save(matches)
})
