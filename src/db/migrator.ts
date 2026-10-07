import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import pg from 'pg';

// Like Kysely's FileMigrationProvider, but imports via file:// URLs so absolute
// Windows paths (C:\...) work with Node's ESM loader.
class EsmFileMigrationProvider implements MigrationProvider {
  constructor(private readonly migrationFolder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {};
    const files = await fs.readdir(this.migrationFolder);

    for (const fileName of files) {
      if (!/\.(ts|js|mjs|mts)$/.test(fileName) || fileName.endsWith('.d.ts')) {
        continue;
      }
      const fileUrl = pathToFileURL(path.join(this.migrationFolder, fileName));
      const migration = await import(fileUrl.href);
      migrations[fileName.replace(/\.[^.]+$/, '')] = migration;
    }

    return migrations;
  }
}

async function migrate() {
  const db = new Kysely<any>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: Number(process.env.POSTGRES_PORT) || 5432,
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        database: process.env.POSTGRES_DB || 'module07assignment',
      }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new EsmFileMigrationProvider(
      path.join(import.meta.dirname, 'migrations')
    ),
  });

  const direction = process.argv[2];
  const { error, results } =
    direction === 'down'
      ? await migrator.migrateDown()
      : await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === 'Error') {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error('failed to migrate');
    console.error(error);
    await db.destroy();
    process.exit(1);
  }

  await db.destroy();
}

migrate();
