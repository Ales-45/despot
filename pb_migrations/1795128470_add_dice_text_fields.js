/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const rounds = app.findCollectionByNameOrId("rounds")
  if (!rounds.fields.getByName("att_dice_text")) {
    rounds.fields.add(new Field({
      name: "att_dice_text",
      type: "text",
      required: false,
      max: 32,
    }))
  }
  if (!rounds.fields.getByName("def_dice_text")) {
    rounds.fields.add(new Field({
      name: "def_dice_text",
      type: "text",
      required: false,
      max: 32,
    }))
  }
  app.save(rounds)
}, (app) => {
  const rounds = app.findCollectionByNameOrId("rounds")
  if (rounds.fields.getByName("att_dice_text")) rounds.fields.removeByName("att_dice_text")
  if (rounds.fields.getByName("def_dice_text")) rounds.fields.removeByName("def_dice_text")
  app.save(rounds)
})
