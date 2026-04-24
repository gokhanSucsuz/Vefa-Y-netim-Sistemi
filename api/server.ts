import express from "express";
import path from "path";
import fetch from "node-fetch";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import { OAuth2Client } from "google-auth-library";
import mongoose from "mongoose";
import crypto from "crypto";
import cors from "cors";
import dotenv from "dotenv";
import { 
  ApplicantModel, 
  StaffModel, 
  WorkDayModel, 
  ScheduleModel, 
  ProgramModel, 
  AuditLogModel, 
  AdminModel,
  UserModel
} from "./models";

dotenv.config();

const ALLOWED_EMAIL = "edirnesydv@gmail.com";
const MONGODB_URI = process.env.MONGODB_URI;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "vefa-sydv-secure-encryption-key-2026-64-chars-long-string-needed"; 
// Note: Key should be 32 bytes for aes-256. If not, we'll hash it.
const IV_LENGTH = 16;

function getEncryptionKey() {
  return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

function encrypt(text: string | undefined): string | undefined {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (e) {
    console.error("Encryption error:", e);
    return text;
  }
}

function decrypt(text: string | undefined): string | undefined {
  if (!text || !text.includes(':')) return text;
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    console.error("Decryption error:", e);
    return text;
  }
}

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || "edirne-sydv-secret"));

// MongoDB Connection
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));
} else {
  console.warn("WARNING: MONGODB_URI is missing. Database operations will fail.");
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// ... (OAuth2Client preparation remains similar)
const getAppUrl = () => {
  let url = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
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

// Generic CRUD helper
const createCrudRoutes = (model: any, name: string, encryptedFields: string[] = []) => {
  const router = express.Router();

  const prepareForDB = (data: any) => {
    const result = { ...data };
    encryptedFields.forEach(field => {
      if (result[field]) result[field] = encrypt(result[field]);
    });
    return result;
  };

  const prepareFromDB = (data: any) => {
    if (!data) return data;
    const result = data.toObject ? data.toObject() : { ...data };
    result.id = result._id.toString();
    delete result._id;
    delete result.__v;
    encryptedFields.forEach(field => {
      if (result[field]) result[field] = decrypt(result[field]);
    });
    return result;
  };

  router.get("/", async (req, res) => {
    try {
      const items = await model.find();
      res.json(items.map(prepareFromDB));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const data = prepareForDB(req.body);
      const item = new model(data);
      await item.save();
      res.json(prepareFromDB(item));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const data = prepareForDB(req.body);
      const item = await model.findByIdAndUpdate(req.params.id, data, { new: true });
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json(prepareFromDB(item));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await model.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk operations
  router.post("/bulk", async (req, res) => {
    try {
      const items = req.body.map(prepareForDB);
      await model.insertMany(items);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/", async (req, res) => {
    try {
      await model.deleteMany({});
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

// API Routes
app.use("/api/applicants", createCrudRoutes(ApplicantModel, 'applicant', ['tcNo', 'phone', 'address', 'haneNo']));
app.use("/api/staff", createCrudRoutes(StaffModel, 'staff', ['phone', 'tcNo', 'password']));
app.use("/api/workdays", createCrudRoutes(WorkDayModel, 'workday'));
app.use("/api/schedules", createCrudRoutes(ScheduleModel, 'schedule'));
app.use("/api/programs", createCrudRoutes(ProgramModel, 'program'));
app.use("/api/auditlogs", createCrudRoutes(AuditLogModel, 'auditlog'));
app.use("/api/admins", createCrudRoutes(AdminModel, 'admin'));
app.use("/api/users", createCrudRoutes(UserModel, 'user', ['tcNo']));

// ... (Rest of OAuth and setupVite remains similar)

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
