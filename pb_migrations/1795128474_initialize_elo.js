/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  for (const user of app.findRecordsByFilter("users", "", "", 0, 0)) {
    user.set("elo", 1000)
    app.save(user)
  }
  for (const match of app.findRecordsByFilter("matches", "status != 'FINISHED'", "", 0, 0)) {
    match.set("host_elo", 1000)
    if (match.getString("player_2")) match.set("guest_elo", 1000)
    app.save(match)
  }
}, (app) => {})
