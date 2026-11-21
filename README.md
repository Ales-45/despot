# Despot

An asymmetric game where two opponents duel using dice to represent armies on the battlefield from a top 2D perspective. The player is given three dice to arrange in secret with a total point limit. The dice are mirrored between the opponents, where the highest die defeats its counterpart to determine the winner. Wildcards may bend the rules for flavor.

Some icons from (https://game-icons.net/) and IMFellDWPica font

## Local development

Requirements:

- Browser with JavaScript, local storage and EventSource enabled.
- A Google Account for online multiplayer and login, Google OAuth configured in the PocketBase 'users' collection with the appropriate client credentials and redirect URL. 
- [PocketBase](https://pocketbase.io/docs/) 0.40.6 for the host operating system. Place the executable at `.local/bin/pocketbase` for the command below.

Run PocketBase from the repository root with the project's hooks and migrations:

```sh
./.local/bin/pocketbase serve --http=127.0.0.1:8090 --publicDir=pb_public --migrationsDir=pb_migrations --hooksDir=pb_hooks
```

Open `http://127.0.0.1:8090/` in the browser.