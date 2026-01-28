const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "your_jwt_secret";

// Reference to existing users collection
let usersCollection;

function setCollection(collection) {
  usersCollection = collection;
}
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Invalid token format" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // attach decoded token
    next();
  } catch (err) {
    console.error("JWT verification failed:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ---------------- SIGNUP ----------------
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "All fields required" });

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "User exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    await usersCollection.insertOne({
      name,
      email,
      password: hashedPassword,
      subscription: "free",
      role:"user",
      "totalQrs": 0,
      createdAt: new Date(),
    });

    res.json({ message: "User created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- LOGIN ----------------
// ---------------- LOGIN ----------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // 🔥 ADMIN CHECK
    let role = "user";
    if (email === "imran@gmail.com" && password === "123456") {
      role = "admin";
    }

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role,
        subscription: user.subscription
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

   res.json({
  message: "Login successful",
  token,
  user: {
    _id: user._id.toString(),        // MongoDB ID as string
    name: user.name,                 // User's name
    email: user.email,               // User's email
    subscription: user.subscription || "free",  // free or premium
    role: user.email === "imran@gmail.com" ? "admin" : "user" // admin detection
  },
});

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Return only needed fields
    res.json({
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      subscription: user.subscription || "free",
      scanLimit: user.scanLimit || 0,
      role: user.role || "user",
    });
  } catch (err) {
    console.error("Error in /api/me:", err);
    res.status(500).json({ error: "Server error" });
  }
});


module.exports = { router, setCollection };
