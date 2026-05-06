import { migrateFromSync } from "../lib/storage.js";

migrateFromSync().catch(err => console.warn("[options] migration:", err.message));
