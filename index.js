require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("FATAL ERROR: Could not find GEMINI_API_KEY. Make sure your .env file is correct.");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: apiKey });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fileToGenerativePart(filePath, mimeType) {
    if (!fs.existsSync(filePath)) return null;
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
            mimeType
        },
    };
}

function loadCsvToMap(filePath, keyField) {
    return new Promise((resolve, reject) => {
        const map = {};
        if (!fs.existsSync(filePath)) {
            console.warn(`Warning: ${filePath} not found. Returning empty map.`);
            return resolve(map);
        }
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => { map[row[keyField]] = row; })
            .on('end', () => resolve(map))
            .on('error', reject);
    });
}

// NEW: Helper to find which messages we already processed
function getProcessedMessageIds(filePath) {
    return new Promise((resolve) => {
        const processedIds = new Set();
        if (!fs.existsSync(filePath)) return resolve(processedIds);
        
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => { 
                if (row.message_id) processedIds.add(row.message_id); 
            })
            .on('end', () => resolve(processedIds));
    });
}

async function processMessages() {
    console.log("Loading context databases...");
    
    const usersMap = await loadCsvToMap('./dataset/users.csv', 'user_id');
    const groupsMap = await loadCsvToMap('./dataset/groups.csv', 'group_id');
    const businessesMap = await loadCsvToMap('./dataset/business_accounts.csv', 'business_id'); 
    
    const allMessages = Object.values(await loadCsvToMap('./dataset/messages.csv', 'message_id'));
    
    // NEW: Check output.csv and filter out messages we already finished
    const processedIds = await getProcessedMessageIds('./output.csv');
    const messagesToProcess = allMessages.filter(msg => !processedIds.has(msg.message_id));
    
    console.log(`Dataset has ${allMessages.length} messages.`);
    console.log(`Already processed ${processedIds.size}. Remaining to process: ${messagesToProcess.length}`);

    if (messagesToProcess.length === 0) {
        console.log("All messages processed! Run node evaluate.js now.");
        return;
    }

    // If we are appending, we don't want to overwrite the file, so we use append flag
    const results = [];
    const csvWriter = createObjectCsvWriter({
        path: './output.csv',
        header: [
            { id: 'message_id', title: 'message_id' },
            { id: 'decision', title: 'decision' },
            { id: 'reason', title: 'reason' }
        ],
        append: fs.existsSync('./output.csv') 
    });

    for (const msg of messagesToProcess) {
        console.log(`Processing message ID: ${msg.message_id}...`);
        
        const receiver = usersMap[msg.receiver_id] || {};
        const group = msg.group_id ? (groupsMap[msg.group_id] || {}) : null;
        const business = msg.sender_id ? (businessesMap[msg.sender_id] || {}) : null;

        let promptText = `Analyze the following WhatsApp message context and determine the routing decision.\n\n`;
        promptText += `Message ID: ${msg.message_id}\n`;
        promptText += `Receiver Preferences: ${JSON.stringify(receiver)}\n`;
        if (group) promptText += `Group Context: ${JSON.stringify(group)}\n`;
        if (business) promptText += `Business Context (Sender): ${JSON.stringify(business)}\n`;
        promptText += `\nMessage Text: "${msg.text || 'No text provided'}"\n`;

        const contents = [promptText];
        if (msg.image_path) {
            const imagePart = fileToGenerativePart(msg.image_path, "image/jpeg");
            if (imagePart) contents.push(imagePart);
        }
        if (msg.audio_path) {
            const audioPart = fileToGenerativePart(msg.audio_path, "audio/mp3");
            if (audioPart) contents.push(audioPart);
        }

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash', 
                contents: contents,
                config: {
                    systemInstruction: `You are an AI-powered WhatsApp Message Router. 
                    Your job is to read the context, text, and media of a message to route it for the receiving user.
                    Rules:
                    1. 'notify': Important, urgent, direct mentions, or trusted critical alerts. Interruption is justified.
                    2. 'digest': Useful but not urgent. Promotional materials from trusted brands, community updates.
                    3. 'mute': Low-value noise, repetitive spam, suspicious links, unknown sender promotions, or safety risks.
                    Personalize your decision based on the receiver's data.`,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            message_id: { type: "STRING" },
                            decision: { type: "STRING", enum: ["notify", "digest", "mute"] },
                            reason: { type: "STRING" }
                        },
                        required: ["message_id", "decision", "reason"]
                    }
                }
            });

            const jsonOutput = JSON.parse(response.text);
            const record = {
                message_id: msg.message_id,
                decision: jsonOutput.decision,
                reason: jsonOutput.reason
            };
            
            // Write immediately so we don't lose progress if it crashes
            await csvWriter.writeRecords([record]);

            const logEntry = `--- Message ID: ${msg.message_id} ---\nDecision: ${jsonOutput.decision}\nReason: ${jsonOutput.reason}\n\n`;
            fs.appendFileSync('log.txt', logEntry);
            
            await sleep(13000); 
            
        } catch (error) {
            console.error(`Error processing message ${msg.message_id}:`, error.message);
            
            if (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED')) {
                console.log('--- DAILY RATE LIMIT REACHED ---');
                console.log('You have exhausted your API quota for this key. Swap the key in .env and run node index.js again to resume.');
                process.exit(1); 
            } else {
                await csvWriter.writeRecords([{ message_id: msg.message_id, decision: "digest", reason: "Fallback due to API error" }]);
                await sleep(5000); 
            }
        }
    }
    console.log('Successfully completed processing all remaining messages!');
}

processMessages();