# Despot

An asymmetric game where two opponents duel using dice to represent armies on the battlefield from a top 2D perspective. The player is given three dice to arrange in secret with a total point limit. The dice are mirrored between the opponents, where the highest die defeats its counterpart to determine the winner. Wildcards may bend the rules for flavor.

Icons from (https://game-icons.net/).

## Local development

Run PocketBase from the repository root with the project's hooks and migrations:

```sh
./.local/bin/pocketbase serve --http=127.0.0.1:8090 --publicDir=pb_public --migrationsDir=pb_migrations --hooksDir=pb_hooks
```

The multiplayer implementation is not yet ready for production.