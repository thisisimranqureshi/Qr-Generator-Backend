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
  setUsersCollection: setAdminUsersCollection, setQrCollection: setAdminQrCollection
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
    // ---------------- CREATE QR ----------------
    app.post("/api/create-qr", auth, async (req, res) => {
      try {
        const { type, content, androidLink, iosLink, logo } = req.body;

        if (!type || !content) {
          return res.status(400).json({ error: "Missing required data" });
        }

        // ---------------- PREMIUM CHECK ----------------
        const isPremiumFeature = type === "text" || type === "app";
        if (isPremiumFeature && req.user.subscription !== "premium") {
          return res.status(403).json({
            error: "This feature requires a premium subscription"
          });
        }

        // ---------------- CUSTOM QR VALIDATION ----------------
        if (type === "custom") {
          // Ensure content.users exists and is array
          if (!Array.isArray(content.users) || content.users.length === 0) {
            return res.status(400).json({ error: "Custom QR must have at least one user" });
          }

          // Optional: limit free users to 1 user
          if (req.user.subscription !== "premium" && content.users.length > 1) {
            return res.status(403).json({
              error: "Free plan allows only 1 user in custom QR. Upgrade to premium for more."
            });
          }

          // Validate each user object
          for (const user of content.users) {
            if (!user.heading || !user.description || !user.phone) {
              return res.status(400).json({
                error: "Each user must have heading, description, and phone"
              });
            }

            if (!Array.isArray(user.links)) user.links = [];
            if (!user.social) user.social = {};
          }
        }

        // ---------------- CREATE QR ----------------
        const id = uuidv4();

        await qrCollection.insertOne({
          _id: id,
          type,
          content,
          androidLink: androidLink || null,
          iosLink: iosLink || null,
          logo: logo || null,
          scanCount: 0,
          scanLimit: isPremiumFeature ? 300 : null,
          active: true,
          createdAt: new Date(),
          userId: new ObjectId(req.user.userId)
        });

        // ---------------- UPDATE USER QR COUNT ----------------
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

    // 🔹 Find and increment scan count
    const result = await qrCollection.findOneAndUpdate(
      { _id: id },
      { $inc: { scanCount: 1 } },
      { returnDocument: "after" }
    );

    const qr = result.value || result;

    if (!qr) return res.status(404).send("QR code not found");

    // Inactive check
    if (!qr.active) {
      return res.status(403).send(`<html><body><h2>QR Disabled</h2></body></html>`);
    }

    const limit = qr.scanLimit ?? 300;
    if (qr.scanCount > limit) {
      await qrCollection.updateOne({ _id: id }, { $set: { active: false } });
      return res.status(403).send(`<html><body><h2>Scan Limit Reached</h2></body></html>`);
    }

    const ua = (req.headers["user-agent"] || "").toLowerCase();

    // App QR redirect
    if (qr.type === "app") {
      if (ua.includes("iphone") && qr.iosLink) return res.redirect(qr.iosLink);
      if (ua.includes("android") && qr.androidLink) return res.redirect(qr.androidLink);
    }

    // URL / WhatsApp
    if (qr.type === "url" || qr.type === "whatsapp") return res.redirect(qr.content);

    // Text QR
    if (qr.type === "text") {
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

    // Custom QR
    if (qr.type === "custom") {
      return res.send(`
        <html>
          <head>
          
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: Arial, sans-serif; background:#f5f5f5; padding:20px; }
              .user-card { background:#fff; padding:15px; margin-bottom:15px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.1);}
              h2 { margin-bottom:10px; font-size:18px; color:#333; }
              p { margin:4px 0; font-size:16px; color:#555; word-break: break-word; }
              a { color:#fffff; text-decoration:none; }
              a:hover { text-decoration:underline; }
              .social-links { display:flex; gap:10px; margin-top:10px; }
              .social-links a { display:inline-block; width:32px; height:32px; }
              .social-links img { width:100%; height:100%; object-fit:contain; }
            </style>
          </head>
          <body>
          

            ${qr.content.users.map(user => `
              <div class="user-card">
                <h2>${user.heading}</h2>
                <p>${user.description}</p>
                <p>Phone: <a href="tel:${user.phone}">${user.phone}</a></p>

                ${user.links.map(link => `<p> Website: <a href="${link}" target="_blank">${link}</a></p>`).join("")}

                <div class="social-links">
                  ${user.social.instagram ? `<a href="https://instagram.com/${user.social.instagram.replace(/^https?:\/\//, '')}" target="_blank"><img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" alt="Instagram"/></a>` : ""}
                  ${user.social.facebook ? `<a href="https://facebook.com/${user.social.facebook.replace(/^https?:\/\//, '')}" target="_blank"><img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook"/></a>` : ""}
                  ${user.social.whatsapp ? `<a href="https://wa.me/${user.social.whatsapp.replace(/\D/g,'')}" target="_blank"><img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp"/></a>` : ""}
                  ${user.social.x ? `<a href="https://twitter.com/${user.social.x.replace(/^https?:\/\//, '')}" target="_blank"><img src="https://cdn-icons-png.flaticon.com/512/733/733579.png" alt="X"/></a>` : ""}
                </div>
              </div>
            `).join("")}

          </body>
        </html>
      `);
    }

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
