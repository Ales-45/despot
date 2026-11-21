routerAdd("POST", "/api/despot/{action}", (e) => {
    const multiplayer = require(`${__hooks}/multiplayer.js`);
    return multiplayer.handle(e);
}, $apis.requireAuth("users"));

cronAdd("despot-cleanup", "* * * * *", () => {
    require(`${__hooks}/multiplayer.js`).cleanupMatches($app);
});
