import express from "express";
import path from "path";
import fetch from "node-fetch";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import { OAuth2Client } from "google-auth-library";

const ALLOWED_EMAIL = "edirnesydv@gmail.com";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || "edirne-sydv-secret"));

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn("WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing. OAuth features will not work.");
}

const getAppUrl = () => {
  let url = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  // Remove trailing slash if exists
  return url.replace(/\/$/, "");
};

const getOAuth2Client = (req?: express.Request) => {
  let redirectUri = "";
  if (req) {
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host;
    redirectUri = `${protocol}://${host}/auth/callback`;
  } else {
    redirectUri = `${getAppUrl()}/auth/callback`;
  }

  return new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

// Health check
app.get(["/api/health", "/health"], (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV });
});

// Auth URL
app.get(["/api/auth/url", "/auth/url"], (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(401).json({ 
        error: "Google OAuth yapılandırılmamış.", 
        details: "Lütfen Vercel panelinden GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET değişkenlerini ayarlayın." 
      });
    }
    const client = getOAuth2Client(req);
    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/drive.file",
      ],
      prompt: "consent",
    });
    res.json({ url });
  } catch (error: any) {
    console.error("Auth URL error:", error);
    res.status(500).json({ error: "Auth URL oluşturulamadı.", details: error.message });
  }
});

// OAuth Callback
app.get(["/api/auth/callback", "/auth/callback"], async (req, res) => {
  const { code } = req.query;
  try {
    const client = getOAuth2Client(req);
    const { tokens } = await client.getToken(code as string);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const userInfo = await oauth2.userinfo.get();

    if (userInfo.data.email !== ALLOWED_EMAIL) {
      return res.status(403).send(`
        <html>
          <body>
            <script>
              alert("Bu uygulamaya sadece ${ALLOWED_EMAIL} hesabı giriş yapabilir.");
              window.close();
            </script>
          </body>
        </html>
      `);
    }

    // Store tokens in a secure cookie
    res.cookie("google_tokens", JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', email: '${userInfo.data.email}' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Giriş başarılı. Bu pencere otomatik olarak kapanacaktır.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).send("Giriş sırasında bir hata oluştu.");
  }
});

// Check Auth Status
app.get(["/api/auth/status", "/auth/status"], async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.json({ authenticated: false });

  try {
    const tokens = JSON.parse(tokensStr);
    const client = getOAuth2Client(req);
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const userInfo = await oauth2.userinfo.get();
    res.json({ authenticated: true, email: userInfo.data.email });
  } catch (error) {
    res.json({ authenticated: false });
  }
});

// Logout
app.post(["/api/auth/logout", "/auth/logout"], (req, res) => {
  res.clearCookie("google_tokens");
  res.json({ success: true });
});

// Drive Backup
app.post(["/api/drive/backup", "/drive/backup"], async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });

  try {
    const tokens = JSON.parse(tokensStr);
    const client = getOAuth2Client(req);
    client.setCredentials(tokens);
    const drive = google.drive({ version: "v3", auth: client });

    const { data, filename } = req.body;

    // Check if file already exists
    const listRes = await drive.files.list({
      q: `name = '${filename}' and trashed = false`,
      fields: "files(id, name)",
    });

    const fileMetadata = {
      name: filename,
      mimeType: "application/json",
    };

    const media = {
      mimeType: "application/json",
      body: JSON.stringify(data),
    };

    if (listRes.data.files && listRes.data.files.length > 0) {
      // Update existing file
      const fileId = listRes.data.files[0].id!;
      await drive.files.update({
        fileId: fileId,
        media: media,
      });
      res.json({ success: true, message: "Yedek güncellendi." });
    } else {
      // Create new file
      await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: "id",
      });
      res.json({ success: true, message: "Yeni yedek oluşturuldu." });
    }
  } catch (error) {
    console.error("Drive backup error:", error);
    res.status(500).json({ error: "Yedekleme sırasında bir hata oluştu." });
  }
});

// Drive Restore
app.get(["/api/drive/restore", "/drive/restore"], async (req, res) => {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) return res.status(401).json({ error: "Unauthorized" });

  try {
    const tokens = JSON.parse(tokensStr);
    const client = getOAuth2Client(req);
    client.setCredentials(tokens);
    const drive = google.drive({ version: "v3", auth: client });

    const { filename } = req.query;

    const listRes = await drive.files.list({
      q: `name = '${filename}' and trashed = false`,
      fields: "files(id, name)",
    });

    if (!listRes.data.files || listRes.data.files.length === 0) {
      return res.status(404).json({ error: "Yedek dosyası bulunamadı." });
    }

    const fileId = listRes.data.files[0].id!;
    const fileRes = await drive.files.get({
      fileId: fileId,
      alt: "media",
    });

    res.json(fileRes.data);
  } catch (error) {
    console.error("Drive restore error:", error);
    res.status(500).json({ error: "Geri yükleme sırasında bir hata oluştu." });
  }
});

// Geocoding Proxy to avoid CORS and manage rate limiting
app.get(["/api/geocode", "/geocode"], async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query is required" });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q as string)}&limit=1`, {
      headers: {
        'Accept-Language': 'tr',
        'User-Agent': 'EdirneSYDV-Vefa-App-Server'
      }
    });

    if (response.status === 429) {
      return res.status(429).json({ error: "Too many requests to geocoding service" });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Geocoding proxy error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (error) {
      console.error("Vite setup error:", error);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

setupVite().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});

export default app;
