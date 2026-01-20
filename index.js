// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const { v4: uuidv4 } = require("uuid");

const { router: authRouter, setCollection: setAuthUsersCollection } =
  require("./Routes/auth.routes");

const {
  router: adminRouter,
  setUsersCollection: setAdminUsersCollection,setQrCollection: setAdminQrCollection
} = require("./Routes/admin.routes");

const auth = require("./Middlewear/Auth");
const admin = require("./Middlewear/Admins");

const app = express();
app.use(cors());
app.use(express.json());

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

    // ---------------- Routes ----------------
    app.use("/api/auth", authRouter);
    app.use("/api/admin", adminRouter);

    // ---------------- CREATE QR ----------------
   app.post("/api/create-qr", auth, async (req, res) => {
  try {
    const { type, content, androidLink, iosLink } = req.body;

    if (!type || !content) {
      return res.status(400).json({ error: "Missing required data" });
    }

    // Check premium only for text or app
    const isPremiumFeature = type === "text" || type === "app";
    if (isPremiumFeature && req.user.subscription !== "premium") {
      return res.status(403).json({
        error: "This feature requires a premium subscription"
      });
    }

    const id = uuidv4();

    // Insert QR into Scan_count collection
    await qrCollection.insertOne({
      _id: id,
      type,
  content,
      androidLink: androidLink || null,
      iosLink: iosLink || null,
      scanCount: 0,
      scanLimit: isPremiumFeature ? 300 : null,
      active: true,
      createdAt: new Date(),
      userId: new ObjectId(req.user.userId)
    });

    // ✅ Increment user's totalQrs
    await usersCollection.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $inc: { totalQrs: 1 } }
    );

    res.json({ id });
  } catch (err) {
    console.error("Create QR error:", err);
    res.status(500).json({ error: "Error creating QR" });
  }
});



    // ---------------- SCAN QR ----------------
// ---------------- SCAN QR ----------------
app.get("/scan/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📱 Scanning QR: ${id}`);

    // 🔹 ATOMIC INCREMENT - Find and update in one operation
    const result = await qrCollection.findOneAndUpdate(
      { _id: id },
      { $inc: { scanCount: 1 } },
      { returnDocument: "after" }
    );

    console.log("Update result:", result);

    // Handle different MongoDB driver versions
    const qr = result.value || result;

    if (!qr) {
      console.log(`❌ QR not found: ${id}`);
      return res.status(404).send("QR code not found");
    }

    console.log(`✅ QR found. Type: ${qr.type}, New scan count: ${qr.scanCount}`);

    // ⛔ Check if QR is inactive
    if (!qr.active) {
      console.log(`🚫 QR is disabled: ${id}`);
      return res.status(403).send(`
        <html><body><h2>QR Disabled</h2></body></html>
      `);
    }

    // 🚫 Check scan limit
    const limit = qr.scanLimit ?? 300;
    if (qr.scanCount > limit) {
      console.log(`⛔ Scan limit reached for QR: ${id}`);
      await qrCollection.updateOne(
        { _id: id },
        { $set: { active: false } }
      );
      return res.status(403).send(`
        <html><body><h2>Scan Limit Reached</h2></body></html>
      `);
    }

    const ua = (req.headers["user-agent"] || "").toLowerCase();

    // 📱 App QR
    if (qr.type === "app") {
      if (ua.includes("iphone") && qr.iosLink) {
        console.log(`🍎 Redirecting to iOS: ${qr.iosLink}`);
        return res.redirect(qr.iosLink);
      }
      if (ua.includes("android") && qr.androidLink) {
        console.log(`🤖 Redirecting to Android: ${qr.androidLink}`);
        return res.redirect(qr.androidLink);
      }
    }

    // 🌐 URL / WhatsApp
    if (qr.type === "url" || qr.type === "whatsapp") {
      console.log(`🔗 Redirecting to: ${qr.content}`);
      return res.redirect(qr.content);
    }

    // 📝 Text QR
    if (qr.type === "text") {
      console.log(`📝 Displaying text QR`);
      return res.send(`
        <html>
          <body style="font-family:Arial;">
            <h2>QR Text</h2>
            <p>${qr.content}</p>
            <small>Scans: ${qr.scanCount}</small>
            <p>Remaining Scans: ${limit - qr.scanCount}</p>
          </body>
        </html>
      `);
    }
 if (qr.type === "custom") {
  return res.send(`
    <html>
      <head>
        <title>QR Info</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          /* Reset */
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: 'Arial', sans-serif;
            background-color: #f5f5f5;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
          }

          .qr-container {
            background: #fff;
            padding: 25px 20px;
            border-radius: 15px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            width: 100%;
            max-width: 500px;
            text-align: center;
          }

          h2 {
            color: #333;
            margin-bottom: 25px;
            font-size: 22px;
          }

          p {
            margin-bottom: 20px;
            font-size: 18px;
            color: #444;
            word-wrap: break-word;
            line-height: 1.5;
          }

          a {
            color: #2A43F8;
            text-decoration: none;
            font-weight: bold;
          }

          a:hover {
            text-decoration: underline;
          }

          small {
            display: block;
            margin-top: 25px;
            color: #888;
            font-size: 14px;
          }

          /* Make text bigger on very small devices */
          @media (max-width: 360px) {
            h2 {
              font-size: 20px;
            }
            p {
              font-size: 16px;
            }
          }
        </style>
      </head>
      <body>
        <div class="qr-container">
         
          ${qr.content.text ? `<p>${qr.content.text}</p>` : ""}
          ${qr.content.url ? `<p> <a href="${qr.content.url}" target="_blank">${qr.content.url}</a></p>` : ""}
        
        </div>
      </body>
    </html>
  `);
}




    console.log(`❓ Invalid QR type: ${qr.type}`);
    res.status(400).send("Invalid QR type");
  } catch (err) {
    console.error("❌ Scan error:", err);
    res.status(500).send("Server error");
  }
});


    // ---------------- STATS ----------------
    app.get("/api/stats/:id", async (req, res) => {
      try {
        const qr = await qrCollection.findOne({ _id: req.params.id });
        if (!qr) return res.status(404).json({ error: "QR code not found" });
        res.json({ scanCount: qr.scanCount });
      } catch (err) {
        console.error("Stats error:", err);
        res.status(500).json({ error: "Server error" });
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
