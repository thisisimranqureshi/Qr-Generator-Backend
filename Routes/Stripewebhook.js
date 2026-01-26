const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { ObjectId } = require("mongodb");

// Use raw body for Stripe signature verification
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata.userId;
    const scans = parseInt(session.metadata.scans, 10);

    try {
      // Upgrade user subscription to premium and add scan credits
      await usersCollection.updateOne(
        { _id: ObjectId(userId) },
        { $set: { subscription: "premium" }, $inc: { scanLimit: scans } }
      );

      console.log(`✅ User ${userId} upgraded to premium with ${scans} scans`);
    } catch (err) {
      console.error("Failed to update user subscription:", err);
    }
  }

  res.json({ received: true });
});

module.exports = router;
