# Colyseus + Xsolla Integration

A simple integration between Colyseus and Xsolla for handling in-game payments. 

### Demo features

- Client requests a payment token from the Colyseus server
- The Colyseus server requests a payment token from Xsolla using manually provided user's information
  - *(It is recommended to use the [@colyseus/auth middleware](https://docs.colyseus.io/auth/http) to authenticate the request instead)*
- Uses the token to open the Xsolla Pay Station UI
- When asked for credit card information, use [one of the test cards](https://developers.xsolla.com/doc/pay-station/testing/test-cards/#pay_station_references_test_cards_success) from Xsolla.
  - *Such as: 💳 `4111 1111 1111 1111` · Exp. date: `12/40` · CVV2: any 3 digits.*

<div align="center">
    <img width="300" alt="Xsolla + Colyseus integration demo" src="screenshot.png" />
</div>

> [!NOTE]
> See full documentation → http://docs.colyseus.io/payments/xsolla

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
