import express from 'express';
import * as crypto from 'crypto';
import { type Response } from 'express';
import { type Request, auth } from "@colyseus/auth";

const projectId = process.env.XSOLLA_PROJECT_ID;
const merchantId = process.env.XSOLLA_MERCHANT_ID;
const apiKey = process.env.XSOLLA_API_KEY;
const webhookSecretKey = process.env.XSOLLA_WEBHOOK_SECRET_KEY;

export const xsolla = express.Router();

xsolla.post('/shop/token', express.json({ limit: '100kb' }), /* auth.middleware(), */ async (req: Request, res: Response) => {
    console.log("req:", req)

    const userId = req.body.userId;
    const name = req.body.name;
    const email = req.body.email;
    const country = req.body.country;

    console.log("req.body", req.body);

    // TODO: do not forget to set "sandbox" to "false" when going live
    const sandbox = (process.env.NODE_ENV !== "production");

    //
    // Use req.auth if you are using the @colyseus/auth middleware 
    // console.log("req.auth", req.auth);
    //

    try {
        const xsollaTokenResponse = await fetch(`https://store.xsolla.com/api/v3/project/${projectId}/admin/payment/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${projectId}:${apiKey}`).toString('base64')
                // 'X-User-Ip': '127.0.0.1'
            },
            body: JSON.stringify({
                user: {
                    id: { value: userId },
                    name: { value: name },
                    email: { value: email },

                    // user.country.value parameter is used to select a currency for the order. 
                    // If user's country is unknown, providing the user's IP in 'X-User-Ip' header is an alternative option.
                    country: { value: country, allow_modify: true }
                },
                purchase: {
                    items: [
                        {
                            // Use the SKU from "Items Catalog -> Virtual Items"
                            sku: "battlepass-season1",
                            quantity: 1
                        },
                    ]
                },
                sandbox,
                settings: {
                    language: "en",
                    currency: "USD",
                    // payment_method: 1380,
                    return_url: "http://localhost:2567/",
                    ui: {
                        /**
                         * - "63295a9a2e47fab76f7708e1": light theme (default) 
                         * - "63295aab2e47fab76f7708e3": the dark theme. 
                         * - You can also create a custom theme:
                         *   Go to "Your project > Payments (Pay Station) > UI theme", and copy the ID of your custom theme.
                         */
                        theme: "63295aab2e47fab76f7708e3"
                    }
                },
                // custom_parameters: {
                //     custom_param: "custom_value"
                // }
            })
        });

        // If the response is not 200, return the error
        const contentType = xsollaTokenResponse.headers.get("content-type") || "";
        let response = (contentType.includes("application/json"))
            ? await xsollaTokenResponse.json()
            : await xsollaTokenResponse.text();

        if (response?.errorMessageExtended) {
            console.log(response.errorMessageExtended);
        }

        res.status(xsollaTokenResponse.status).json({ sandbox, ...response });

    } catch (error) {
        console.error('Error creating Xsolla payment token:', error);
        res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create payment token" } });
    }
});

xsolla.get("/invoice/:invoiceId", async (req: Request, res: Response) => {
    const invoiceId = req.params.invoiceId;

    const response = await fetch(`https://api.xsolla.com/merchant/v2/merchants/${merchantId}/reports/transactions/${invoiceId}/details`, {
        method: 'GET',
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${merchantId}:${apiKey}`).toString('base64')
        }
    });

    const data = await response.json();
    res.status(response.status).json(data);
});

xsolla.post('/webhook', (req: Request, res: Response) => {
    // Read raw body for signature verification
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk);
    req.on('end', () => {
        try {
            // Verify the webhook signature
            if (!verifySignature(req, rawBody)) {
                console.error('Invalid webhook signature');
                res.status(401).json({ error: { code: "INVALID_SIGNATURE" } });
                return;
            }

            // Process the webhook 
            processWebhook(JSON.parse(rawBody), res);
        } catch (err: any) {
            console.error('Error processing Xsolla webhook:', err);
            res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: err.message } });
        }
    });
});

/**
 * Verify the webhook signature
 */
function verifySignature(req: Request, rawBody: string): boolean {
    const signature = req.headers.authorization;
    if (!signature) { return false; }

    // Create expected signature
    const expectedSignature = "Signature " + crypto
        .createHash("sha1")
        .update(rawBody + webhookSecretKey)
        .digest("hex");

    return signature === expectedSignature;
}

/**
 * Process the webhook based on notification type
 */
function processWebhook(data: any, res: Response): void {
    console.log('Received Xsolla webhook:', data.notification_type);

    switch (data.notification_type) {

        case "user_validation": {
            const isValid = handleUserValidation(data);
            console.log("User Validation:", { isValid });
            
            if (!isValid) {
                res.status(400).json({ error: { code: "INVALID_USER" } });
                return;
            }

            break;
        }

        case "order_paid": {
            handleOrderPaid(data);
            break;
        }

        case "order_canceled": {
            handleOrderCanceled(data);
            break;
        }

        default: {
            console.log(`Unhandled notification type: ${data.notification_type}`);
            break;
        }

    }

    // Always respond with 204 No Content for successful webhook processing
    res.status(204).send();
}

/**
 * Handle user validation notification
 */
function handleUserValidation(webhookData: any): boolean {
    const userId = webhookData.user?.id;
    const email = webhookData.user?.email;

    // TODO: query the user from the database
    console.log("User Validation:");
    console.log(`User ID: ${userId}`);
    console.log("Full webhook data:", JSON.stringify(webhookData, null, 2));

    return !userId.includes("test_");
}

/**
 * Handle order paid notification
 */
function handleOrderPaid(webhookData: any): void {
    const userId = webhookData.user?.external_id;
    const skus = webhookData.items?.map((item: any) => item.sku).join(", ");
    const price = `${webhookData.order?.amount} ${webhookData.order?.currency}`;
    const orderId = webhookData.order?.id;

    console.log("Order Paid:");
    console.log(`User ID: ${userId}`);
    console.log(`Order ID: ${orderId}`);
    console.log(`Amount: ${price}`);
    console.log(`Items: ${skus}`);

    // TODO: Implement your game's logic for handling successful purchases
    // Examples:
    // - Add items to player inventory
    // - Grant virtual currency
    // - Unlock premium features
    // - Send confirmation email
    // - Update player statistics
}

/**
 * Handle order canceled notification
 */
function handleOrderCanceled(webhookData: any): void {
    const userId = webhookData.user?.external_id;
    const orderId = webhookData.order?.id;

    console.log("Order Canceled:");
    console.log(`User ID: ${userId}`);
    console.log(`Order ID: ${orderId}`);
    console.log("Full webhook data:", JSON.stringify(webhookData, null, 2));

    // TODO: Implement your game's logic for handling canceled orders
    // Examples:
    // - Revert any temporary changes
    // - Send cancellation notification
    // - Update order status in database
    // - Log cancellation for analytics
}