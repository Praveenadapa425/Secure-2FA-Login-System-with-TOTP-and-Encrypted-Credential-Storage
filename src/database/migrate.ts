import fs from 'fs';
import path from 'path';
import { pool } from './pool';

export async function runMigrations(): Promise<void> {
  let retries = 5;
  let client;

  while (retries > 0) {
    try {
      client = await pool.connect();
      break;
    } catch (err) {
      retries -= 1;
      console.log(`Database connection attempt failed (${retries} retries left):`, (err as Error).message);
      if (retries === 0) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!client) {
    throw new Error('Could not acquire database client for migrations.');
  }

  try {
    // Create migrations table if it does not exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationsDir = path.join(__dirname, '../../migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const res = await client.query('SELECT name FROM migrations WHERE name = $1', [file]);
      if (res.rows.length === 0) {
        console.log(`Applying migration: ${file}`);
        const sqlPath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(sqlPath, 'utf8');

        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Migration ${file} applied successfully.`);
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration execution error:', err);
      process.exit(1);
    });
}
