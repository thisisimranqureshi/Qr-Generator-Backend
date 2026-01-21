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
    // ---------------- CREATE QR ----------------
    // ---------------- CREATE QR ----------------
    // ---------------- CREATE QR ----------------
    app.post("/api/create-qr", auth, async (req, res) => {
      try {
        let { type, content, androidLink, iosLink, logo, companyInfo, companySocial, globalHeading, globalDescription } = req.body;

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
          // Default for backwards compatibility
          companyInfo = companyInfo || {
            formName: "",
            companyName: "",
            companyEmail: "",
            companyPhone: "",
            companyAddress: ""
          };

          companySocial = companySocial || {
            instagram: "",
            facebook: "",
            whatsapp: "",
            snapchat: "",
            twitter: ""
          };

          globalHeading = globalHeading || "";
          globalDescription = globalDescription || "";

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
          content.users = content.users.map(user => ({
            name: user.name || "",
            email: user.email || "",
            phone: user.phone || "",
            links: Array.isArray(user.links) ? user.links : []
          }));
        }

        // ---------------- CREATE QR ----------------
        const id = uuidv4();

        await qrCollection.insertOne({
          _id: id,
          type,
          content,
          globalHeading,
          globalDescription,
          androidLink: androidLink || null,
          iosLink: iosLink || null,
          logo: logo || null,
          companyInfo,
          companySocial,
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

        // Increment scan count
        const result = await qrCollection.findOneAndUpdate(
          { _id: id },
          { $inc: { scanCount: 1 } },
          { returnDocument: "after" }
        );

        const qr = result.value || result;
        if (!qr) return res.status(404).send("QR code not found");

        console.log(`✅ QR found. Type: ${qr.type}, New scan count: ${qr.scanCount}`);

        // Check active / limit
        const limit = qr.scanLimit ?? 300;
        if (!qr.active || qr.scanCount > limit) {
          await qrCollection.updateOne({ _id: id }, { $set: { active: false } });
          return res.status(403).send("<h2>QR Disabled or Scan Limit Reached</h2>");
        }

        // Handle app QR
        if (qr.type === "app") {
          const ua = (req.headers["user-agent"] || "").toLowerCase();
          if (ua.includes("iphone") && qr.iosLink) return res.redirect(qr.iosLink);
          if (ua.includes("android") && qr.androidLink) return res.redirect(qr.androidLink);
        }

        // URL / WhatsApp QR
        if (qr.type === "url" || qr.type === "whatsapp") {
          return res.redirect(qr.content.url || qr.content);
        }

        // Text QR
        if (qr.type === "text") {
          return res.send(`
        <html>
          <body style="font-family:Arial;">
            <h2>QR Text</h2>
            <p>${qr.content.text || qr.content}</p>
            <small>Scans: ${qr.scanCount}</small>
            <p>Remaining Scans: ${limit - qr.scanCount}</p>
          </body>
        </html>
      `);
        }

        // Custom QR
        if (qr.type === "custom") {
          const users = qr.content.users || [];
          // ✅ FIX: Access from root level, not from content
          const globalHeading = qr.globalHeading || "";
          const globalDescription = qr.globalDescription || "";
          const companyInfo = qr.companyInfo || {};
          const companySocial = qr.companySocial || {};

          console.log("Debug - globalHeading:", globalHeading);
          console.log("Debug - globalDescription:", globalDescription);
          console.log("Debug - companyInfo:", companyInfo);
          console.log("Debug - companySocial:", companySocial);

          return res.send(`
        <html>
          <head>
            <title>Custom QR Info</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                background: #f5f5f5; 
                padding: 20px;
                margin: 0;
              }
              .header {
                background: #fff;
                padding: 20px;
                margin-bottom: 15px;
                border-radius: 10px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
              }
              .header h1 {
                margin: 0 0 10px 0;
                font-size: 24px;
                color: #2A43F8;
              }
              .header p {
                margin: 0;
                font-size: 16px;
                color: #666;
                line-height: 1.5;
              }
              .user-card, .company-card{ 
                background: #fff; 
                padding: 15px; 
                margin-bottom: 15px; 
                border-radius: 10px; 
                box-shadow: 0 4px 12px rgba(0,0,0,0.1); 
              }
              .company-card {
                border-left: 4px solid #2A43F8;
              }
                .Info-card { 
                background: #fff; 
               padding: 10px 10px 5px 15px; 
                margin-bottom: 15px; 
                border-radius: 10px; 
                box-shadow: 0 4px 12px rgba(0,0,0,0.1); 
              }
                .Info-card h3{
                margin-top:-15px}
              h2 { 
                margin: 0 0 10px 0; 
                font-size: 18px; 
                color: #333; 
              }
              p { 
                margin: 8px 0; 
                font-size: 16px; 
                color: #555; 
                word-break: break-word; 
              }
              a { 
                color: #2A43F8; 
                text-decoration: none; 
                font-weight: 500;
              }
              a:hover {
                text-decoration: underline;
              }
              .social-links {
                display: flex;
                gap: 15px;
                flex-wrap: wrap;
                margin-top: 10px;
              }
              .social-links a {
                padding: 8px 16px;
                background: #f0f0f0;
                border-radius: 6px;
                font-size: 14px;
              }
              .scan-info {
                text-align: center;
                margin-top: 20px;
                color: #999;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
          <div class="Info-card">
           ${companyInfo.companyName ? `<h1><strong></strong> ${companyInfo.companyName}</h1>` : ""}
           ${companyInfo.formName ? `<h3><strong></strong> ${companyInfo.formName}</h3>` : ""}
 </div>
            ${users.length > 0 ? `
  
              ${users.map(user => `
                <div class="user-card">
                  ${user.name ? `<p><strong>👤 Name:</strong> ${user.name}</p>` : ""}
                  ${user.email ? `<p><strong>📧 Email:</strong> <a href="mailto:${user.email}">${user.email}</a></p>` : ""}
                  ${user.phone ? `<p><strong>📱 Phone:</strong> <a href="tel:${user.phone}">${user.phone}</a></p>` : ""}
                  ${Array.isArray(user.links) && user.links.filter(l => l).length > 0 ? `
                    <p><strong>🔗 Links:</strong></p>
                    ${user.links.filter(l => l).map(link => `<p><a href="${link}" target="_blank">${link}</a></p>`).join("")}
                  ` : ""}
                </div>
              `).join("")}
            ` : ""}

            ${Object.values(companyInfo).some(v => v) || Object.values(companySocial).some(v => v) ? `
             
              <div class="company-card">
               
                
                ${companyInfo.companyEmail ? `<p><strong>📧 Email:</strong> <a href="mailto:${companyInfo.companyEmail}">${companyInfo.companyEmail}</a></p>` : ""}
                ${companyInfo.companyPhone ? `<p><strong>📱 Phone:</strong> <a href="tel:${companyInfo.companyPhone}">${companyInfo.companyPhone}</a></p>` : ""}
                ${companyInfo.companyAddress ? `<p><strong>📍 Address:</strong> ${companyInfo.companyAddress}</p>` : ""}
                
                ${Object.values(companySocial).some(v => v) ? `
                  <p style="margin-top: 15px;"><strong>Follow Us:</strong></p>
                  <div class="social-links" style="display:flex; gap:14px; align-items:center;">

  ${companySocial.instagram ? `
  <a href="${companySocial.instagram.startsWith('http') ? companySocial.instagram : 'https://instagram.com/' + companySocial.instagram}" target="_blank">
    <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png"
         alt="Instagram" style="width:36px;height:36px;">
  </a>` : ""}

  ${companySocial.facebook ? `
  <a href="${companySocial.facebook.startsWith('http') ? companySocial.facebook : 'https://facebook.com/' + companySocial.facebook}" target="_blank">
    <img src="https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg"
         alt="Facebook" style="width:36px;height:36px;">
  </a>` : ""}

  ${companySocial.whatsapp ? `
  <a href="${companySocial.whatsapp.startsWith('http') ? companySocial.whatsapp : 'https://wa.me/' + companySocial.whatsapp}" target="_blank">
    <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
         alt="WhatsApp" style="width:36px;height:36px;">
  </a>` : ""}

  ${companySocial.snapchat ? `
<a href="${companySocial.snapchat.startsWith('http') 
  ? companySocial.snapchat 
  : 'https://snapchat.com/add/' + companySocial.snapchat}" 
  target="_blank"
  style="display:inline-flex; align-items:center;"
>
  <svg width="36" height="36" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      fill="#FFFC00"
      d="M12 2c2.9 0 5.3 2.4 5.3 5.3v1.9c0 .7.4 1.1 1 1.4.4.2.9.4.9.8s-.3.7-.8.9c-.7.3-1.2.7-1.2 1.3 0 .5.4 1 .8 1.3.5.4.9.8.9 1.2 0 .6-.7.9-1.6 1-.7.1-1.3.2-1.7.7-.4.4-.5 1-.6 1.6-.1.7-.4 1-1 1-.7 0-1.4-.4-2-.4s-1.3.4-2 .4c-.6 0-.9-.3-1-1-.1-.6-.2-1.2-.6-1.6-.4-.5-1-.6-1.7-.7-.9-.1-1.6-.4-1.6-1 0-.4.4-.8.9-1.2.4-.3.8-.8.8-1.3 0-.6-.5-1-1.2-1.3-.5-.2-.8-.5-.8-.9s.5-.6.9-.8c.6-.3 1-.7 1-1.4V7.3C6.7 4.4 9.1 2 12 2z"
    />
  </svg>
</a>
` : ""}


  ${companySocial.twitter ? `
  <a href="${companySocial.twitter.startsWith('http') ? companySocial.twitter : 'https://twitter.com/' + companySocial.twitter}" target="_blank">
    <img src="https://upload.wikimedia.org/wikipedia/commons/6/6f/Logo_of_Twitter.svg"
         alt="Twitter" style="width:36px;height:36px;">
  </a>` : ""}

</div>


                ` : ""}
              </div>
            ` : ""}

          
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
