# Local Bridge Security Notes

This project includes a browser-to-local-app bridge for development and demonstration. The bridge is intentionally restricted because a public GitHub Pages site must not be able to control applications on a local computer without explicit approval.

## Security Model

- Local services must listen on `127.0.0.1` only.
- Public GitHub Pages does not connect to local apps by default.
- Local access requires `local_bridge=1` and a long private `local_token`.
- The private token is session based and must not be committed, published, logged, or shared.
- The page removes `local_token` from the visible address bar after an approved load.
- Local commands are limited by an explicit action allowlist.
- Origin checks are required before the local service accepts commands.
- After long inactivity, the page asks for browser-level confirmation before reconnecting.

## Allowed Actions

The local bridge should only expose narrow, explicit actions, for example:

- `detect_face` - run a detector request.
- `control_hive` - send approved Hive UI actions.
- `open_beeboard` - open or start the local BeeBoard interface.
- `open_physical` - open the local physical wings simulator.
- `start_ursina` - start the local Ursina simulation.

No generic shell command execution should be exposed to the browser.

## Recommended Local Environment

Example environment variables for a local approved session:

```powershell
$env:BEE_LOCAL_SECURITY_STRICT = "1"
$env:BEE_LOCAL_ALLOWED_ORIGINS = "https://holodininyaroslav.github.io,http://127.0.0.1:8890"
$env:BEE_LOCAL_ALLOWED_ACTIONS = "detect_face,control_hive,open_beeboard,open_physical,start_ursina"
$env:BEE_LOCAL_TOKEN = "replace-with-a-long-private-random-token"
```

Then open the local or public page with `local_bridge=1` and the private `local_token` only for the active approved session.

## What Must Stay Blocked

- Remote visitors must not be able to start local programs.
- The public site must not connect to `127.0.0.1` silently.
- The browser must not expose arbitrary file access.
- The bridge must not run arbitrary commands from query strings or page JavaScript.
- Tokens must not be stored in the repository.
- Tokens must not be left in screenshots, README files, commits, or release notes.

## Practical Rule

Use GitHub Pages as the public portfolio view. Use the local approved session only when you intentionally want the browser page to communicate with local project tools on your own computer.
