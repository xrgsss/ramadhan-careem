import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "registrations.db");

function initializeDatabase(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      organization TEXT,
      role TEXT,
      interest TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Serve hero media from public to match Vite asset handling.
  app.use("/hero", express.static(path.join(__dirname, "public", "hero")));

  // API Routes
  app.post("/api/submit", (req, res) => {
    const { name, email, phone, organization, role, interest } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    try {
      const stmt = db.prepare(`
        INSERT INTO submissions (name, email, phone, organization, role, interest)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(name, email, phone, organization, role, interest);
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ error: "Failed to save submission" });
    }
  });

  app.get("/api/submissions", (req, res) => {
    try {
      const submissions = db.prepare("SELECT * FROM submissions ORDER BY created_at DESC").all();
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch submissions" });
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
