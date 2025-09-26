import { Request, Response } from 'express';
import * as crypto from 'crypto';
import express from 'express';

const webhookSecretKey = process.env.XSOLLA_WEBHOOK_SECRET_KEY;

export const xsolla = express.Router();

xsolla.post('/shop/token', express.json(), async (req: Request, res: Response) => {
    const merchantId = Number(process.env.XSOLLA_MERCHANT_ID);
    const projectId = Number(process.env.XSOLLA_PROJECT_ID);
    const apiKey = process.env.XSOLLA_API_KEY;

    // TODO: do not forget to set "sandbox" to "false" when going live
    const sandbox = (process.env.NODE_ENV !== "production");

    try {
        const xsollaTokenResponse = await fetch(`https://store.xsolla.com/api/v3/project/${projectId}/admin/payment/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${merchantId}:${apiKey}`).toString('base64')
                // 'X-User-Ip': '127.0.0.1'
            },
            body: JSON.stringify({
                user: {
                    id: { value: "1" },
                    name: { value: "Endel Dreyer" },
                    email: { value: "endel@colyseus.io" },

                    // user.country.value parameter is used to select a currency for the order. 
                    // If user's country is unknown, providing the user's IP in 'X-User-Ip' header is an alternative option.
                    country: { value: "US", allow_modify: true }
                },
                purchase: {
                    items: [
                        {
                            // Retrieve the SKU from "Items Catalog -> Virtual Items"
                            sku: "battlepass-season1",
                            quantity: 1
                        },
                    ]
                },
                sandbox,
                settings: {
                    language: "en",
                    // external_id: "AABBCCDD01",
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

    // // Allow to provide "settings.ui.size" from query parameter
    // const size = req.body.size || "medium";
    // /**
    //  * For more information about creating tokens,
    //  * please read https://developers.xsolla.com/api/pay-station/operation/create-token/
    //  */
    // const xsollaTokenResponse = await fetch(
    //     `https://api.xsolla.com/merchant/v2/merchants/${merchantId}/token`,
    //     {
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/json',
    //             Authorization: 'Basic ' + Buffer.from(`${merchantId}:${apiKey}`).toString('base64')
    //         },
    //         body: JSON.stringify({
    //             settings: {
    //                 currency: 'USD',
    //                 project_id: projectId,
    //                 ui: { size },

    //                 /**
    //                  * Use "sandbox" for testing
    //                  */
    //                 mode: "sandbox", 

    //                 /**
    //                  * You need to pass either the user country or the user’s IP address when requesting the payment token. Using these data, the system determines the purchase currency, the language for localizing the payment interface and calculates taxes.
    //                  */
    //                 language: 'en',
    //             },

    //             user: {
    //                 email: {
    //                     value: 'email@example.com'
    //                 },
    //                 id: { value: 'user_2' },
    //                 name: { value: 'John Smith' }
    //             }
    //         })
    //     }
    // );

    // // If the response is not 200, return the error
    // if (xsollaTokenResponse.status !== 200) {
    //     const contentType = xsollaTokenResponse.headers.get("content-type") || "";
    //     let response = (contentType.includes("application/json"))
    //         ? await xsollaTokenResponse.json()
    //         : await xsollaTokenResponse.text();

    //     if (response?.extended_message?.property_errors) {
    //         console.log(response.extended_message.property_errors);
    //     }

    //     console.log({response})

    //     res.status(xsollaTokenResponse.status).send(response);
    //     return;
    // }

    // res.json(await xsollaTokenResponse.json());
});

xsolla.post('/webhook', (req: Request, res: Response) => {
    // req.body is undefined unless another middleware sets it
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk);
    req.on('end', () => {
        try {
            console.log("rawData:", rawBody);
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
    if (!signature) {
        return false; 
    }

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
            // handleUserValidation(webhookData);

            if (data.user.id.startsWith("test_")) {
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
    console.log("Full webhook data:", JSON.stringify(webhookData, null, 2));

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