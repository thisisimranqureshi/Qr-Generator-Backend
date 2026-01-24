require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const { v4: uuidv4 } = require("uuid");
//----------------------create qr-code route--------------------
const {
  router: qrRouter,
  setUsersCollection: setQrUsersCollection,
  setQrCollection: setQrQrCollection
} = require("./Routes/qr.routes");

//---------------------scan qr-code route-------------------------
const { router: authRouter, setCollection: setAuthUsersCollection } =
  require("./Routes/auth.routes");
const {
  router: scanRouter,
  setQrCollection: setScanQrCollection
} = require("./Routes/scan.routes");

//--------------------admin route-----------------------
const {
  router: adminRouter,
  setUsersCollection: setAdminUsersCollection, setQrCollection: setAdminQrCollection
} = require("./Routes/admin.routes");
const auth = require("./Middlewear/Auth");
const admin = require("./Middlewear/Admins");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/scan", scanRouter);


// ---------------- MongoDB ----------------
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let usersCollection;
let qrCollection;

async function startServer() {
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || "Qr-Code");
    usersCollection = db.collection("User");
    qrCollection = db.collection("Scan_count");

    // inject collections
    setAuthUsersCollection(usersCollection);
    setAdminUsersCollection(usersCollection);
    setAdminQrCollection(qrCollection);
    setScanQrCollection(qrCollection);
    setQrUsersCollection(usersCollection);
    setQrQrCollection(qrCollection);

    // ---------------- Routes ----------------
    app.use("/api/auth", authRouter);
    app.use("/api/admin", adminRouter);
    app.use("/api", qrRouter);
    app.use("/scan", scanRouter);

    // ---------------- CREATE QR ----------------


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

    // ---------------- START SERVER ----------------
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT}`)
    );
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();
