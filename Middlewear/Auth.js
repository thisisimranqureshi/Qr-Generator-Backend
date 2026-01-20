const jwt = require("jsonwebtoken");
const JWT_SECRET = "your_jwt_secret";

const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "No token provided" });

    const token = authHeader.split(" ")[1]; // Bearer <token>
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // now contains _id, email, subscription
    next();
  } catch (err) {
    console.error("JWT error:", err);
    res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = auth;

