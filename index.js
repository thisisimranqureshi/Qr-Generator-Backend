require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

// ⚠️ CRITICAL: Webhook MUST come BEFORE express.json()
const { router: stripeWebhookRouter, setUsersCollection: setWebhookUsersCollection } = 
  require("./Routes/Stripewebhook.js");

// Apply raw body parser ONLY for webhook route
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookRouter);

// NOW apply JSON parser for all other routes
app.use(cors());
app.use(express.json());

// Other routes
const dashboardRoutes = require("./Routes/dashboard.routes.js");
const paymentRoutes = require("./Routes/Paymentcheckout.js");

const {
  router: qrRouter,
  setUsersCollection: setQrUsersCollection,
  setQrCollection: setQrQrCollection,
  setFreeQrCollection: setQrFreeQrCollection
} = require("./Routes/qr.routes");

const { router: authRouter, setCollection: setAuthUsersCollection } =
  require("./Routes/auth.routes");

const { router: scanRouter, setQrCollection: setScanQrCollection } =
  require("./Routes/scan.routes");

const {
  router: adminRouter,
  setUsersCollection: setAdminUsersCollection,
  setQrCollection: setAdminQrCollection,
  setFreeQrCollection: setAdminFreeQrCollection
} = require("./Routes/admin.routes");

// ---------------- MongoDB ----------------
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let usersCollection;
let qrCollection;
let freeQrCollection;

async function startServer() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected successfully");
    
    const db = client.db(process.env.DB_NAME || "Qr-Code");

    // Collections
    usersCollection = db.collection("User");
    qrCollection = db.collection("Scan_count");
    freeQrCollection = db.collection("freeqrs");

    // Inject into routes
    setWebhookUsersCollection(usersCollection); // ✅ Add this
    setAuthUsersCollection(usersCollection);
    setAdminUsersCollection(usersCollection);
    setAdminQrCollection(qrCollection);
    setAdminFreeQrCollection(freeQrCollection);
    setScanQrCollection(qrCollection);
    setQrUsersCollection(usersCollection);
    setQrQrCollection(qrCollection);
    setQrFreeQrCollection(freeQrCollection);

    // ---------------- Routes ----------------
    // Webhook already registered above (before express.json)
    app.use("/api/payment", paymentRoutes);
    app.use("/api/auth", authRouter);
    app.use("/api/admin", adminRouter);
    app.use("/api", qrRouter);
    app.use("/scan", scanRouter);
    app.use("/api/dashboard", dashboardRoutes(qrCollection));

    // Health check
    app.get("/api/health", (req, res) => {
      res.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
        webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET
      });
    });

    // ---------------- QR Stats ----------------
    app.get("/api/stats/:id", async (req, res) => {
      try {
        const qr = await qrCollection.findOne({ _id: req.params.id });
        if (!qr) return res.status(404).json({ error: "QR code not found", scanCount: 0 });
        res.json({ scanCount: qr.scanCount || 0 });
      } catch (err) {
        console.error("Stats error:", err);
        res.status(500).json({ error: "Server error", scanCount: 0 });
      }
    });

    // ---------------- Start Server ----------------
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Payment endpoint: http://localhost:${PORT}/api/payment/create-checkout-session`);
      console.log(`📍 Webhook endpoint: http://localhost:${PORT}/api/stripe/webhook`);
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();