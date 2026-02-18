
import { checkDuplicateIssues, calculateSimilarity, checkGeminiConnection } from '../src/lib/gemini';
import { IssueItem } from '../src/types';

// Mock History
const history: IssueItem[] = [
    {
        headline: "OpenAI Announces GPT-5 Release Date",
        keyFacts: ["Release in late 2025", "Focus on reasoning", "Multimodal capabilities"],
        insight: "Big impact on AI industry",
        framework: "Technology",
        sources: ["https://techcrunch.com/openai-gpt5", "https://theverge.com/openai-announcement"]
    },
    {
        headline: "NVIDIA Stock Hits All-Time High",
        keyFacts: ["Reached $1000", "AI chip demand surge", "Data center revenue up"],
        insight: "Hardware dominance continues",
        framework: "Market",
        sources: ["https://cnbc.com/nvidia-stock", "https://bloomberg.com/nvidia-earnings"]
    }
];

// Test Cases
const testCases: { name: string, issue: IssueItem, expected: boolean }[] = [
    {
        name: "Completely New Issue",
        issue: {
            headline: "Meta Releases Llama 4",
            keyFacts: ["Open source", "100B params", "Better coding"],
            insight: "Open source models catching up",
            framework: "Technology",
            sources: ["https://meta.ai/llama4"]
        },
        expected: false
    },
    {
        name: "Duplicate by Source (Exact Match)",
        issue: {
            headline: "OpenAI GPT-5 is coming",
            keyFacts: [],
            insight: "",
            framework: "Technology",
            sources: ["https://techcrunch.com/openai-gpt5"]
        },
        expected: true
    },
    {
        name: "Duplicate by Headline Similarity",
        issue: {
            headline: "NVIDIA Stock Reaches Record Highs",
            keyFacts: [],
            insight: "",
            framework: "Market",
            sources: ["https://reuters.com/nvidia"] // Different source but same headline
        },
        expected: true
    },
    {
        name: "No Duplicate (Different Headline, Different Source)",
        issue: {
            headline: "Google DeepMind unveils new robot",
            keyFacts: [],
            insight: "",
            framework: "Technology",
            sources: ["https://wired.com/google-robot"]
        },
        expected: false
    }
];

async function runTests() {
    console.log("Starting Deduplication Logic Verification...\n");

    const isConnected = await checkGeminiConnection();
    if (!isConnected) {
        console.error("FATAL: Gemini API Connection Failed. Check your API Key.");
    } else {
        console.log("Gemini API Connection Verified.\n");
    }

    for (const test of testCases) {
        const result = await checkDuplicateIssues(test.issue, history);
        const pass = result === test.expected;
        const status = pass ? 'PASS' : 'FAIL';
        console.log(`[${status}] ${test.name}`);

        if (!pass) {
            console.log(`  Expected: ${test.expected}, Got: ${result}`);
            if (test.name === "Duplicate by Headline Similarity") {
                const sim = calculateSimilarity(test.issue.headline, history[1].headline);
                console.log(`  Similarity Score: ${sim}`);
            }
        }
    }
}

runTests();
