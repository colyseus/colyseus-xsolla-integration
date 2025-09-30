# Colyseus + Xsolla Integration

See documentation → http://docs.colyseus.io/payments/xsolla

![Screenshot](screenshot.png)

## Testing payments locally

1. Install the dependencies
    - `npm install`
2. Start the local server
    - `npm start`
3. From a new terminal window, expose the local server to the internet via `cloudflared` tunnel, and copy the URL.
    - `npm run tunnel` <br/> ![tunnel url](tunnel-url.png)
4. From your Xsolla Dashboard, go to your project's **Payments → Webhooks** settings page and paste the tunnel URL.
    - ![set webhook url](screenshot-webhook-url.png)
5. Copy the updated **Secret key** and set it as the value for `XSOLLA_WEBHOOK_SECRET_KEY` in `.env.development`.

## License

MIT 
