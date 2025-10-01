import express from 'express';
import * as crypto from 'crypto';
import { type Response as ExpressResponse } from 'express';
import { type Request as ExpressRequest, auth } from "@colyseus/auth";

const projectId = process.env.XSOLLA_PROJECT_ID;
const merchantId = process.env.XSOLLA_MERCHANT_ID;
const apiKey = process.env.XSOLLA_API_KEY;
const webhookSecretKey = process.env.XSOLLA_WEBHOOK_SECRET_KEY;

export const xsolla = express.Router();

xsolla.post('/token', express.json({ limit: '100kb' }), /* auth.middleware(), */ async (req: ExpressRequest, res: ExpressResponse) => {
    //
    // Recommended: Use auth.middleware() to authenticate the request instead of manually parsing the request body
    // console.log("req.auth", req.auth);
    //
    const userId = req.body.userId;
    const name = req.body.name;
    const email = req.body.email;
    const country = req.body.country;
    const purchaseType = req.body.purchaseType;

    // TODO: do not forget to set "sandbox" to "false" when going live
    const sandbox = (process.env.NODE_ENV !== "production");

    try {
        let tokenResponse: Response;

        if (purchaseType === "virtualItem") {
            /**
             * Purchasing a virtual item
             * See operation documentation here: https://developers.xsolla.com/api/shop-builder/operation/admin-create-payment-token/
             */
            tokenResponse = await fetch(`https://store.xsolla.com/api/v3/project/${projectId}/admin/payment/token`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + Buffer.from(`${merchantId}:${apiKey}`).toString('base64')
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
                            // Set up a virtual item: https://developers.xsolla.com/doc/shop-builder/features/virtual-items/#shop_builder_virtual_items_set_up_in_pa_create_item
                            {
                                sku: "my-virtual-item",
                                quantity: 1
                            }
                        ]
                    },
                    sandbox,
                    settings: {
                        language: "en",
                        currency: "USD",
                        // payment_method: 1380, // Optional: set preferred payment method
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
                    // }
                })
            });

        } else {

            /**
             * Creating a subscription
             * See operation documentation here: https://developers.xsolla.com/api/subscriptions/operation/create-token/
             */
            tokenResponse = await fetch(`https://api.xsolla.com/merchant/v2/merchants/${merchantId}/token`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + Buffer.from(`${merchantId}:${apiKey}`).toString('base64')
                    // 'X-User-Ip': '127.0.0.1'
                },
                body: JSON.stringify({
                    user: {
                        id: { value: userId, hidden: true },
                        name: { value: name, hidden: false },
                        email: { value: email },
                        // user.country.value parameter is used to select a currency for the order. 
                        // If user's country is unknown, providing the user's IP in 'X-User-Ip' header is an alternative option.
                        country: { value: country, allow_modify: true }
                    },
                    purchase: {
                        // Set up a subscription plan: https://developers.xsolla.com/doc/subscriptions/integration-guide/set-up-plan/
                        subscription: {
                            plan_id: "72qb7Cu9"
                        },
                    },
                    settings: {
                        project_id: Number(projectId),
                        // external_id: "unique_transaction_id", // OPTIONAL: add your unique transaction ID here
                        language: "en",
                        mode: (sandbox) ? "sandbox" : "production",
                        currency: "USD",
                    },
                    // custom_parameters: {
                    // }
                })
            });

        }

        // If the response is not 200, return the error
        const contentType = tokenResponse.headers.get("content-type") || "";
        let response = (contentType.includes("application/json"))
            ? await tokenResponse.json()
            : await tokenResponse.text();

        // If the response is not 200, log the error
        if (tokenResponse.ok) { 
            // success
            res.status(tokenResponse.status).json({ sandbox, ...response });

        } else {
            // error
            console.error(response.errorMessageExtended || response.extended_message || response.message);
            console.log("Raw response:", response);
            res.status(tokenResponse.status).json({ error: response.errorMessageExtended || response.message });
        }


    } catch (error) {
        console.error('Error creating Xsolla payment token:', error);
        res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create payment token" } });
    }
});

xsolla.get("/invoice/:invoiceId", async (req: ExpressRequest, res: ExpressResponse) => {
    const invoiceId = req.params.invoiceId;

    const response = await fetch(`https://api.xsolla.com/merchant/v2/merchants/${merchantId}/reports/transactions/${invoiceId}/details`, {
        method: 'GET',
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${merchantId}:${apiKey}`).toString('base64')
        }
    });

    res.status(response.status).json(await response.json());
});

xsolla.post('/webhook', (req: ExpressRequest, res: ExpressResponse) => {
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
function verifySignature(req: ExpressRequest, rawBody: string): boolean {
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
function processWebhook(data: any, res: ExpressResponse): void {
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

        case "create_subscription": {
            handleCreateSubscription(data);
            break;
        }

        case "update_subscription": {
            handleUpdateSubscription(data);
            break;
        }

        case "cancel_subscription": {
            handleCancelSubscription(data);
            break;
        }

        case "refund": {
            handleRefund(data);
            break;
        }

        default: {
            console.log(`Unhandled notification type: ${data.notification_type}`, data);
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
    const userId = webhookData.user?.id;
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

/**
 * Handle create subscription notification
 */
function handleCreateSubscription(webhookData: any): void {
    const userId = webhookData.user?.id;
    const orderId = webhookData.subscription?.subscription_id;

    console.log("Create Subscription:");
    console.log(`User ID: ${userId}`);
    console.log(`Order ID: ${orderId}`);
    console.log("Full webhook data:", JSON.stringify(webhookData, null, 2));

    // TODO: Implement your game's logic for handling create subscriptions
    // Examples:
    // - Grant access to the subscription
}

/**
 * Handle update subscription notification
 */
function handleUpdateSubscription(webhookData: any): void {
    const userId = webhookData.user?.id;
    const orderId = webhookData.subscription?.subscription_id;

    console.log("Update Subscription:");
    console.log(`User ID: ${userId}`);
    console.log(`Order ID: ${orderId}`);
    console.log("Full webhook data:", JSON.stringify(webhookData, null, 2));
}

/**
 * Handle cancel subscription notification
 */
function handleCancelSubscription(webhookData: any): void {
    const userId = webhookData.user?.id;
    const orderId = webhookData.subscription?.subscription_id;

    console.log("Cancel Subscription:");
    console.log(`User ID: ${userId}`);
    console.log(`Order ID: ${orderId}`);
    console.log("Full webhook data:", JSON.stringify(webhookData, null, 2));
}

/**
 * Handle refund notification
 */
function handleRefund(webhookData: any): void {
    console.log("Refund:", JSON.stringify(webhookData, null, 2));
}