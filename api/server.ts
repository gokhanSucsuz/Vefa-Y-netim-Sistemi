import express from "express";
import path from "path";
import fs from "fs";
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
const MONGODB_URI = process.env.MONGODB_URI?.trim();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "vefa-sydv-secure-encryption-key-2026-64-chars-long-string-needed"; 
// AES-256-CBC Encryption
const IV_LENGTH = 16;
function getEncryptionKey() {
  return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

function encrypt(text: string | undefined): string | undefined {
  if (!text || typeof text !== 'string') return text;
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
  if (!text || typeof text !== 'string' || !text.includes(':')) return text;
  try {
    const parts = text.split(':');
    const ivHex = parts.shift();
    const encryptedHex = parts.join(':');
    if (!ivHex || !encryptedHex) return text;
    
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
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
let mongoPromise: Promise<typeof mongoose> | null = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose;
  
  if (mongoPromise) {
    try {
      return await mongoPromise;
    } catch (e) {
      console.error("Existing mongoPromise failed, retrying...", e);
      mongoPromise = null; 
    }
  }
  
  if (!MONGODB_URI) {
    console.error("CRITICAL: MONGODB_URI is missing or empty!");
    throw new Error("Veritabanı bağlantı adresi (MONGODB_URI) eksik.");
  }

  console.log("Connecting to MongoDB Atlas (Serverless Mode)...");
  mongoPromise = mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    bufferCommands: false,
  });

  try {
    const conn = await mongoPromise;
    console.log("✅ MongoDB Connection Successful:", conn.connection.name);
    return conn;
  } catch (err: any) {
    mongoPromise = null;
    console.error("❌ MongoDB Connection Error:", err.message);
    throw err;
  }
}

// Database Status
app.get("/api/db-status", async (req, res) => {
  const status = {
    connected: mongoose.connection.readyState === 1,
    dbName: mongoose.connection.name,
    collections: [],
    mongoUriSet: !!MONGODB_URI
  };
  if (status.connected) {
    try {
      const cols = await mongoose.connection.db.listCollections().toArray();
      status.collections = cols.map(c => c.name) as any;
    } catch (e) {}
  }
  res.json(status);
});

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
    delete result.id;
    // Sanitize undefined
    Object.keys(result).forEach(key => {
      if (result[key] === undefined) delete result[key];
    });
    encryptedFields.forEach(field => {
      if (result[field]) result[field] = encrypt(result[field]);
    });
    return result;
  };

  const prepareFromDB = (data: any) => {
    if (!data) return data;
    const result = data.toObject ? data.toObject() : { ...data };
    result.id = result._id ? result._id.toString() : result.id;
    delete result._id;
    delete result.__v;
    encryptedFields.forEach(field => {
      if (result[field]) result[field] = decrypt(result[field]);
    });
    return result;
  };

  router.get("/", async (req, res) => {
    try {
      await connectDB();
      const items = await model.find().lean().exec();
      res.json(items.map((item: any) => prepareFromDB(item)));
    } catch (err: any) {
      console.error(`[GET /api/${name}] API Error:`, err);
      if (err.stack) console.error(err.stack);
      res.status(500).json({ 
        error: "Veri çekme hatası", 
        message: err.message,
        path: `/api/${name}`,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
  });

  router.post("/", async (req, res) => {
    try {
      await connectDB();
      console.log(`[POST /api/${name}] Incoming data:`, req.body);
      const data = prepareForDB(req.body);
      const item = new model(data);
      await item.save();
      console.log(`[POST /api/${name}] Saved successfully`);
      res.json(prepareFromDB(item));
    } catch (err: any) {
      console.error(`[POST /api/${name}] API Error:`, err);
      if (err.stack) console.error(err.stack);
      res.status(500).json({ 
        error: "Kayıt hatası", 
        message: err.message,
        path: `/api/${name}`,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      await connectDB();
      const data = prepareForDB(req.body);
      const item = await model.findByIdAndUpdate(req.params.id, data, { new: true });
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json(prepareFromDB(item));
    } catch (err: any) {
      console.error(`[PUT /api/${name}] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await connectDB();
      await model.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[DELETE /api/${name}] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk operations
  router.post("/bulk", async (req, res) => {
    try {
      await connectDB();
      const items = (Array.isArray(req.body) ? req.body : []).map(prepareForDB);
      if (items.length > 0) {
        await model.insertMany(items);
      }
      res.json({ success: true, count: items.length });
    } catch (err: any) {
      console.error(`[POST /api/${name}/bulk] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/", async (req, res) => {
    try {
      await connectDB();
      await model.deleteMany({});
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[DELETE ALL /api/${name}] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

// API Routes
app.use("/api/applicants", createCrudRoutes(ApplicantModel, 'applicant', ['name', 'surname', 'fullName', 'tcNo', 'phone', 'address', 'haneNo']));
app.use("/api/staff", createCrudRoutes(StaffModel, 'staff', ['name', 'surname', 'fullName', 'phone', 'tcNo', 'password']));
app.use("/api/workdays", createCrudRoutes(WorkDayModel, 'workday'));
app.use("/api/schedules", createCrudRoutes(ScheduleModel, 'schedule'));
app.use("/api/programs", createCrudRoutes(ProgramModel, 'program'));
app.use("/api/auditlogs", createCrudRoutes(AuditLogModel, 'auditlog'));
app.use("/api/admins", createCrudRoutes(AdminModel, 'admin'));
app.use("/api/users", createCrudRoutes(UserModel, 'user', ['name', 'surname', 'fullName', 'tcNo', 'phone', 'password', 'email']));

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

// Final catch-all for API errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ 
    error: "Sunucu hatası oluştu", 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
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
    // In production (Vercel), we serve static files from dist
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }
}

// Start server or handle Vercel deployment
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  setupVite().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
} else {
  // On Vercel, we don't call app.listen, we just export it.
  // We still need to run setupVite for static file serving, 
  // but Vercel handles the listener.
  setupVite();
}

export default app;
