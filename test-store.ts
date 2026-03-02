import { getBriefByDate } from './src/lib/store';
getBriefByDate('2026-03-02').then(res => {
    console.log("RES:", res ? "FOUND" : "NOT FOUND");
    if (res && res.issues.length > 0) {
        console.log(JSON.stringify(res.issues[0], null, 2));
    }
}).catch(console.error);
