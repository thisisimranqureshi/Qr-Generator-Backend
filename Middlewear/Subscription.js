module.exports = function subscription(requiredPlan = "premium") {
  return (req, res, next) => {
    const user = req.user; // must have auth middleware before this
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    if (requiredPlan === "premium" && user.subscription !== "premium") {
      return res.status(403).json({ error: "This feature requires a premium subscription" });
    }

    next();
  };
};
