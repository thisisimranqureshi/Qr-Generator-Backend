const express = require("express");
const router = express.Router();

// Check if Stripe key exists BEFORE initializing
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is not set!");
}



const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "sk_test_dummy");

console.log("✅ Payment routes module loaded");

router.post("/create-checkout-session", async (req, res) => {
  console.log("✅ Payment endpoint hit!");
  console.log("Body:", req.body);
  console.log("Headers:", req.headers);

  try {
    const { pack, userId } = req.body;

    // Validate inputs
    if (!pack || !userId) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ 
        error: "Missing required fields",
        received: { pack, userId }
      });
    }

    // Check Stripe configuration
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("❌ Stripe not configured");
      return res.status(500).json({ error: "Payment system not configured" });
    }

    const packs = {
      small: { price: 200, scans: 100 },
      medium: { price: 900, scans: 500 },
      large: { price: 3000, scans: 2000 },
    };

    const selectedPack = packs[pack];
    if (!selectedPack) {
      console.log("❌ Invalid pack:", pack);
      return res.status(400).json({ error: "Invalid pack selected" });
    }

    console.log(`Creating session for ${selectedPack.scans} scans...`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "QR Code Scan Credits",
              description: `${selectedPack.scans} QR code scans`,
            },
            unit_amount: selectedPack.price,
          },
          quantity: 1,
        },
      ],
      success_url: `https://qrcodesmart.tech/payment-success`,
      cancel_url: `https://qrcodesmart.tech/payment-cancel`,
      metadata: {
        userId: userId,
        scans: selectedPack.scans.toString(),
      },
    });

    console.log("✅ Stripe session created:", session.id);
    res.json({ url: session.url });
    
  } catch (error) {
    console.error("❌ Stripe Error:", error.message);
    console.error("Full error:", error);
    res.status(500).json({ 
      error: "Payment session failed",
      details: error.message 
    });
  }
});

module.exports = router;