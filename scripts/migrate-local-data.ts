
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { saveBrief } from '../src/lib/store';
import { BriefReport } from '../src/types';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function migrate() {
    console.log('Starting data migration from local to Redis...');

    const dataDir = path.join(process.cwd(), 'data', 'briefs');

    try {
        const files = await fs.readdir(dataDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        console.log(`Found ${jsonFiles.length} files to migrate.`);

        for (const file of jsonFiles) {
            try {
                const filePath = path.join(dataDir, file);
                const content = await fs.readFile(filePath, 'utf-8');
                const brief = JSON.parse(content) as BriefReport;

                console.log(`Migrating: ${brief.date} (${brief.id})...`);
                await saveBrief(brief);
                console.log(`Successfully migrated: ${brief.date}`);
            } catch (err) {
                console.error(`Failed to migrate ${file}:`, err);
            }
        }

        console.log('Migration completed!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
