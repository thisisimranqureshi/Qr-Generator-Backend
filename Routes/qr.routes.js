const express = require("express");
const { ObjectId } = require("mongodb");
const { v4: uuidv4 } = require("uuid");

const auth = require("../Middlewear/Auth");

const router = express.Router();

let usersCollection;
let qrCollection;

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

    module.exports = {
  router,
  setUsersCollection,
  setQrCollection
};