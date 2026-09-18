import app from './app';
import { config } from './config/env';
import { runMigrations } from './database/migrate';
import { seedDatabase } from './database/seed';

async function startServer() {
  try {
    console.log('Running database migrations...');
    await runMigrations();
    console.log('Database migrations complete.');

    console.log('Seeding evaluation data...');
    await seedDatabase();

    app.listen(config.port, () => {
      console.log(`Server listening on port ${config.port} in ${config.nodeEnv} mode.`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
