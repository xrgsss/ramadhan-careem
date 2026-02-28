import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "registrations.db");

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.local"), override: true });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = "ramadhancareem@gmail.com";
const MAX_TRANSFER_PROOF_DATA_LENGTH = 8 * 1024 * 1024;
const ALLOWED_VEHICLE_TYPES = new Set(["mobil", "motor", "non_kendaraan"]);
const VEHICLE_LIMITS = {
  mobil: 30,
  motor: 20,
} as const;

function initializeDatabase(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      user_id TEXT,
      phone TEXT,
      organization TEXT,
      role TEXT,
      interest TEXT,
      vehicle_type TEXT,
      transfer_proof TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const tableInfo = database
    .prepare("PRAGMA table_info(submissions)")
    .all() as Array<{ name: string }>;
  const hasTransferProofColumn = tableInfo.some((column) => column.name === "transfer_proof");
  const hasVehicleTypeColumn = tableInfo.some((column) => column.name === "vehicle_type");
  const hasUserIdColumn = tableInfo.some((column) => column.name === "user_id");

  if (!hasTransferProofColumn) {
    database.exec("ALTER TABLE submissions ADD COLUMN transfer_proof TEXT");
  }

  if (!hasVehicleTypeColumn) {
    database.exec("ALTER TABLE submissions ADD COLUMN vehicle_type TEXT");
  }

  if (!hasUserIdColumn) {
    database.exec("ALTER TABLE submissions ADD COLUMN user_id TEXT");
  }
}

function createDatabase(dbPath: string) {
  const database = new Database(dbPath);
  initializeDatabase(database);
  return database;
}

function ensureValidDatabaseFile(dbPath: string): string {
  if (!fs.existsSync(dbPath)) {
    return dbPath;
  }

  const header = Buffer.alloc(16);
  const fd = fs.openSync(dbPath, "r");
  let bytesRead = 0;
  try {
    bytesRead = fs.readSync(fd, header, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }

  const sqliteHeader = "SQLite format 3\u0000";
  const isSQLite = bytesRead === 16 && header.toString("utf8", 0, 16) === sqliteHeader;
  if (isSQLite) {
    return dbPath;
  }

  const backupPath = `${dbPath}.corrupt-${Date.now()}.bak`;
  try {
    fs.renameSync(dbPath, backupPath);
    console.warn(`Invalid database file moved to: ${backupPath}`);
    return dbPath;
  } catch (error) {
    const fallbackPath = `${dbPath}.recovered-${Date.now()}`;
    console.warn(`Could not move invalid DB file (${String(error)}). Using fallback DB: ${fallbackPath}`);
    return fallbackPath;
  }
}

const db = createDatabase(ensureValidDatabaseFile(DB_PATH));

function getVehicleCount(vehicleType: keyof typeof VEHICLE_LIMITS) {
  const row = db
    .prepare("SELECT COUNT(*) as total FROM submissions WHERE vehicle_type = ?")
    .get(vehicleType) as { total?: number } | undefined;

  return row?.total ?? 0;
}

function getVehicleAvailability() {
  const mobilUsed = getVehicleCount("mobil");
  const motorUsed = getVehicleCount("motor");
  const mobilLimit = VEHICLE_LIMITS.mobil;
  const motorLimit = VEHICLE_LIMITS.motor;

  return {
    mobil: {
      limit: mobilLimit,
      used: mobilUsed,
      remaining: Math.max(0, mobilLimit - mobilUsed),
      isFull: mobilUsed >= mobilLimit,
    },
    motor: {
      limit: motorLimit,
      used: motorUsed,
      remaining: Math.max(0, motorLimit - motorUsed),
      isFull: motorUsed >= motorLimit,
    },
    non_kendaraan: {
      isFull: false,
    },
  };
}

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.warn(
    "Supabase auth env vars are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY.",
  );
}

