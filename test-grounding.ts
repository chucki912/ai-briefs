
import { GoogleGenerativeAI } from '@google/generative-ai';

async function testGrounding() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

    // User explicitly requested gemini-3-pro-preview
    const modelName = 'gemini-3-pro-preview';

    console.log(`Testing Google Search Grounding with ${modelName}...`);

    const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{ googleSearch: {} } as any],
    });

    const prompt = 'What are the latest updates on OpenAI o3 model? Summarize the key features today.';

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        console.log('Response Text:', response.text());
        console.log('Grounding Metadata:', JSON.stringify(response.candidates?.[0]?.groundingMetadata, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testGrounding();
