# Revoke Telegram Bot

## Deploy to Render
1. Create a Render Web Service from this GitHub repository.
2. Build command: `npm install`
3. Start command: `npm start`
4. Add environment variables:
   - `BOT_TOKEN`: token from BotFather (keep it secret).
   - `ADMIN_IDS`: comma-separated numeric Telegram user IDs.
   - `WEBHOOK_SECRET`: a long random secret.
5. Deploy. Check `/health` on the service URL.

Render sets `RENDER_EXTERNAL_URL`; the bot uses it to register a Telegram webhook. Without it, local development uses long polling.

## Commands
- `/start`, `/menu`: user menu
- `/newkey [days] [GB]`: admin creates a key
- `/stats`, `/users`: admin statistics

## Important limitations
This starter stores data in `data.json`. Render's free service filesystem is not durable across redeploys/restarts, so users and keys can be lost. Add a persistent database before using this for real customers.

The bot issues and tracks strings only. It does not create VPN credentials on a server, validate them in the Revoke app, or enforce traffic limits/expiry. Those require integration with your VPN backend/control plane.
