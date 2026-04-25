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
} from "./models.js";

dotenv.config();

const ALLOWED_EMAIL = "edirnesydv@gmail.com";
const MONGODB_URI = process.env.MONGODB_URI?.trim();
const IV_LENGTH = 16;
const ENCRYPTION_KEY_RAW = (process.env.ENCRYPTION_KEY || "vefa-sydv-secure-encryption-key-2026-64-chars-long-string-needed-32chars").trim();

function getEncryptionKey() {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW).digest();
}

function encrypt(text: string | undefined): string | undefined {
  if (!text || typeof text !== 'string') return text;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let encrypted = cipher.update(text, 'utf8');
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
    
    if (!ivHex || !encryptedHex || ivHex.length !== (IV_LENGTH * 2)) {
      return text;
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    // If decryption fails, return original text to avoid losing data
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
      console.error("Previous mongoPromise failed, retrying...");
      mongoPromise = null; 
    }
  }
  
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is MISSING!");
    throw new Error("Veritabanı bağlantı adresi (MONGODB_URI) eksik.");
  }

  console.log("Connecting to MongoDB Atlas... URI length:", MONGODB_URI.length);
  mongoose.set('bufferCommands', false);
  mongoPromise = mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    maxPoolSize: 50,
  });

  try {
    const conn = await mongoPromise;
    console.log("✅ MongoDB Connection Established:", conn.connection.name);
    
    // Ensure all models are initialized and indexes are created
    // This is important for unique constraints
    await Promise.all(Object.values(mongoose.models).map(m => m.init().catch(e => console.warn(`Model ${m.modelName} init error:`, e))));
    
    return conn;
  } catch (err: any) {
    mongoPromise = null;
    console.error("❌ MongoDB Connection Error Details:", {
      name: err.name,
      message: err.message,
      code: err.code
    });
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
    try {
      const result = { ...data };
      delete result.id;
      // Sanitize undefined
      Object.keys(result).forEach(key => {
        if (result[key] === undefined) delete result[key];
      });
      encryptedFields.forEach(field => {
        if (result[field]) {
          try {
            result[field] = encrypt(String(result[field]));
          } catch (e) {
            console.error(`Field encryption error [${field}]:`, e);
          }
        }
      });
      return result;
    } catch (e: any) {
      console.error(`prepareForDB error:`, e);
      throw new Error(`Veri hazırlama hatası: ${e.message}`);
    }
  };

  const prepareFromDB = (data: any) => {
    try {
      if (!data) return data;
      const result = data.toObject ? data.toObject() : { ...data };
      
      // Ensure ID is present
      result.id = result._id?.toString() || result.id;
      delete result._id;
      delete result.__v;

      // Decrypt requested fields
      encryptedFields.forEach(field => {
        if (result[field]) {
          try {
            result[field] = decrypt(String(result[field]));
          } catch (e) {
            console.error(`Field decryption error [${field}]:`, e);
          }
        }
      });
      return result;
    } catch (e: any) {
      console.error(`prepareFromDB error:`, e);
      return data;
    }
  };

  router.get("/", async (req, res) => {
    try {
      await connectDB();
      let query = {};
      
      const userRole = req.headers['x-user-role'];
      const userId = req.headers['x-user-id'];

      // Specialized logic for AuditLogs
      if (name === 'auditlog') {
        if (userRole !== 'superadmin' && userRole !== 'admin') {
          query = { userId };
        }
      }

      // Projection for security: If not an admin, only return non-sensitive fields for the users collection
      // This allows the login screen to list users without exposing PII (TC, Phone, etc.)
      let projection = {};
      if (name === 'user' && (!userRole || (userRole !== 'admin' && userRole !== 'superadmin'))) {
        // Return only what's needed for login screen and select list
        projection = { 
          name: 1, 
          surname: 1, 
          role: 1, 
          isApproved: 1, 
          isSuperAdmin: 1, 
          passwordHash: 1, // Needed for client side check in select list mode
          email: 1 
        };
      }

      const items = await model.find(query, projection).lean().exec();
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

      // Specialized logic for Users
      if (name === 'user') {
        const userCount = await model.countDocuments();
        if (userCount === 0) {
          data.isApproved = true;
          data.isSuperAdmin = true;
          data.role = 'superadmin';
        } else {
          data.isApproved = false;
          data.isSuperAdmin = false;
        }
      }

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

  router.put("/bulk-update", async (req, res) => {
    try {
      await connectDB();
      const updates = req.body;
      if (Array.isArray(updates)) {
        // Run updates in parallel
        await Promise.all(
          updates.map((update: any) => {
            const data = prepareForDB(update.changes);
            return model.findByIdAndUpdate(update.id, data);
          })
        );
      }
      res.json({ success: true, count: updates?.length || 0 });
    } catch (err: any) {
      console.error(`[PUT /api/${name}/bulk-update] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/bulk", async (req, res) => {
    try {
      await connectDB();
      const { ids } = req.body;
      if (Array.isArray(ids) && ids.length > 0) {
        await model.deleteMany({ _id: { $in: ids } });
      }
      res.json({ success: true, count: ids?.length || 0 });
    } catch (err: any) {
      console.error(`[DELETE /api/${name}/bulk] Error:`, err);
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
app.use("/api/applicants", createCrudRoutes(ApplicantModel, 'applicant', ['name', 'surname', 'tcNo', 'phone', 'address', 'haneNo']));
app.use("/api/staff", createCrudRoutes(StaffModel, 'staff', ['name', 'surname', 'phone', 'tcNo', 'password']));
app.use("/api/workdays", createCrudRoutes(WorkDayModel, 'workday'));
app.use("/api/schedules", createCrudRoutes(ScheduleModel, 'schedule'));
app.use("/api/programs", createCrudRoutes(ProgramModel, 'program'));
app.use("/api/auditlogs", createCrudRoutes(AuditLogModel, 'auditlog'));
app.use("/api/admins", createCrudRoutes(AdminModel, 'admin'));
app.use("/api/users", createCrudRoutes(UserModel, 'user', ['name', 'surname', 'tcNo', 'phone', 'password', 'passwordHash', 'email']));

// Reset Mock Data Route
app.post("/api/admin/reset-mock-data", async (req, res) => {
  const userRole = req.headers['x-user-role'];
  if (userRole !== 'superadmin') {
    return res.status(403).json({ error: "Sadece Süper Admin bu işlemi yapabilir." });
  }

  try {
    await connectDB();
    
    // Clear existing data
    await ApplicantModel.deleteMany({});
    await StaffModel.deleteMany({});
    await ScheduleModel.deleteMany({});
    await WorkDayModel.deleteMany({});
    await ProgramModel.deleteMany({});

    const neighborhoods = [
      "1. Murat", "Abdurrahman", "Atatürk", "Babademirtaş", "Barutluk", "Çavuşbey", 
      "Cumhuriyet", "Dilaverbey", "Fatih", "İstasyon", "Karaağaç", "Kocasinan", 
      "Kurtuluş", "Medrese Alibey", "Menzilahir", "Meydan", "Mithatpaşa", "Nişancıpaşa"
    ];

    const surnames = ["Yılmaz", "Kaya", "Demir", "Çelik", "Yıldız", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Çetin", "Öztürk", "Aksoy", "Yavuz", "Erdem"];
    const maleNames = ["Gökhan", "Ahmet", "Mehmet", "Mustafa", "Ali", "Murat", "Hüseyin", "İbrahim", "Ömer", "Can", "Deniz", "Eren", "Emre", "Serkan", "Hakan"];
    const femaleNames = ["Fatma", "Ayşe", "Emine", "Hatice", "Zeynep", "Elif", "Merve", "Selin", "Gizem", "Derya", "Sultan", "Melek", "Pınar", "Özlem", "Arzu"];

    console.log('Generating 100 realistic households...');
    const applicants = [];
    for (let i = 1; i <= 100; i++) {
      const isMale = Math.random() > 0.5;
      const name = isMale ? maleNames[Math.floor(Math.random() * maleNames.length)] : femaleNames[Math.floor(Math.random() * femaleNames.length)];
      const surname = surnames[Math.floor(Math.random() * surnames.length)];
      const neighborhood = neighborhoods[i % neighborhoods.length];
      const tcNo = (10000000000 + Math.floor(Math.random() * 89999999999)).toString();

      applicants.push({
        name,
        surname,
        tcNo: encrypt(tcNo),
        phone: encrypt("05" + (Math.floor(Math.random() * 900000000) + 100000000).toString()),
        address: encrypt(`${neighborhood} Mahallesi, No: ${Math.floor(Math.random() * 100) + 1}, Edirne`),
        neighborhood,
        haneNo: encrypt(`HANE-${2000 + i}`),
        householdSize: Math.floor(Math.random() * 5) + 1,
        priority: i,
        lat: 41.675 + (Math.random() - 0.5) * 0.02,
        lng: 26.570 + (Math.random() - 0.5) * 0.02,
      });
    }
    await ApplicantModel.insertMany(applicants);

    console.log('Generating 6 realistic staff members...');
    const staffNames = [
      { n: "Ali", s: "Vefa" }, { n: "Ayşe", s: "Yardım" }, { n: "Mehmet", s: "Hizmet" },
      { n: "Fatma", s: "Saha" }, { n: "Can", s: "Destek" }, { n: "Elif", s: "Ekip" }
    ];
    const staffList = [];
    for (let i = 0; i < 6; i++) {
      staffList.push({
        name: staffNames[i].n,
        surname: staffNames[i].s,
        phone: encrypt("05" + (Math.floor(Math.random() * 900000000) + 100000000).toString()),
        role: i % 2 === 0 ? 'Teknik Personel' : 'Temizlik Personeli',
        tcNo: encrypt((20000000000 + Math.floor(Math.random() * 79999999999)).toString()),
        password: encrypt('123456'),
        isActive: true
      });
    }
    const createdStaff = await StaffModel.insertMany(staffList);
    
    // Partner up
    await (StaffModel as any).findByIdAndUpdate(createdStaff[0]._id, { partnerId: createdStaff[1]._id.toString() });
    await (StaffModel as any).findByIdAndUpdate(createdStaff[1]._id, { partnerId: createdStaff[0]._id.toString() });
    await (StaffModel as any).findByIdAndUpdate(createdStaff[2]._id, { partnerId: createdStaff[3]._id.toString() });
    await (StaffModel as any).findByIdAndUpdate(createdStaff[3]._id, { partnerId: createdStaff[2]._id.toString() });
    await (StaffModel as any).findByIdAndUpdate(createdStaff[4]._id, { partnerId: createdStaff[5]._id.toString() });
    await (StaffModel as any).findByIdAndUpdate(createdStaff[5]._id, { partnerId: createdStaff[4]._id.toString() });

    res.json({ success: true, message: "Veriler başarıyla sıfırlandı ve gerçekçi mock data ile dolduruldu." });
  } catch (err: any) {
    console.error("Reset error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ... (Rest of OAuth and setupVite remains similar)

// Health check
app.get(["/api/health", "/health", "/api/ping"], (req, res) => {
  res.json({ 
    status: "ok", 
    env: process.env.NODE_ENV,
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    time: new Date().toISOString()
  });
});

// Direct DB Test Route
app.get("/api/test-db-connection", async (req, res) => {
  try {
    console.log("Manual DB connection test started...");
    if (!MONGODB_URI) throw new Error("MONGODB_URI is missing");
    
    // Attempt a brand new connection for testing
    const testConn = await mongoose.createConnection(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    }).asPromise();
    
    const collections = await testConn.db.listCollections().toArray();
    await testConn.close();
    
    res.json({ 
      success: true, 
      message: "Connection successful", 
      collections: collections.map(c => c.name) 
    });
  } catch (err: any) {
    console.error("Manual DB connection test failed:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message, 
      name: err.name,
      code: err.code,
      stack: err.stack
    });
  }
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
