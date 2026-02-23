
import { getStorage } from '../src/lib/store';

async function inspectKV() {
    try {
        const storage = getStorage();
        console.log('Using storage:', storage.constructor.name);

        const allBriefs = await storage.getAllBriefs(10);
        console.log('--- Recent Briefs ---');
        allBriefs.forEach(b => {
            console.log(`Date: ${b.date}, Total Issues: ${b.totalIssues}`);
            if (b.issues.length > 0) {
                console.log(`Sample Headline: ${b.issues[0].headline}`);
            }
        });

        const aiFeb22 = await storage.getBriefByDate('2026-02-22');
        if (aiFeb22) {
            console.log('--- AI Brief 2026-02-22 Content ---');
            console.log(JSON.stringify(aiFeb22, null, 2).slice(0, 1000));
        } else {
            console.log('AI Brief 2026-02-22 not found.');
        }

    } catch (e) {
        console.error('Inspection failed:', e);
    }
}

inspectKV();
