module.exports = function subscription(requiredPlan = "premium") {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    // Fetch the latest subscription from DB
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (requiredPlan === "premium" && user.subscription !== "premium") {
      return res.status(403).json({ error: "This feature requires a premium subscription" });
    }

    req.user = user; // attach latest user info
    next();
  };
};
