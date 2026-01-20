const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const { v4: uuidv4 } = require("uuid");
const { router: authRouter, setCollection: setUsersCollection } = require("./Routes/auth.routes");
const auth = require("./Middlewear/Auth")
const subscription = require("./Middlewear/Subscription")
const admin =require("./Middlewear/Admin")
const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

// ---------------- MongoDB ----------------
// const uri = "mongodb+srv://cosc221101050kfueitedupk_db_user:OYeV0HwAd5OVPTAV@cluster0.msiqwrr.mongodb.net/?appName=Cluster0";
const uri = "mongodb://127.0.0.1:27017/Qr-Code";
const client = new MongoClient(uri);

let collection;       // QR code collection
let usersCollection;  // user collection

async function startServer() {
  try {
    await client.connect();
    const db = client.db("Qr-Code");

    collection = db.collection("Scan_count");
    usersCollection = db.collection("User");

    // pass the users collection to auth router
    setUsersCollection(usersCollection);

    // ---------------- Routes ----------------
    app.use("/api/auth", authRouter);

    // QR code routes (your existing code)
   app.post("/api/create-qr", auth, async (req, res) => {
  try {
    const { type, content, androidLink, iosLink, logo } = req.body;

    //  Validate input
    if (!type || !content) {
      return res.status(400).json({ error: "Missing required data" });
    }

    // Check premium features
    const isPremiumFeature = type === "text" || type === "app" || !!logo;
    if (isPremiumFeature && req.user.subscription !== "premium") {
      return res.status(403).json({ error: "This feature requires a premium subscription" });
    }

    // 3️⃣ Create QR
const id = uuidv4();
await collection.insertOne({
  _id: id,
  type,
  content,
  androidLink: androidLink || null,
  iosLink: iosLink || null,
  logo: logo || null,
  scanCount: 0,
  scanLimit: type === "text" || type === "app" || logo ? 300 : null, 
  active: true,
  createdAt: new Date(),
   userId: new ObjectId(req.user.userId),
});


    // 4️⃣ Return QR ID
    res.json({ id });
  } catch (err) {
    console.error("Create QR error:", err);
    res.status(500).json({ error: "Error creating QR" });
  }
});



    app.get("/scan/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const qr = await collection.findOne({ _id: id });
        if (!qr) {
          return res.status(404).json({ error: "QR code not found" });
        }


        await collection.updateOne({ _id: id }, { $inc: { scanCount: 1 } });

        // 📱 App redirection
        const ua = (req.headers["user-agent"] || "").toLowerCase();
        if (qr.type === "app") {
          if (ua.includes("iphone") && qr.iosLink) return res.redirect(qr.iosLink);
          if (ua.includes("android") && qr.androidLink) return res.redirect(qr.androidLink);
        }

        // 🔗 URL / WhatsApp
        if (qr.type === "url" || qr.type === "whatsapp") {
          return res.redirect(qr.content);
        }

        // TEXT QR 
        if (qr.type === "text") {
          return res.send(`
        <html>
          <head>
            <style>
              body {
                font-family: Arial;
                background: #f5f5f5;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
              }
              .box {
                background: white;
                padding: 20px;
                border-radius: 10px;
                max-width: 500px;
                text-align: center;
                box-shadow: 0 4px 10px rgba(0,0,0,.1);
              }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>QR Text</h2>
              <p>${qr.content}</p>
              <small>Scans: ${qr.scanCount + 1}</small>
            </div>
          </body>
        </html>
      `);
        }

        res.status(400).send("Invalid QR type");
      } catch (err) {
        console.error("Scan error:", err);
        res.status(500).json({ error: "Server error" });
      }
    });


    app.get("/api/stats/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const qr = await collection.findOne({ _id: id });
        if (!qr) {
          return res.status(404).json({ error: "QR code not found" });
        }


        res.json({ scanCount: qr.scanCount });
      } catch (err) {
        console.error("Stats error:", err);
        res.status(500).json({ error: "Server error" });
      }
    });

    //---------------Admin Dashbaord----------------------
 app.get("/api/admin/users", auth, admin, async (req, res) => {
  try {
    const users = await usersCollection.aggregate([
      {
        $lookup: {
          from: "Scan_count",
          localField: "_id",
          foreignField: "userId",
          as: "qrs"
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          subscription: 1,
          totalQrs: { $size: "$qrs" }
        }
      }
    ]).toArray();

    res.json(users);
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
//-----------------user qr in admin panel-----------------
app.get("/api/admin/user/:userId/qrs", auth, admin, async (req, res) => {
  try {
    const userId = new ObjectId(req.params.userId);

    const qrs = await collection.find({ userId }).toArray();

    res.json(qrs);
  } catch (err) {
    console.error("Admin user QR error:", err);
    res.status(500).json({ error: "Server error" });
  }
});





    // ---------------- Start Server ----------------
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();
