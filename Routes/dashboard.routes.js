const express = require("express");
const { ObjectId } = require("mongodb");
const auth = require("../Middlewear/Auth");

const router = express.Router();

module.exports = (qrCollection) => {

  // ---------------- USER DASHBOARD ----------------
  router.get("/my-dashboard", auth, async (req, res) => {
    try {
      const userId = new ObjectId(req.user.userId);

      const qrs = await qrCollection
        .find({ userId })
      .project({
    type: 1,
    content: 1,         // <-- include content
    companyInfo: 1,     // <-- include company info
    companySocial: 1,   // <-- include social links
    androidLink: 1,     // <-- for app QR
    iosLink: 1,         // <-- for app QR
    scanCount: 1,
    scanLimit: 1,
    active: 1,
    createdAt: 1
  })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        totalQrs: qrs.length,
        qrs
      });

    } catch (err) {
      console.error("Dashboard error:", err);
      res.status(500).json({ error: "Failed to load dashboard" });
    }
  });

  return router;
};
