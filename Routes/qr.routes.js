const express = require("express");
const { ObjectId } = require("mongodb");
const { v4: uuidv4 } = require("uuid");

const auth = require("../Middlewear/Auth");

const router = express.Router();

let usersCollection;
let qrCollection;
// At the top, after setting qrCollection and usersCollection
let freeQrCollection;

const setFreeQrCollection = (collection) => {
    freeQrCollection = collection;
};


// inject collections
const setUsersCollection = (collection) => {
    usersCollection = collection;
};

const setQrCollection = (collection) => {
    qrCollection = collection;
};
router.post("/create-qr", auth, async (req, res) => {
  try {
    let { type, content, androidLink, iosLink, logo, companyInfo, companySocial, globalHeading, globalDescription } = req.body;

    if (!type) return res.status(400).json({ error: "Missing QR type" });

    // Normalize content object based on type
    switch (type) {
      case "text":
        content = { text: content || "" };
        break;

      case "url":
      case "facebook":
      case "youtube":
      case "instagram":
      case "image":
        content = { url: content || "" };
        break;

      case "email":
        content = { text: content || "" }; // mailto link handled in frontend if needed
        break;

  case "whatsapp":
  if (!content) return res.status(400).json({ error: "WhatsApp content required" });

  // If content is string, assume phone only
  if (typeof content === "string") {
    content = { phone: content, message: "" };
  }

  if (!content.phone) return res.status(400).json({ error: "WhatsApp phone number is required" });

  content = {
    phone: content.phone,
    message: content.message || ""
  };
  break;



      case "app":
        content = { androidLink: androidLink || "", iosLink: iosLink || "" };
        break;

      case "custom":
        // existing custom logic
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

        if (!Array.isArray(content.users) || content.users.length === 0) {
          return res.status(400).json({ error: "Custom QR must have at least one user" });
        }

        if (req.user.subscription !== "premium" && content.users.length > 1) {
          return res.status(403).json({
            error: "Free plan allows only 1 user in custom QR. Upgrade to premium for more."
          });
        }

        content.users = content.users.map(user => ({
          name: user.name || "",
          email: user.email || "",
          phone: user.phone || "",
          links: Array.isArray(user.links) ? user.links : [],
          social: user.social || {}
        }));
        break;

      default:
        return res.status(400).json({ error: "Unknown QR type" });
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
      companyInfo: companyInfo || {},
      companySocial: companySocial || {},
      scanCount: 0,
      scanLimit: ["text", "app"].includes(type) ? 300 : null,
      active: true,
      createdAt: new Date(),
      userId: new ObjectId(req.user.userId)
    });
    // ---------------- FREE QR TRACKING ----------------
const freeTypes = ["whatsapp", "url", "email", "facebook", "youtube", "instagram", "image"]; // define your free types
if (freeTypes.includes(type)) {
  // Save a document in freeqrs collection
  await freeQrCollection.updateOne(
    { _id: "globalCounter" },             // singleton document to track total
    { 
      $inc: { total: 1 },                 // increment total free QR count
      $push: { qrData: {                 // save this QR's info
        qrId: id,
        type,
        userId: req.user.userId,
        createdAt: new Date()
      }}
    },
    { upsert: true }                      // create if doesn't exist
  );
}

    // Update user QR count
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
router.post("/create-free-qr", async (req, res) => {
  try {
    const { type, userId } = req.body;

    await freeQrCollection.updateOne(
      { _id: "globalCounter" },
      {
        $inc: { total: 1 },
        $push: { qrData: { type, userId: userId || null, createdAt: new Date() } },
      },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Free QR tracking error:", err);
    res.status(500).json({ error: "Failed to track free QR" });
  }
});



module.exports = {
    router,
    setUsersCollection,
    setQrCollection,
    setFreeQrCollection
};