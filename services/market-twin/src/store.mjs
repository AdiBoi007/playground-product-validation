import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { WorkerError } from "./security.mjs";

const validId = (value) =>
  typeof value === "string" && /^[\w-]{1,100}$/.test(value);
export class JobStore {
  constructor(env = process.env) {
    this.root = path.resolve(env.TWIN_DATA_DIR || ".data");
    this.pool = env.TWIN_DATABASE_URL
      ? new pg.Pool({
          connectionString: env.TWIN_DATABASE_URL,
          max: 4,
          ssl:
            env.TWIN_DATABASE_SSL === "true"
              ? { rejectUnauthorized: true }
              : undefined,
        })
      : null;
    this.locks = new Map();
  }
  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (this.pool) {
      await this.pool.query(
        "CREATE TABLE IF NOT EXISTS playground_twin_jobs (id text PRIMARY KEY, workspace_id text NOT NULL, status text NOT NULL, updated_at timestamptz NOT NULL, document jsonb NOT NULL)",
      );
      this.queueLease = await this.pool.connect();
      const lock = await this.queueLease.query(
        "SELECT pg_try_advisory_lock($1) AS acquired",
        [240918708],
      );
      if (!lock.rows[0]?.acquired) {
        this.queueLease.release();
        this.queueLease = null;
        throw new WorkerError(
          503,
          "Another worker already owns this queue. Run one queue owner per database.",
        );
      }
    }
  }
  async save(record) {
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO playground_twin_jobs(id,workspace_id,status,updated_at,document) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,document=EXCLUDED.document",
        [
          record.job.id,
          record.workspaceId,
          record.job.status,
          record.job.updatedAt,
          JSON.stringify(record),
        ],
      );
      return;
    }
    const target = path.join(this.root, `${record.job.id}.json`),
      tmp = `${target}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(record), { mode: 0o600 });
    await rename(tmp, target);
  }
  async get(id) {
    if (!validId(id)) throw new WorkerError(404, "Run not found.");
    if (this.pool)
      return (
        (
          await this.pool.query(
            "SELECT document FROM playground_twin_jobs WHERE id=$1",
            [id],
          )
        ).rows[0]?.document || null
      );
    try {
      return JSON.parse(
        await readFile(path.join(this.root, `${id}.json`), "utf8"),
      );
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  async list() {
    if (this.pool)
      return (
        await this.pool.query(
          "SELECT document FROM playground_twin_jobs ORDER BY updated_at DESC LIMIT 1000",
        )
      ).rows.map((x) => x.document);
    const names = (await readdir(this.root)).filter((x) =>
      /^[\w-]+\.json$/.test(x),
    );
    return Promise.all(
      names.map((x) =>
        readFile(path.join(this.root, x), "utf8").then(JSON.parse),
      ),
    );
  }
  async mutate(id, change) {
    const previous = this.locks.get(id) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const record = await this.get(id);
        if (!record) throw new WorkerError(404, "Run not found.");
        await change(record);
        record.job.updatedAt = new Date().toISOString();
        await this.save(record);
        return record;
      });
    this.locks.set(id, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(id) === next) this.locks.delete(id);
    }
  }
  async withCreateLock(operation) {
    if (!this.pool) return operation();
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1)", [240918707]);
      return await operation();
    } finally {
      await client
        .query("SELECT pg_advisory_unlock($1)", [240918707])
        .catch(() => {});
      client.release();
    }
  }
  async close() {
    if (this.queueLease) {
      await this.queueLease
        .query("SELECT pg_advisory_unlock($1)", [240918708])
        .catch(() => {});
      this.queueLease.release();
      this.queueLease = null;
    }
    await this.pool?.end();
  }
}
export class ArtifactStore {
  constructor(env = process.env) {
    this.root = path.resolve(env.TWIN_DATA_DIR || ".data", "artifacts");
    this.bucket = env.TWIN_S3_BUCKET;
    this.s3 = this.bucket
      ? new S3Client({
          region: env.TWIN_S3_REGION || "us-east-1",
          endpoint: env.TWIN_S3_ENDPOINT || undefined,
          forcePathStyle: env.TWIN_S3_FORCE_PATH_STYLE === "true",
        })
      : null;
    this.supabase =
      !this.s3 && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
        ? {
            url: env.SUPABASE_URL.replace(/\/$/, ""),
            secret: env.SUPABASE_SERVICE_ROLE_KEY,
            bucket: env.TWIN_SUPABASE_STORAGE_BUCKET || "twin-artifacts",
          }
        : null;
  }
  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }
  key(jobId, artifactId) {
    if (!validId(jobId) || !validId(artifactId))
      throw new WorkerError(404, "Evidence not found.");
    return `${jobId}/${artifactId}`;
  }
  async put(jobId, artifactId, bytes, mimeType) {
    const key = this.key(jobId, artifactId);
    if (this.s3)
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: mimeType,
          ServerSideEncryption: "AES256",
        }),
      );
    else if (this.supabase) {
      const response = await fetch(
        `${this.supabase.url}/storage/v1/object/${this.supabase.bucket}/${key}`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${this.supabase.secret}`,
            apikey: this.supabase.secret,
            "Content-Type": mimeType,
            "x-upsert": "false",
          },
          body: bytes,
        },
      );
      if (!response.ok)
        throw new WorkerError(
          503,
          "Private evidence storage is unavailable. Apply the storage migration and check worker credentials.",
        );
    } else {
      const dir = path.join(this.root, jobId);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(path.join(dir, artifactId), bytes, { mode: 0o600 });
    }
    return bytes.length;
  }
  async get(jobId, artifactId) {
    const key = this.key(jobId, artifactId);
    if (this.s3) {
      const result = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return Buffer.from(await result.Body.transformToByteArray());
    }
    if (this.supabase) {
      const response = await fetch(
        `${this.supabase.url}/storage/v1/object/authenticated/${this.supabase.bucket}/${key}`,
        {
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${this.supabase.secret}`,
            apikey: this.supabase.secret,
          },
        },
      );
      if (!response.ok)
        throw new WorkerError(404, "Private evidence not found.");
      return Buffer.from(await response.arrayBuffer());
    }
    return readFile(path.join(this.root, jobId, artifactId));
  }
  async size(jobId, artifactId) {
    return (await stat(path.join(this.root, this.key(jobId, artifactId)))).size;
  }
}
