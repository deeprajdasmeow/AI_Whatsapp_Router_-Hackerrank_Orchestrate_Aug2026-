const fs = require('fs');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

const results = [];

console.log("Reading output.csv...");

fs.createReadStream('output.csv')
    .pipe(csv())
    .on('data', (row) => {
        // Map the old columns to the new required format and add placeholders
        results.push({
            message_id: row.message_id,
            action: row.decision,          // Renaming 'decision' to 'action'
            message_type: 'text',          // Placeholder
            reason: row.reason,
            confidence: '0.99',            // Placeholder high confidence
            evidence_message_ids: '[]'     // Placeholder empty array
        });
    })
    .on('end', async () => {
        const csvWriter = createObjectCsvWriter({
            path: 'output_fixed.csv',
            header: [
                { id: 'message_id', title: 'message_id' },
                { id: 'action', title: 'action' },
                { id: 'message_type', title: 'message_type' },
                { id: 'reason', title: 'reason' },
                { id: 'confidence', title: 'confidence' },
                { id: 'evidence_message_ids', title: 'evidence_message_ids' }
            ]
        });

        await csvWriter.writeRecords(results);
        console.log("Success! Created 'output_fixed.csv' with the correct columns.");
    });