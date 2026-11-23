routerAdd("POST", "/api/despot/{action}", (e) => {
    const multiplayer = require(`${__hooks}/multiplayer.js`);
    return multiplayer.handle(e);
}, $apis.requireAuth("users"));

onBootstrap((e) => {
    e.next();
    require(`${__hooks}/match-history.js`).ensureMatchHistory(e.app);
});

cronAdd("despot-cleanup", "* * * * *", () => {
    require(`${__hooks}/multiplayer.js`).cleanupMatches($app);
});
