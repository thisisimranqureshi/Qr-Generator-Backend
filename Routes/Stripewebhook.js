const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { ObjectId } = require("mongodb");

// ⚠️ DO NOT use express.raw() here - it's applied in server.js
let usersCollection;

// Setter function to inject MongoDB collection
const setUsersCollection = (collection) => {
  usersCollection = collection;
};

router.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // req.body should already be raw buffer from server.js middleware
    event = stripe.webhooks.constructEvent(
      req.body, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log("✅ Webhook verified:", event.type);
    
  } catch (err) {
    console.error("❌ Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful payment
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata.userId;
    const scans = parseInt(session.metadata.scans, 10);

    console.log(`Processing payment for user ${userId}, adding ${scans} scans`);

    if (!usersCollection) {
      console.error("❌ usersCollection not initialized");
      return res.status(500).json({ error: "Database not configured" });
    }

    try {
      // Fix: Use 'new ObjectId()' not 'ObjectId()'
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { 
          $set: { subscription: "premium" }, 
          $inc: { scanLimit: scans } 
        }
      );

      if (result.matchedCount === 0) {
        console.error(`❌ User ${userId} not found`);
      } else {
        console.log(`✅ User ${userId} upgraded to premium with ${scans} scans`);
      }
      
    } catch (err) {
      console.error("❌ Failed to update user subscription:", err);
      // Don't return error to Stripe - we still received the webhook
    }
  }

  // Always respond with 200 to acknowledge receipt
  res.json({ received: true });
});

module.exports = { router, setUsersCollection };