function extractTokenFromHeader(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

type SupabaseUser = {
  id?: string | null;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

async function getSupabaseUser(token: string): Promise<SupabaseUser | null> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    });

    if (!response.ok) {
      return null;
    }

    const user = (await response.json()) as SupabaseUser;
    return user;
  } catch (error) {
    console.error("Supabase user lookup failed:", error);
    return null;
  }
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractTokenFromHeader(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await getSupabaseUser(token);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.locals.authUser = user;
  next();
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authUser = res.locals.authUser as SupabaseUser | undefined;
  if (!authUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const email = typeof authUser.email === "string" ? authUser.email.toLowerCase() : "";
  if (email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Serve hero media from public to match Vite asset handling.
  app.use("/hero", express.static(path.join(__dirname, "public", "hero")));

  // API Routes
  app.get("/api/me", requireAuth, (req, res) => {
    const authUser = res.locals.authUser as SupabaseUser | undefined;
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userMetadata = authUser.user_metadata ?? {};
    const fullName =
      typeof userMetadata.full_name === "string"
        ? userMetadata.full_name
        : typeof userMetadata.name === "string"
          ? userMetadata.name
          : null;

    res.json({
      id: authUser.id ?? null,
      email: authUser.email ?? null,
      full_name: fullName,
      created_at: authUser.created_at ?? null,
      last_sign_in_at: authUser.last_sign_in_at ?? null,
    });
  });

  app.get("/api/my-submissions", requireAuth, (req, res) => {
    const authUser = res.locals.authUser as SupabaseUser | undefined;
    const authUserId = typeof authUser?.id === "string" ? authUser.id : "";
    const authUserEmail = typeof authUser?.email === "string" ? authUser.email : "";

    if (!authUserId && !authUserEmail) {
      return res.status(400).json({ error: "User profile is incomplete" });
    }

    try {
      const submissions = db
        .prepare(
          `SELECT * FROM submissions
           WHERE user_id = ?
              OR (user_id IS NULL AND lower(email) = lower(?))
           ORDER BY created_at DESC`,
        )
        .all(authUserId, authUserEmail);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user submissions" });
    }
  });

  app.get("/api/vehicle-availability", requireAuth, (req, res) => {
    try {
      res.json(getVehicleAvailability());
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vehicle availability" });
    }
  });

  app.post("/api/submit", requireAuth, (req, res) => {
    const authUser = res.locals.authUser as SupabaseUser | undefined;
    const authUserId = typeof authUser?.id === "string" ? authUser.id : "";
    const authUserEmail = typeof authUser?.email === "string" ? authUser.email : "";
    const { name, phone, organization, role, vehicleType, transferProof } = req.body;

    if (!authUserId || !authUserEmail) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!name || !phone || !vehicleType || !transferProof) {
      return res
        .status(400)
        .json({ error: "Name, phone, vehicle type, and transfer proof are required" });
    }

    if (typeof phone !== "string" || phone.trim().length < 10) {
      return res.status(400).json({ error: "Nomor WhatsApp minimal 10 digit" });
    }

    if (typeof vehicleType !== "string" || !ALLOWED_VEHICLE_TYPES.has(vehicleType)) {
      return res.status(400).json({ error: "Invalid vehicle type" });
    }

    if (vehicleType === "mobil" || vehicleType === "motor") {
      const currentCount = getVehicleCount(vehicleType);
      const limit = VEHICLE_LIMITS[vehicleType];
      if (currentCount >= limit) {
        return res.status(409).json({
          error: `Kuota ${vehicleType} sudah penuh`,
          vehicleType,
        });
      }
    }

    if (typeof transferProof !== "string" || !transferProof.startsWith("data:image/")) {
      return res.status(400).json({ error: "Invalid transfer proof format" });
    }

    if (transferProof.length > MAX_TRANSFER_PROOF_DATA_LENGTH) {
      return res.status(413).json({ error: "Transfer proof image is too large" });
    }

    try {
      const stmt = db.prepare(`
        INSERT INTO submissions (name, email, user_id, phone, organization, role, vehicle_type, transfer_proof)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(name, authUserEmail, authUserId, phone, organization, role, vehicleType, transferProof);
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ error: "Failed to save submission" });
    }
  });

  app.get("/api/submissions", requireAuth, requireAdmin, (req, res) => {
    try {
      const submissions = db.prepare("SELECT * FROM submissions ORDER BY created_at DESC").all();
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  });

  app.delete("/api/submissions/:id", requireAuth, requireAdmin, (req, res) => {
    const submissionId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(submissionId) || submissionId <= 0) {
      return res.status(400).json({ error: "Invalid submission id" });
    }

    try {
      const result = db.prepare("DELETE FROM submissions WHERE id = ?").run(submissionId);
      if (result.changes === 0) {
        return res.status(404).json({ error: "Submission not found" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete submission" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
