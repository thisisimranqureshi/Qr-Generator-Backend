
const express = require("express");
const router = express.Router();

let qrCollection;

// Inject collection from index.js
const setQrCollection = (collection) => {
    qrCollection = collection;
};
router.get("/:id", async (req, res) => {
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

        // URL / WhatsApp / FB / YT / IG / IMAGE
        // EMAIL QR
if (qr.type === "email") {
  // qr.content can be a string like "user@example.com" or an object with .email
  const emailAddress = qr.content?.email || qr.content;

  if (!emailAddress) return res.status(400).send("Invalid QR content");

  const mailtoLink = `mailto:${emailAddress}`;
  return res.redirect(mailtoLink);
}

if (
  ["url", "whatsapp", "facebook", "youtube", "instagram", "image"].includes(qr.type)
) {
  let redirectUrl = "";

  switch (qr.type) {
    case "url":
    case "image":
      redirectUrl = qr.content?.url || qr.content;
      break;

    case "facebook":
      redirectUrl = qr.content?.url || (qr.content?.url?.startsWith("http") ? qr.content.url : "https://facebook.com/" + qr.content.url);
      break;

    case "youtube":
      redirectUrl = qr.content?.url || (qr.content?.url?.startsWith("http") ? qr.content.url : "https://youtube.com/" + qr.content.url);
      break;

    case "instagram":
      redirectUrl = qr.content?.url || (qr.content?.url?.startsWith("http") ? qr.content.url : "https://instagram.com/" + qr.content.url);
      break;

 case "whatsapp":
  if (qr.content && qr.content.phone) {
    redirectUrl = `https://wa.me/${qr.content.phone}?text=${encodeURIComponent(qr.content.message || "")}`;
  }
  break;


  }

  if (!redirectUrl) return res.status(400).send("Invalid QR content");

  return res.redirect(redirectUrl);
}


        // Text QR
        if (qr.type === "text") {
            return res.send(`
        <html>
          <body style="font-family:Arial;">
            <h2>QR Text</h2>
            <p>${qr.content?.text || qr.content}</p>
            <small>Scans: ${qr.scanCount}</small>
            <p>Remaining Scans: ${limit - qr.scanCount}</p>
          </body>
        </html>
      `);
        }

       // Custom QR
if (qr.type === "custom") {

  // Merge old + new users, filter empty
  const rawUsers = qr.content?.users || [];
  const users = rawUsers.filter(u =>
    (u.name && u.name.trim()) ||
    (u.email && u.email.trim()) ||
    (u.phone && u.phone.trim()) ||
    (Array.isArray(u.links) && u.links.filter(l => l.trim()).length)
  );

  const allLinks = users.flatMap(u =>
    Array.isArray(u.links) ? u.links.filter(l => l && l.trim()) : []
  );

  const companyInfo = qr.companyInfo || {};
  const companySocial = qr.companySocial || {};
  const oldUser = rawUsers[0] || {};
  const oldSocial = oldUser.social || qr.social || {};

  const formName = companyInfo.formName || oldUser.formName || qr.formName || "";
  const companyName = companyInfo.companyName || oldUser.companyName || qr.companyName || "";
  const companyPhone = companyInfo.companyPhone || oldUser.companyPhone || qr.companyPhone || "";

  const mergedSocial = {
    instagram: companySocial.instagram || oldSocial.instagram || "",
    facebook: companySocial.facebook || oldSocial.facebook || "",
    whatsapp: companySocial.whatsapp || oldSocial.whatsapp || "",
    snapchat: companySocial.snapchat || oldSocial.snapchat || "",
    twitter: companySocial.twitter || oldSocial.twitter || ""
  };

  const globalHeading = qr.globalHeading || "";
  const globalDescription = qr.globalDescription || "";

  // Prevent empty cards entirely
  const hasUserData = users.length > 0;
  const hasCompanyData = companyName || formName || Object.values(companyInfo).some(v => v) || Object.values(mergedSocial).some(v => v) || allLinks.length;

  if (!hasUserData && !hasCompanyData) {
    return res.send("<h2>No data available</h2>");
  }

  return res.send(`
    <html>
      <head>
        <title>Custom QR Info</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <style>
          body { font-family: Arial; background: #f5f5f5; padding: 20px; margin:0; }
          .user-card, .company-card { background: #fff; padding:15px; margin-bottom:15px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.1); }
          .Info-card{ background: #fff; padding:15px 15px 5px 15px; margin-bottom:15px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.1); }
          .company-card { border-left: 4px solid #2A43F8; }
          h1 { margin:0 0 10px 0; font-size:24px; color:#2A43F8; }
          h3 { margin-top:-10px; font-size:18px; }
          p { margin:5px 0; font-size:16px; color:#555; word-break: break-word; }
          a { color:#2A43F8; text-decoration:none; }
          a:hover { text-decoration:underline; }
          .social-links { display:flex; gap:15px; flex-wrap:wrap; margin-top:10px; }
          .social-links a img { width:36px; height:36px; }
          .fa-snapchat { color: #FFFC00; font-size: 36px; }
        </style>
      </head>
      <body>

        ${companyName || formName ? `
          <div class="Info-card">
            ${companyName ? `<h1>${companyName}</h1>` : ""}
            ${formName ? `<h3>${formName}</h3>` : ""}
          </div>
        ` : ""}

        ${hasUserData ? users.map(user => `
          <div class="user-card">
            ${user.name ? `<p><strong>👤 Name:</strong> ${user.name}</p>` : ""}
            ${user.email ? `<p><strong>📧 Email:</strong> <a href="mailto:${user.email}">${user.email}</a></p>` : ""}
            ${user.phone ? `<p><strong>📱 Phone:</strong> <a href="tel:${user.phone}">${user.phone}</a></p>` : ""}
          </div>
        `).join("") : ""}

        ${hasCompanyData ? `
          <div class="company-card">
            ${allLinks.length ? `<p><strong>🔗 Links:</strong></p>${allLinks.map(l => `<p><a href="${l}" target="_blank">${l}</a></p>`).join("")}` : ""}
            ${companyInfo.companyEmail ? `<p><strong>📧 Email:</strong> <a href="mailto:${companyInfo.companyEmail}">${companyInfo.companyEmail}</a></p>` : ""}
            ${companyInfo.companyPhone || companyPhone ? `<p><strong>📱 Phone:</strong> <a href="tel:${companyInfo.companyPhone || companyPhone}">${companyInfo.companyPhone || companyPhone}</a></p>` : ""}
            ${companyInfo.companyAddress ? `<p><strong>📍 Address:</strong> ${companyInfo.companyAddress}</p>` : ""}
            ${Object.values(mergedSocial).some(v => v) ? `
              <p><strong>Follow Us:</strong></p>
              <div class="social-links">
                ${mergedSocial.instagram ? `<a href="${mergedSocial.instagram.startsWith('http') ? mergedSocial.instagram : 'https://instagram.com/' + mergedSocial.instagram}" target="_blank"><img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png" alt="Instagram"></a>` : ""}
                ${mergedSocial.facebook ? `<a href="${mergedSocial.facebook.startsWith('http') ? mergedSocial.facebook : 'https://facebook.com/' + mergedSocial.facebook}" target="_blank"><img src="https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg" alt="Facebook"></a>` : ""}
                ${mergedSocial.whatsapp ? `<a href="${mergedSocial.whatsapp.startsWith('http') ? mergedSocial.whatsapp : 'https://wa.me/' + mergedSocial.whatsapp}" target="_blank"><img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp"></a>` : ""}
                ${mergedSocial.snapchat ? `<a href="${mergedSocial.snapchat.startsWith('http') ? mergedSocial.snapchat : 'https://snapchat.com/add/' + mergedSocial.snapchat}" target="_blank"><i class="fa-brands fa-snapchat" ></i></a>` : ""}
                ${mergedSocial.twitter ? `<a href="${mergedSocial.twitter.startsWith('http') ? mergedSocial.twitter : 'https://twitter.com/' + mergedSocial.twitter}" target="_blank"><img src="https://upload.wikimedia.org/wikipedia/commons/6/6f/Logo_of_Twitter.svg" alt="Twitter"></a>` : ""}
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
module.exports = {
    router,
    setQrCollection
};
