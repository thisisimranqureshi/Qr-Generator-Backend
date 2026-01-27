require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

// ============================================
// MIDDLEWARE (BEFORE ROUTES)
// ============================================

// Webhook needs raw body
const { router: stripeWebhookRouter, setUsersCollection: setWebhookUsersCollection } = 
  require("./Routes/Stripewebhook.js");

app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookRouter);

// JSON parser for other routes
app.use(cors({
  origin: [
    "http://localhost:5173",   // ✅ Vite dev server
    "http://localhost:3000",   // optional (old React default)
    "https://qrcodesmart.tech" // production
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// IMPORT ROUTES
// ============================================
const dashboardRoutes = require("./Routes/dashboard.routes.js");
const paymentRoutes = require("./Routes/Paymentcheckout.js");

const {
  router: qrRouter,
  setUsersCollection: setQrUsersCollection,
  setQrCollection: setQrQrCollection,
  setFreeQrCollection: setQrFreeQrCollection
} = require("./Routes/qr.routes.js");

const { router: authRouter, setCollection: setAuthUsersCollection } =
  require("./Routes/auth.routes.js");

const { router: scanRouter, setQrCollection: setScanQrCollection } =
  require("./Routes/scan.routes.js");

const {
  router: adminRouter,
  setUsersCollection: setAdminUsersCollection,
  setQrCollection: setAdminQrCollection,
  setFreeQrCollection: setAdminFreeQrCollection
} = require("./Routes/admin.routes.js");

// ============================================
// REGISTER ROUTES (BEFORE MONGODB CONNECTION)
// ============================================

// Health check (no DB needed)
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    env: {
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
      webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
      mongoConfigured: !!process.env.MONGO_URI
    }
  });
});

// Register payment routes BEFORE async function
console.log("📍 Registering payment routes...");
app.use("/api/payment", paymentRoutes);

// Register other routes
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api", qrRouter);
app.use("/scan", scanRouter);

// ============================================
// MongoDB Connection
// ============================================
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let usersCollection;
let qrCollection;
let freeQrCollection;

async function startServer() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("✅ MongoDB connected successfully");
    
    const db = client.db(process.env.DB_NAME || "Qr-Code");

    // Get collections
    usersCollection = db.collection("User");
    qrCollection = db.collection("Scan_count");
    freeQrCollection = db.collection("freeqrs");

    // Inject collections into routes
    setWebhookUsersCollection(usersCollection);
    setAuthUsersCollection(usersCollection);
    setAdminUsersCollection(usersCollection);
    setAdminQrCollection(qrCollection);
    setAdminFreeQrCollection(freeQrCollection);
    setScanQrCollection(qrCollection);
    setQrUsersCollection(usersCollection);
    setQrQrCollection(qrCollection);
    setQrFreeQrCollection(freeQrCollection);

    // Register routes that need DB collections
    app.use("/api/dashboard", dashboardRoutes(qrCollection));

    // QR Stats route
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

    // 404 handler
    app.use((req, res) => {
      console.log(`❌ 404: ${req.method} ${req.url}`);
      res.status(404).json({ 
        error: "Route not found",
        method: req.method,
        path: req.url
      });
    });

    // Start server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Payment: http://localhost:${PORT}/api/payment/create-checkout-session`);
      console.log(`📍 Webhook: http://localhost:${PORT}/api/stripe/webhook`);
      console.log(`📍 Health: http://localhost:${PORT}/api/health`);
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();