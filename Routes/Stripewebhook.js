const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { ObjectId } = require("mongodb");

let usersCollection;
let qrCollection;  // ← Need this for Scan_count

const setUsersCollection = (collection) => {
  usersCollection = collection;
  console.log("✅ Webhook usersCollection set");
};

const setQrCollection = (collection) => {
  qrCollection = collection;
  console.log("✅ Webhook qrCollection set");
};

router.post("/", async (req, res) => {
  console.log("\n==========================================");
  console.log("🔔 WEBHOOK RECEIVED");
  console.log("==========================================");
  
  const sig = req.headers["stripe-signature"];
  let event;

  try {
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const scans = parseInt(session.metadata?.scans, 10);

    console.log("\n💳 CHECKOUT SESSION COMPLETED");
    console.log("userId:", userId);
    console.log("scans to add:", scans);

    if (!userId || !scans) {
      console.error("❌ Missing userId or scans in metadata");
      return res.status(400).json({ error: "Invalid metadata" });
    }

    if (!usersCollection || !qrCollection) {
      console.error("❌ Collections not initialized");
      return res.status(500).json({ error: "Database not configured" });
    }

    try {
      // 1. Update USER subscription to premium
      console.log("\n🔄 Updating user subscription...");
      const userResult = await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { subscription: "premium" } }
      );

      console.log("User update result:");
      console.log("  Matched:", userResult.matchedCount);
      console.log("  Modified:", userResult.modifiedCount);

      if (userResult.matchedCount === 0) {
        console.error(`❌ User ${userId} not found`);
      } else {
        console.log(`✅ User ${userId} subscription set to premium`);
      }

      // 2. Update ALL QR codes for this user - add scans to their scanLimit
      console.log("\n🔄 Updating QR codes scanLimit...");
      const qrResult = await qrCollection.updateMany(
        { userId: userId },  // Match all QRs for this user
        { $inc: { scanLimit: scans } }  // Add scans to each QR's scanLimit
      );

      console.log("QR codes update result:");
      console.log("  Matched:", qrResult.matchedCount);
      console.log("  Modified:", qrResult.modifiedCount);
      console.log(`✅ Added ${scans} scans to ${qrResult.modifiedCount} QR codes`);

      // 3. Verify the updates
      console.log("\n🔍 Verification:");
      const updatedUser = await usersCollection.findOne({ _id: new ObjectId(userId) });
      const userQrs = await qrCollection.find({ userId: userId }).toArray();
      
      console.log("User subscription:", updatedUser?.subscription);
      console.log("User QR codes:", userQrs.length);
      userQrs.forEach(qr => {
        console.log(`  - QR ${qr._id}: scanLimit = ${qr.scanLimit}`);
      });

      console.log("\n🎉 Payment processing complete!");
      
    } catch (err) {
      console.error("\n❌ Database update failed:");
      console.error("Error:", err.message);
      console.error("Stack:", err.stack);
    }
  } else {
    console.log("ℹ️ Unhandled event type:", event.type);
  }

  console.log("==========================================\n");
  res.json({ received: true });
});

module.exports = { router, setUsersCollection, setQrCollection };