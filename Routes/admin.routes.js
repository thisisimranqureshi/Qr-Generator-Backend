const express = require("express");
const { ObjectId } = require("mongodb");
const auth = require("../Middlewear/Auth");
const admin = require("../Middlewear/Admins");

const router = express.Router();

let usersCollection;
let qrCollection; // ⚠ Add this

// setter to inject DB collections
const setUsersCollection = (collection) => {
  usersCollection = collection;
};

const setQrCollection = (collection) => {
  qrCollection = collection; // ⚠ Add this
};

// ---------------- ROUTES ----------------

// GET all users (admin only)
router.get("/users", auth, admin, async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();

    // Calculate total QRs for each user
    const usersWithQrs = await Promise.all(
      users.map(async (user) => {
        const totalQrs = await qrCollection.countDocuments({
          userId: new ObjectId(user._id),
        });
        return { ...user, totalQrs };
      })
    );

    res.json(usersWithQrs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 🔐 Admin can update user subscription
router.patch("/user/:id/subscription", auth, admin, async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!["free", "premium"].includes(subscription)) {
      return res.status(400).json({ error: "Invalid subscription value" });
    }

    await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { subscription } }
    );

    res.json({ message: "Subscription updated successfully" });
  } catch (err) {
    console.error("Subscription update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET all QR codes of a single user (admin only)
router.get("/user/:id/qrs", auth, admin, async (req, res) => {
  try {
    const userId = req.params.id;

    const qrs = await qrCollection
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();

    const formattedQrs = qrs.map((qr) => ({
      _id: qr._id,
      type: qr.type,
      content: qr.content,
      androidLink: qr.androidLink,
      iosLink: qr.iosLink,
      scanCount: qr.scanCount,
      scanLimit: qr.scanLimit ?? 300,
      remainingScans: (qr.scanLimit ?? 300) - qr.scanCount,
      active: qr.active,
      createdAt: qr.createdAt,
    }));

    res.json(formattedQrs);
  } catch (err) {
    console.error("Error fetching user QR codes:", err);
    res.status(500).json({ error: "Server error" });
  }
});
// 🔁 Toggle QR active/disabled (admin only)
// 🔁 Admin toggle QR active/inactive
router.patch("/qr/:id/toggle", auth, admin, async (req, res) => {
  try {
    const qrId = req.params.id;

    const qr = await qrCollection.findOne({ _id: qrId });

    if (!qr) {
      return res.status(404).json({ error: "QR not found" });
    }

    const updatedStatus = !qr.active;

    await qrCollection.updateOne(
      { _id: qrId },
      { $set: { active: updatedStatus } }
    );

    res.json({
      message: "QR status updated",
      active: updatedStatus
    });
  } catch (err) {
    console.error("Toggle QR error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = {
  router,
  setUsersCollection,
  setQrCollection, // ⚠ Export setter
};
