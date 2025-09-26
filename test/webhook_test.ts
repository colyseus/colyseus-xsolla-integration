/**
 * Test script for Xsolla webhook handler
 * This demonstrates how to test the webhook endpoint locally
 */

import * as crypto from 'crypto';

// Mock webhook data (based on Xsolla documentation)
const mockWebhookData = {
    notification_type: "order_paid",
    user: {
        external_id: "user123"
    },
    order: {
        id: "order456",
        amount: "9.99",
        currency: "USD"
    },
    items: [
        { sku: "premium_pack" },
        { sku: "gold_coins" }
    ]
};

// Mock webhook secret key (use your actual key in production)
const webhookSecretKey = "test-secret-key";

// Create signature for the webhook
function createWebhookSignature(data: any, secretKey: string): string {
    const dataString = JSON.stringify(data);
    return "Signature " + crypto
        .createHash("sha1")
        .update(dataString + secretKey)
        .digest("hex");
}

// Test the webhook signature creation
const signature = createWebhookSignature(mockWebhookData, webhookSecretKey);
const dataString = JSON.stringify(mockWebhookData);

console.log("=== Xsolla Webhook Test ===");
console.log("Webhook Data:", dataString);
console.log("Generated Signature:", signature);
console.log("\nTo test the webhook endpoint:");
console.log("1. Start the server: npm start");
console.log("2. Set environment variable: export XSOLLA_WEBHOOK_SECRET_KEY=test-secret-key");
console.log("3. Send POST request to: http://localhost:2567/webhooks/xsolla");
console.log("4. Include header: Authorization: " + signature);
console.log("5. Include body: " + dataString);
console.log("\nExample curl command:");
console.log(`curl -X POST http://localhost:2567/webhooks/xsolla \\
  -H "Content-Type: application/json" \\
  -H "Authorization: ${signature}" \\
  -d '${dataString}'`);
